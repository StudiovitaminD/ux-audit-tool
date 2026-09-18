import { QUESTION_BANK, QUESTION_BANK_VERSION, normalizeBucketName } from "@/lib/question-bank";

export const AUDIT_SCOPE_VERSION = "phase-1-v1";

export type AuditScope = Readonly<{
  version: typeof AUDIT_SCOPE_VERSION;
  created_at: string;
  audit_id: string;
  product: Readonly<{
    name: string;
    url: string;
    type: string;
    primary_platform: string;
  }>;
  selected_buckets: readonly string[];
  question_bank_version: string;
  question_ids_by_bucket: Readonly<Record<string, readonly string[]>>;
  pages_and_flows: readonly string[];
  viewports: readonly string[];
  objectives: readonly string[];
  capture_requirements: Readonly<{
    access_mode: string;
    login_required: boolean;
    internal_routes: readonly string[];
    guided_steps_count: number;
  }>;
}>;

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
}

export function canonicalSelectedBuckets(values: unknown[]) {
  return uniqueStrings(values)
    .map(normalizeBucketName)
    .filter((bucket) => Boolean(QUESTION_BANK[bucket]?.length));
}

export function buildAuditScope(args: {
  auditId: string;
  createdAt?: string;
  productName: string;
  productUrl: string;
  productType: string;
  primaryPlatform: string;
  selectedBuckets: unknown[];
  pagesAndFlows?: unknown[];
  viewports?: unknown[];
  objectives?: unknown[];
  accessMode?: string;
  loginRequired?: boolean;
  internalRoutes?: unknown[];
  guidedStepsCount?: number;
}): AuditScope {
  const selectedBuckets = canonicalSelectedBuckets(args.selectedBuckets);
  const questionIdsByBucket = Object.fromEntries(
    selectedBuckets.map((bucket) => [
      bucket,
      Object.freeze(QUESTION_BANK[bucket].map((question) => question.id)),
    ]),
  );

  return Object.freeze({
    version: AUDIT_SCOPE_VERSION,
    created_at: args.createdAt || new Date().toISOString(),
    audit_id: args.auditId,
    product: Object.freeze({
      name: args.productName.trim(),
      url: args.productUrl.trim(),
      type: args.productType.trim(),
      primary_platform: args.primaryPlatform.trim(),
    }),
    selected_buckets: Object.freeze(selectedBuckets),
    question_bank_version: QUESTION_BANK_VERSION,
    question_ids_by_bucket: Object.freeze(questionIdsByBucket),
    pages_and_flows: Object.freeze(uniqueStrings(args.pagesAndFlows || [])),
    viewports: Object.freeze(uniqueStrings(args.viewports || [args.primaryPlatform])),
    objectives: Object.freeze(uniqueStrings(args.objectives || [])),
    capture_requirements: Object.freeze({
      access_mode: String(args.accessMode || "").trim(),
      login_required: Boolean(args.loginRequired),
      internal_routes: Object.freeze(uniqueStrings(args.internalRoutes || [])),
      guided_steps_count: Math.max(0, Math.floor(Number(args.guidedStepsCount) || 0)),
    }),
  });
}

