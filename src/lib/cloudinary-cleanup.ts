import { createHash } from "node:crypto";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function collectCloudinaryPublicIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectCloudinaryPublicIds(item));
  if (!value || typeof value !== "object") return [];
  const rec = asRecord(value);
  if (!rec) return [];

  const ids: string[] = [];
  for (const [key, childValue] of Object.entries(rec)) {
    if (
      (key === "publicId" || key === "public_id" || key === "asset_id") &&
      typeof childValue === "string" &&
      childValue.trim()
    ) {
      ids.push(childValue.trim());
      continue;
    }
    ids.push(...collectCloudinaryPublicIds(childValue));
  }
  return ids;
}

export function cloudinarySignature(params: Record<string, string>, apiSecret: string) {
  const base = Object.entries(params)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${base}${apiSecret}`)
    .digest("hex");
}

export async function destroyCloudinaryAsset(
  publicId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = cloudinarySignature(
    {
      public_id: publicId,
      resource_type: "image",
      timestamp,
    },
    apiSecret,
  );

  const form = new FormData();
  form.set("public_id", publicId);
  form.set("api_key", apiKey);
  form.set("timestamp", timestamp);
  form.set("resource_type", "image");
  form.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: form,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !data) {
    const errorMessage = data && typeof data.error === "string" ? data.error : "Cloudinary asset deletion failed.";
    throw new Error(errorMessage);
  }

  const result = String(data.result || "");
  if (result !== "ok" && result !== "not found") {
    throw new Error(`Cloudinary delete failed: ${result}`);
  }
}
