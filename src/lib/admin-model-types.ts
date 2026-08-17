export type AdminAuditModelChoice = "free" | "paid";

export const DEFAULT_ADMIN_AUDIT_MODEL_CHOICE: AdminAuditModelChoice = "paid";

export function normalizeAdminAuditModelChoice(value: unknown): AdminAuditModelChoice | null {
  if (value === "free" || value === "paid") return value;
  return null;
}

export function adminChoiceToModelTier(choice: AdminAuditModelChoice) {
  return choice === "free" ? "free_limited" : "paid_full";
}

export function adminChoiceFromModelTier(modelTier?: string | null): AdminAuditModelChoice {
  return modelTier === "free_limited" ? "free" : "paid";
}
