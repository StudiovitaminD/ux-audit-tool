export const FIRESTORE_CHUNK_SIZE_BYTES = 700_000;

export function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseStoredIntake(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return asPlainRecord(parsed);
    } catch {
      return null;
    }
  }
  return asPlainRecord(value);
}

export function readStoredIntake(source: unknown): Record<string, unknown> | null {
  const rec = asPlainRecord(source);
  if (!rec) return null;
  if (typeof rec.intake_json === "string" && rec.intake_json.trim()) {
    return parseStoredIntake(rec.intake_json);
  }
  if (typeof rec.intake === "string" && rec.intake.trim()) {
    return parseStoredIntake(rec.intake);
  }
  if (rec.intake && typeof rec.intake === "object") return parseStoredIntake(rec.intake);
  if (rec.intake_blob && typeof rec.intake_blob === "object") {
    const blob = asPlainRecord(rec.intake_blob);
    const inlineJson = typeof blob?.json === "string" ? blob.json : null;
    if (inlineJson) return parseStoredIntake(inlineJson);
    const inlineContent = typeof blob?.content === "string" ? blob.content : null;
    if (inlineContent) return parseStoredIntake(inlineContent);
  }
  if (rec.intake_preview && typeof rec.intake_preview === "object") {
    return parseStoredIntake(rec.intake_preview);
  }
  return null;
}

function safeString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => safeString(item))
    .filter(Boolean);
}

function safeBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return null;
}

const oversizeFieldPrefixes = [
  "artifacts.",
  "screenshots",
  "screenshot",
  "dataurl",
  "data_url",
  "image",
  "video",
  "evidence",
  "raw",
  "base64",
  "blob",
  "transcript",
  "notes",
  "comments",
];

export function stripOversizedIntakeFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripOversizedIntakeFields(item));
  }
  if (!value || typeof value !== "object") return value;
  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(rec)) {
    const normalizedKey = key.toLowerCase();
    const shouldDrop = oversizeFieldPrefixes.some((prefix) => normalizedKey.includes(prefix));
    if (shouldDrop) continue;
    out[key] = stripOversizedIntakeFields(child);
  }
  return out;
}

export function estimateObjectBytes(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

export function chunkString(value: string, chunkSize = FIRESTORE_CHUNK_SIZE_BYTES) {
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks;
}

export function findLargestObjectKeys(value: unknown, path = "intake", limit = 10): Array<{ key: string; bytes: number }> {
  if (!value || typeof value !== "object") return [];
  const results: Array<{ key: string; bytes: number }> = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      results.push(...findLargestObjectKeys(item, `${path}[${index}]`, limit));
    });
    return results.slice(0, limit);
  }

  const rec = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(rec)) {
    const childPath = `${path}.${key}`;
    const bytes = estimateObjectBytes(child);
    if (bytes > 0) results.push({ key: childPath, bytes });
    if (child && typeof child === "object") {
      results.push(...findLargestObjectKeys(child, childPath, limit));
    }
  }
  return results.sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}

export function buildStoredIntakePreview(intake: Record<string, unknown>, options?: { submittedAt?: string; auditId?: string }) {
  const preview = {
    product_name: safeString(intake.product_name),
    product_url: safeString(intake.product_url),
    product_type: safeString(intake.product_type),
    primary_platform: safeString(intake.primary_platform),
    selected_buckets: safeStringArray(intake.selected_buckets),
    audit_goal: safeStringArray(intake.audit_goal),
    audit_flows: safeStringArray(intake.audit_flows),
    access_mode: safeString(intake.access_mode),
    login_required: safeBoolean(intake.login_required),
    login_email: safeString(intake.login_email),
    product_stage: safeString(intake.product_stage),
    primary_user: safeString(intake.primary_user),
    primary_user_goal: safeString(intake.primary_user_goal),
    known_problem: safeString(intake.known_problem),
    submitted_at: options?.submittedAt || "",
    audit_id: options?.auditId || "",
  };

  return stripOversizedIntakeFields(preview) as Record<string, unknown>;
}
