import { type AuditPayload } from "@/lib/audit-types";

export const AUDIT_DRAFT_KEY = "ux_audit:draft_v1";
export const AUDIT_DRAFT_VERSION = 2;

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasNonEmptyStringArray(value: unknown) {
  return Array.isArray(value) && value.some((item) => asText(item).length > 0);
}

function hasMeaningfulCompetitors(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    return Boolean(asText(rec.name) || asText(rec.url) || asText(rec.compareFocus));
  });
}

function hasMeaningfulGuidedStep(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    return Boolean(
      asText(rec.stepName) ||
        asText(rec.targetText) ||
        asText(rec.targetSelector) ||
        asText(rec.thenClickText) ||
        asText(rec.expectedUrlContains) ||
        asText(rec.expectedText) ||
        asText(rec.expectedHeading) ||
        asText(rec.expectedEvidence) ||
        asText(rec.screenshotType) ||
        rec.required === false,
    );
  });
}

function hasMeaningfulDynamicAnswer(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.values(record).some((entry) => {
    if (!entry || typeof entry !== "object") return asText(entry).length > 0;
    return Object.values(entry as Record<string, unknown>).some((nested) => asText(nested).length > 0);
  });
}

export function hasMeaningfulAuditDraft(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<AuditPayload> & Record<string, unknown>;

  return Boolean(
    asText(draft.productName) ||
      asText(draft.productOneLiner) ||
      asText(draft.frequencyOfUse) ||
      asText(draft.primaryUserIntent) ||
      asText(draft.userAge) ||
      asText(draft.userGender) ||
      asText(draft.userGeography) ||
      asText(draft.userLanguage) ||
      asText(draft.primaryBusinessObjective) ||
      asText(draft.businessFutureGoals) ||
      asText(draft.productUrl) ||
      asText(draft.primaryUser) ||
      asText(draft.primaryUserGoal) ||
      asText(draft.differentiation) ||
      asText(draft.productStage) ||
      asText(draft.constraints) ||
      asText(draft.knownProblem) ||
      asText(draft.internalRoutesText) ||
      asText(draft.auditFlowText) ||
      asText(draft.artifacts?.loomLink) ||
      asText(draft.artifacts?.notes) ||
      asText(draft.artifacts?.extensionCaptureJson) ||
      hasNonEmptyStringArray(draft.userPersona) ||
      hasNonEmptyStringArray(draft.auditGoals) ||
      hasNonEmptyStringArray(draft.selectedBuckets) ||
      hasNonEmptyStringArray(draft.auditFlows) ||
      hasMeaningfulCompetitors(draft.businessCompetitors) ||
      hasMeaningfulCompetitors(draft.competitors) ||
      hasMeaningfulGuidedStep(draft.guidedCaptureSteps) ||
      Boolean(draft.product && typeof draft.product === "object" && Array.isArray(draft.product.context) && draft.product.context.length > 0) ||
      Boolean(
        draft.artifacts &&
          typeof draft.artifacts === "object" &&
          ((Array.isArray(draft.artifacts.screenshots) && draft.artifacts.screenshots.length > 0) ||
            Boolean(draft.artifacts.criticalFlowVideo?.url)),
      ) ||
      Boolean(draft.auth && typeof draft.auth === "object" && (asText(draft.auth.usernameOrEmail) || asText(draft.auth.password))) ||
      hasMeaningfulDynamicAnswer(draft.dynamic_answers),
  );
}

