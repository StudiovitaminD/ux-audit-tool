import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  adminChoiceToModelTier,
  DEFAULT_ADMIN_AUDIT_MODEL_CHOICE,
  type AdminAuditModelChoice,
  normalizeAdminAuditModelChoice,
} from "@/lib/admin-model-types";

export {
  adminChoiceToModelTier,
  DEFAULT_ADMIN_AUDIT_MODEL_CHOICE,
  type AdminAuditModelChoice,
  normalizeAdminAuditModelChoice,
} from "@/lib/admin-model-types";

export const ADMIN_MODEL_SETTINGS_COLLECTION = "ux_app_settings";
export const ADMIN_MODEL_SETTINGS_DOC = "audit_model";

export async function loadAdminAuditModelChoice() {
  const db = getAdminFirestore();
  const snap = await db.collection(ADMIN_MODEL_SETTINGS_COLLECTION).doc(ADMIN_MODEL_SETTINGS_DOC).get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return (
    normalizeAdminAuditModelChoice(data.auditModelChoice) ||
    normalizeAdminAuditModelChoice(data.choice) ||
    DEFAULT_ADMIN_AUDIT_MODEL_CHOICE
  );
}

export async function saveAdminAuditModelChoice(choice: AdminAuditModelChoice, meta?: { updatedBy?: string }) {
  const db = getAdminFirestore();
  await db.collection(ADMIN_MODEL_SETTINGS_COLLECTION).doc(ADMIN_MODEL_SETTINGS_DOC).set(
    {
      auditModelChoice: choice,
      updatedBy: meta?.updatedBy || "",
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return choice;
}
