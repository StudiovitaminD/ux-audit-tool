import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { reportBelongsToSession, resolveReportSnapshot } from "@/lib/report-record";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const accountSession = await getAccountSessionFromRequest(req);
  if (!accountSession) {
    return Response.json({ error: "Please sign in first." }, { status: 401 });
  }

  const snap = await resolveReportSnapshot(id);
  if (!snap?.exists) return Response.json({ error: "Not found" }, { status: 404 });

  const data = (snap.data() ?? {}) as Record<string, unknown>;
  if (!reportBelongsToSession(data, accountSession)) {
    return Response.json({ error: "You do not have access to stop this report." }, { status: 403 });
  }

  const status = typeof data.status === "string" ? data.status : "";
  if (status === "complete") {
    return Response.json({ error: "Completed reports cannot be stopped." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const progress = asRecord(data.progress) ?? {};

  await getAdminFirestore()
    .collection("ux_audits")
    .doc(id)
    .set(
      {
        status: "cancelled",
        cancelledAt: now,
        cancelledReason: "user_requested",
        progress: {
          ...progress,
          currentStage: "cancelled",
          currentBucketName: null,
          currentBucketNumber: null,
          currentBucketStartedAt: null,
        },
      },
      { merge: true },
    );

  return Response.json({ ok: true, status: "cancelled" });
}
