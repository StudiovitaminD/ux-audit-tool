import { createHash } from "node:crypto";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

function toErrorMessage(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "error", "details", "detail", "reason"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) return nested.trim();
      if (nested && typeof nested === "object") {
        const nestedMessage = toErrorMessage(nested);
        if (nestedMessage) return nestedMessage;
      }
    }
    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}") return json;
    } catch {}
  }
  return "Cloudinary upload failed.";
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} env var`);
  return value;
}

function cloudinarySignature(params: Record<string, string>, apiSecret: string) {
  const base = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${base}${apiSecret}`)
    .digest("hex");
}

export async function POST(req: Request) {
  try {
    const session = await getAccountSessionFromRequest(req);
    if (!session) return Response.json({ error: "Please sign in first." }, { status: 401 });
    const rate = checkRateLimit(`upload:${session.id}`, 30, 60 * 60_000);
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const cloudName = requiredEnv("CLOUDINARY_CLOUD_NAME");
    const apiKey = requiredEnv("CLOUDINARY_API_KEY");
    const apiSecret = requiredEnv("CLOUDINARY_API_SECRET");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Missing file upload." }, { status: 400 });
    }

    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
    if (!allowedTypes.has(file.type)) {
      return Response.json({ error: "Unsupported file type." }, { status: 415 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return Response.json({ error: "File exceeds the 25 MB upload limit." }, { status: 413 });
    }

    const isVideo = file.type.startsWith("video/");
    const folder = isVideo ? "ux-audit-tool/videos" : "ux-audit-tool/screenshots";
    const resourceType = isVideo ? "video" : "image";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const uploadParams = {
      folder,
      timestamp,
    };
    const signature = cloudinarySignature(uploadParams, apiSecret);

    const cloudinaryForm = new FormData();
    cloudinaryForm.set("file", file);
    cloudinaryForm.set("api_key", apiKey);
    cloudinaryForm.set("timestamp", timestamp);
    cloudinaryForm.set("folder", folder);
    cloudinaryForm.set("signature", signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
      method: "POST",
      body: cloudinaryForm,
    });

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !data) {
      return Response.json(
        { error: toErrorMessage(data?.error || data || "Cloudinary upload failed.") },
        { status: 502 },
      );
    }

    return Response.json({
      url: String(data.secure_url || data.url || ""),
      publicId: String(data.public_id || ""),
      width: typeof data.width === "number" ? data.width : null,
      height: typeof data.height === "number" ? data.height : null,
      bytes: typeof data.bytes === "number" ? data.bytes : file.size,
      format: String(data.format || ""),
      resourceType: String(data.resource_type || "image"),
      originalFilename: String(data.original_filename || file.name),
    });
  } catch (error) {
    console.error("Screenshot upload failed:", error);
    return Response.json({ error: "Upload failed." }, { status: 500 });
  }
}
