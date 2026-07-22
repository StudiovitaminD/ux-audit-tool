import {
  collectCloudinaryPublicIds,
  destroyCloudinaryAsset,
} from "@/lib/cloudinary-cleanup";
import { resolveReportSnapshot } from "@/lib/report-record";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as unknown | null;
    const requestPayload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const ids = Array.isArray(requestPayload.ids)
      ? requestPayload.ids.filter((item) => typeof item === "string")
      : [];

    if (!ids.length) {
      return Response.json(
        { error: "No report ids provided.", deletedCount: 0, failedIds: [] },
        { status: 400 },
      );
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    const results = await Promise.all(
      ids.map(async (id) => {
        const snapshot = await resolveReportSnapshot(id);
        if (!snapshot?.exists) {
          return { id, ok: true, missing: true };
        }

        const data = snapshot.data() ?? {};
        const publicIds = Array.from(new Set(collectCloudinaryPublicIds(data)));
        const assetErrors: string[] = [];

        if (publicIds.length && cloudName && apiKey && apiSecret) {
          const assetResults = await Promise.allSettled(
            publicIds.map((publicId) => destroyCloudinaryAsset(publicId, cloudName, apiKey, apiSecret)),
          );
          for (const result of assetResults) {
            if (result.status === "rejected") {
              assetErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
            }
          }
        }

        try {
          await snapshot.ref.delete();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to delete report record.";
          return { id, ok: false, error: message };
        }

        if (assetErrors.length) {
          return { id, ok: false, error: `Deleted report but failed to clean up ${assetErrors.length} Cloudinary asset(s): ${assetErrors.join("; ")}` };
        }

        return { id, ok: true };
      }),
    );

    const deletedIds = results.filter((result) => result.ok).map((result) => result.id);
    const failedItems = results.filter((result) => !result.ok);

    return Response.json({
      deletedCount: deletedIds.length,
      deletedIds,
      failedIds: failedItems.map((item) => item.id),
      errors: failedItems.map((item) => item.error || "Unknown error"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete reports.";
    return Response.json({ error: message, deletedCount: 0, failedIds: [] }, { status: 500 });
  }
}
