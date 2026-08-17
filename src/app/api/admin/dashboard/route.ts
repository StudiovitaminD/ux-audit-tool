import { NextResponse } from "next/server";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { loadAdminDashboardData } from "@/lib/admin-dashboard-data";
import {
  DEFAULT_ADMIN_AUDIT_MODEL_CHOICE,
  normalizeAdminAuditModelChoice,
  saveAdminAuditModelChoice,
} from "@/lib/admin-model-settings";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getAccountSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await loadAdminDashboardData();
  return NextResponse.json({
    ...data,
  });
}

export async function POST(req: Request) {
  const session = await getAccountSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { auditModelChoice?: unknown } | null;
  const choice =
    normalizeAdminAuditModelChoice(body?.auditModelChoice) || DEFAULT_ADMIN_AUDIT_MODEL_CHOICE;

  await saveAdminAuditModelChoice(choice, { updatedBy: session.email });

  return NextResponse.json({ auditModelChoice: choice });
}
