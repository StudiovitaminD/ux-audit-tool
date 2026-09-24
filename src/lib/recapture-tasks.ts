import { recaptureKindForCriterion } from "@/lib/criterion-evidence-policy";

type RecordLike = Record<string, unknown>;

export type RecaptureTask = {
  id: string;
  bucket: string;
  questionId: string;
  question: string;
  targetUrl: string;
  kind: "form" | "keyboard" | "responsive" | "zoom" | "text_spacing" | "performance" | "interaction" | "motion" | "visual";
  instruction: string;
  requiresPermission: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildRecaptureTasks(args: {
  bucketResults: unknown[];
  productUrl: string;
  pageUrls?: string[];
  limit?: number;
}) {
  const product = new URL(args.productUrl);
  if (!["http:", "https:"].includes(product.protocol)) throw new Error("Invalid audited website URL.");
  const availableUrls = Array.from(new Set((args.pageUrls || []).filter((value) => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol)
        && url.hostname.replace(/^www\./, "") === product.hostname.replace(/^www\./, "")
        && url.port === product.port && !url.username && !url.password;
    } catch { return false; }
  })));
  if (!availableUrls.length) availableUrls.push(args.productUrl);
  const tasks: RecaptureTask[] = [];
  const seen = new Set<string>();

  for (const rawBucket of args.bucketResults) {
    const bucket = (rawBucket || {}) as RecordLike;
    const bucketName = text(bucket.bucket_name) || text(bucket.bucket) || "UX audit";
    const questions = Array.isArray(bucket.questions) ? bucket.questions : [];
    for (const rawQuestion of questions) {
      const question = (rawQuestion || {}) as RecordLike;
      const state = text(question.answer_state);
      const status = text(question.answer_status);
      if (status === "answered" && !["not_tested", "n_a"].includes(state)) continue;
      if (state === "n_a") continue;
      const questionId = text(question.id);
      if (!questionId || seen.has(`${bucketName}:${questionId}`)) continue;
      seen.add(`${bucketName}:${questionId}`);
      const questionText = text(question.question);
      const missing = Array.isArray(question.missing_evidence)
        ? question.missing_evidence.map(text).filter(Boolean).join("; ")
        : text(question.evidence) || text(question.observation);
      const kind = recaptureKindForCriterion(bucketName, questionId, `${questionText} ${missing}`);
      const formUrl = kind === "form" ? availableUrls.find((url) => {
        try { return /contact|enquir|inquir|register|signup|checkout|support/.test(new URL(url).pathname.toLowerCase()); }
        catch { return false; }
      }) : undefined;
      tasks.push({
        id: `${bucketName}:${questionId}`,
        bucket: bucketName,
        questionId,
        question: questionText,
        targetUrl: formUrl || availableUrls[tasks.length % availableUrls.length] || args.productUrl,
        kind,
        instruction: missing || `Capture direct evidence for: ${questionText}`,
        requiresPermission: kind === "form",
      });
      if (tasks.length >= (args.limit || 24)) return tasks;
    }
  }
  return tasks;
}

export function recaptureAffectedBuckets(tasks: RecaptureTask[]) {
  return Array.from(new Set(tasks.map((task) => task.bucket).filter(Boolean)));
}
