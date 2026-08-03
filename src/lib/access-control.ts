export type AppRole = "free" | "paid" | "admin";
export type PlanType = "free" | "paid";
export type ReportAccessLevel = "free_preview" | "full";
export type AuditProductType = "saas" | "ecommerce" | "marketing_website";
export type ModelTier = "free_limited" | "paid_full" | "admin_full";

export const FREE_AUDIT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
export const PAID_AUDIT_MODEL = "openai/gpt-4.1-mini";

export const FREE_REPORT_LIMIT = 3;

export const LOCKED_PREVIEW_PAGE_KEYS = [
  "narrative_summary",
  "ai_bucket_answers",
  "critical_findings",
  "quick_wins_roadmap",
] as const;

export function getAllowedProductTypes(role: AppRole): AuditProductType[] {
  if (role === "admin") return ["saas", "ecommerce", "marketing_website"];
  return ["ecommerce", "marketing_website"];
}

export function canAccessProductType(role: AppRole, productType: string) {
  return getAllowedProductTypes(role).includes(productType as AuditProductType);
}

export function getReportAccessLevel(plan: PlanType): ReportAccessLevel {
  return plan === "paid" ? "full" : "free_preview";
}

export function getLockedSectionsForAccess(level: ReportAccessLevel): string[] {
  if (level === "full") return [];
  return [...LOCKED_PREVIEW_PAGE_KEYS];
}

export function canCreateReport(args: {
  role: AppRole;
  reportsUsed: number;
  reportLimit?: number;
}) {
  const { role, reportsUsed, reportLimit = FREE_REPORT_LIMIT } = args;
  if (role === "admin") {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY };
  }

  const remaining = Math.max(0, reportLimit - reportsUsed);
  return { allowed: remaining > 0, remaining };
}

export function getModelTierForRole(role: AppRole, plan: PlanType): ModelTier {
  if (role === "admin") return "admin_full";
  return plan === "paid" ? "paid_full" : "free_limited";
}

export function getAuditModelForTier(modelTier?: string | null) {
  switch (modelTier) {
    case "paid_full":
    case "admin_full":
      return PAID_AUDIT_MODEL;
    case "free_limited":
    default:
      return FREE_AUDIT_MODEL;
  }
}
