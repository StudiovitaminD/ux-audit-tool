import {
  QUESTION_BANK_VERSION,
  getSelectedBucketQuestions,
} from "@/lib/question-bank";

export type AuditSelectOption = { label: string; value: string };
export type AuditAccessMode =
  | "auto_login"
  | "manual_browser_login"
  | "use_saved_session"
  | "internal_routes_only"
  | "screenshot_upload_only"
  | "browser_extension_capture";

export type UploadedScreenshotLabel =
  | "login"
  | "dashboard"
  | "navigation"
  | "data_grid"
  | "form"
  | "error_state"
  | "empty_state"
  | "loading_state"
  | "report"
  | "settings"
  | "mobile"
  | "other";

export type UploadedVideo = {
  name: string;
  type: string;
  size: number;
  url: string;
  publicId?: string;
  width?: number | null;
  height?: number | null;
  format?: string;
  resourceType?: string;
};

export type GuidedActionType =
  | "login"
  | "goto"
  | "click"
  | "select"
  | "fill"
  | "wait"
  | "screenshot"
  | "keyboard"
  | "mobile_test"
  | "zoom_test"
  | "error_test";

export type GuidedCaptureStep = {
  stepName: string;
  actionType: GuidedActionType;
  targetText: string;
  targetSelector: string;
  thenClickText: string;
  expectedUrlContains: string;
  expectedText: string;
  expectedHeading: string;
  expectedEvidence: string;
  screenshotType: string;
  required: boolean;
};

export type ProductType = "saas" | "ecommerce" | "marketing_website" | "";
// UPDATED: contexts vary by primary type (kept flexible for future additions)
export type ProductContext = string;
export type AuditUserAccess = {
  userId: string;
  email: string;
  role: "free" | "paid" | "admin";
  plan: "free" | "paid";
  reportAccessLevel: "free_preview" | "full";
  lockedSections: string[];
  modelTier: string;
  reportsUsed: number;
  reportLimit: number;
};

export type SaasIntake = {
  pricingModel: string;
  mainJobToBeDone: string;
  coreFeature: string;
  keyIntegrations: string;
};

export type EcommerceIntake = {
  // legacy (no longer used by UI; kept for compatibility if needed)
  catalogSize?: string;
  averageOrderValue?: string;
  shippingRegions?: string;
  returnsPolicyUrl?: string;
};

export type MarketingWebsiteIntake = {
  // legacy (no longer used by UI; kept for compatibility if needed)
  primaryCta?: string;
  trafficSources?: string[];
  funnelStage?: string;
  keyOffer?: string;
};

export type AuditPayload = {
  productName: string;
  // ADDED
  productOneLiner: string;
  // ADDED (SaaS only)
  frequencyOfUse: string;
  // ADDED (user/business)
  primaryUserIntent: string;
  // ADDED (user/business demographics)
  userAge: string;
  // ADDED (user/business demographics)
  userGender: string;
  // ADDED (user/business demographics)
  userGeography: string;
  // ADDED (user/business demographics)
  userLanguage: string;
  // ADDED (user/business)
  userPersona: string[]; // UPDATED
  // ADDED (user/business)
  primaryBusinessObjective: string;
  // ADDED (user/business)
  businessCompetitors: Array<{ name: string; url: string; compareFocus: string }>;
  // ADDED (user/business)
  businessFutureGoals: string;
  productUrl: string;
  auth: {
    requiresLogin: boolean;
    usernameOrEmail: string;
    password: string;
  };
  accessMode: AuditAccessMode;
  product: {
    type: ProductType;
    context: ProductContext[];
  };
  // ADDED (n8n intake alignment)
  primaryUser: string;
  // ADDED (n8n intake alignment)
  primaryUserGoal: string;
  // UPDATED
  dynamic_answers: {
    saas: {
      // SaaS Module (Q11–Q19)
      q11_first_5_min_steps?: string;
      q12_aha_moment?: string;
      q13_dropoff_problem?: string;
      q14_pricing_model?: string;
      q15_dashboard_purpose?: string;
      q16_solo_or_collab?: string;
      q17_top_features_loved?: string;
      q18_top_frustrations?: string;
      q19_design_system_level?: string;
    };
    ecommerce: {
      store_stage?: string;
      // E-commerce Module (Q11–Q19)
      q11_aov_and_best_seller?: string;
      q12_dropoff_step?: string;
      q13_discovery_method?: string;
      q14_guest_checkout?: string;
      q15_trust_concerns?: string;
      q16_returns_policy?: string;
      q17_social_proof?: string;
      q18_top_frustrations?: string;
      q19_mobile_importance?: string;
    };
    marketing: {
      // ADDED
      site_goal?: string;
      // Website Module (Q11–Q19)
      q11_primary_action?: string;
      q12_ideal_visitor?: string;
      q13_traffic_sources?: string;
      q14_objections?: string;
      q15_pricing_shown?: string;
      q16_social_proof?: string;
      q17_site_structure?: string;
      q18_top_non_convert_reasons?: string;
      q19_mobile_tested?: string;
    };
  };
  primaryPlatform: string;
  productStage: string;
  competitors: Array<{ name: string; url: string }>;
  differentiation: string;
  auditGoals: string[];
  // ADDED (n8n intake alignment)
  selectedBuckets: string[];
  // ADDED (n8n intake alignment)
  knownProblem: string;
  // ADDED (n8n intake alignment)
  constraints: string;
  // ADDED
  artifacts: {
    screenshots: Array<{
      name: string;
      type: string;
      size: number;
      url: string;
      label?: UploadedScreenshotLabel;
      publicId?: string;
      width?: number | null;
      height?: number | null;
      format?: string;
      resourceType?: string;
    }>;
    criticalFlowVideo: UploadedVideo | null;
    loomLink: string;
    notes: string;
    extensionCaptureJson: string;
  };
  guidedCaptureSteps: GuidedCaptureStep[];
  internalRoutesText: string;
  auditFlowText: string;
  auditFlows: string[];
  userAccess: AuditUserAccess;
};

export type AuditReport = unknown;

export const AUDIT_DEFAULTS: AuditPayload = {
  productName: "",
  productOneLiner: "",
  frequencyOfUse: "",
  primaryUserIntent: "",
  userAge: "",
  userGender: "",
  userGeography: "",
  userLanguage: "",
  userPersona: [""], // UPDATED
  primaryBusinessObjective: "",
  businessCompetitors: [
    { name: "", url: "", compareFocus: "" },
    { name: "", url: "", compareFocus: "" },
    { name: "", url: "", compareFocus: "" },
  ],
  businessFutureGoals: "",
  productUrl: "",
  auth: {
    requiresLogin: false,
    usernameOrEmail: "",
    password: "",
  },
  accessMode: "auto_login",
  product: {
    type: "",
    context: [],
  },
  primaryUser: "",
  primaryUserGoal: "",
  // UPDATED
  dynamic_answers: {
    saas: {},
    ecommerce: {},
    marketing: {},
  },
  primaryPlatform: "",
  productStage: "",
  competitors: [
    { name: "", url: "" },
    { name: "", url: "" },
    { name: "", url: "" },
  ],
  differentiation: "",
  auditGoals: [],
  selectedBuckets: [],
  knownProblem: "",
  constraints: "",
  artifacts: {
    screenshots: [],
    criticalFlowVideo: null,
    loomLink: "",
    notes: "",
    extensionCaptureJson: "",
  },
  guidedCaptureSteps: [
    {
      stepName: "",
      actionType: "click",
      targetText: "",
      targetSelector: "",
      thenClickText: "",
      expectedUrlContains: "",
      expectedText: "",
      expectedHeading: "",
      expectedEvidence: "",
      screenshotType: "",
      required: true,
    },
  ],
  internalRoutesText: "",
  auditFlowText: "",
  auditFlows: [""],
  userAccess: {
    userId: "",
    email: "",
    role: "free",
    plan: "free",
    reportAccessLevel: "free_preview",
    lockedSections: [],
    modelTier: "paid_full",
    reportsUsed: 0,
    reportLimit: 3,
  },
};

function parseAuditFlowText(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[\).\-\s]+|[-*•]\s*)/, "").trim())
    .filter(Boolean);
}

function parseInternalRoutesText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith("/"));
}

function parseExpectedEvidenceText(value: string) {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toWebhookPayload(payload: AuditPayload) {
  const productType = payload.product.type;
  // UPDATED
  const productDynamicAnswers =
    productType === "saas"
      ? payload.dynamic_answers.saas
      : productType === "ecommerce"
        ? payload.dynamic_answers.ecommerce
        : productType === "marketing_website"
          ? payload.dynamic_answers.marketing
          : null;

  const primaryPlatformLabel =
    payload.primaryPlatform === "desktop"
      ? "Desktop"
      : payload.primaryPlatform === "mobile_web"
        ? "Mobile web"
        : payload.primaryPlatform === "desktop_and_mobile_web"
          ? "Desktop + Mobile web"
          : payload.primaryPlatform === "android"
            ? "Android"
            : payload.primaryPlatform === "ios"
              ? "iOS"
              : payload.primaryPlatform === "android_and_ios"
                ? "Android + iOS"
                : payload.primaryPlatform || "";

  const businessCompetitorsText = payload.businessCompetitors
    .filter((c) => c.name.trim() || c.url.trim() || c.compareFocus.trim())
    .map((c) => {
      const base = c.url.trim()
        ? `${c.name.trim()} — ${c.url.trim()}`
        : c.name.trim();
      const focus = c.compareFocus.trim()
        ? ` (Compare: ${c.compareFocus.trim()})`
        : "";
      return `${base}${focus}`.trim();
    })
    .filter(Boolean)
    .join("\n");

  const competitorsText = payload.competitors
    .filter((c) => c.name.trim() || c.url.trim())
    .map((c) => (c.url.trim() ? `${c.name.trim()} — ${c.url.trim()}` : c.name.trim()))
    .filter(Boolean)
    .join("\n");
  const competitorsMerged = [businessCompetitorsText, competitorsText]
    .filter(Boolean)
    .join("\n");

  const customAuditGoal =
    payload.auditGoals.find((goal) => goal.startsWith("custom:"))?.replace(/^custom:\s*/i, "") ||
    "";
  const normalizedAuditGoals = payload.auditGoals
    .map((goal) => goal.replace(/^custom:\s*/i, "").trim())
    .filter(Boolean);
  const auditFlowText = payload.auditFlowText.trim();
  const internalRoutes = parseInternalRoutesText(payload.internalRoutesText);
  const guidedCaptureSteps = payload.guidedCaptureSteps
    .map((step) => ({
      stepName: step.stepName.trim(),
      actionType: step.actionType,
      targetText: step.targetText.trim(),
      targetSelector: step.targetSelector.trim(),
      thenClickText: step.thenClickText.trim(),
      expectedUrlContains: step.expectedUrlContains.trim(),
      expectedText: step.expectedText.trim(),
      expectedHeading: step.expectedHeading.trim(),
      expectedEvidence: parseExpectedEvidenceText(step.expectedEvidence),
      screenshotType: step.screenshotType.trim(),
      required: Boolean(step.required),
    }))
    .filter(
      (step) =>
        step.stepName ||
        step.targetText ||
        step.targetSelector ||
        step.expectedText ||
        step.expectedHeading ||
        step.expectedUrlContains ||
        step.screenshotType,
    );
  const auditFlows = (
    auditFlowText ? parseAuditFlowText(auditFlowText) : payload.auditFlows
  )
    .map((f) => f.trim())
    .filter(Boolean);
  const normalizedAuditFlows =
    auditFlows.length > 0
      ? auditFlows
      : productType === "marketing_website" || productType === "ecommerce"
        ? ["Direct audit using URL"]
        : auditFlows;

  const stageKey =
    productType === "saas"
      ? "product_stage"
      : productType === "ecommerce"
        ? "store_status"
        : productType === "marketing_website"
          ? "site_situation"
          : "product_stage";

  const stageValue =
    productType === "saas"
      ? payload.productStage
      : productType === "ecommerce"
        ? (payload.dynamic_answers.ecommerce.store_stage ?? "")
        : productType === "marketing_website"
          ? (payload.dynamic_answers.marketing.site_goal ?? "")
          : payload.productStage;

  const userPersonaText = payload.userPersona
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n");

  const auditId = `audit_${Date.now()}`;
  const selectedBucketQuestions = getSelectedBucketQuestions(payload.selectedBuckets);

  // n8n workflow expects snake_case keys (see Parse & Validate Intake node)
  return {
    reportId: `draft_${crypto.randomUUID()}`,
    audit_id: auditId,
    submitted_at: new Date().toISOString(),
    product_name: payload.productName,
    product_url: payload.productUrl,
    product_type: payload.product.type,
    primary_platform: primaryPlatformLabel,
    [stageKey]: stageValue,
    primary_user: payload.primaryUser,
    // n8n requires this field; keep it filled even if UI doesn’t ask it explicitly
    primary_user_goal:
      payload.primaryUserGoal || payload.primaryUserIntent || userPersonaText,
    primary_user_intent: payload.primaryUserIntent || payload.productOneLiner,
    frequency_of_use: payload.frequencyOfUse,
    constraints: payload.constraints,
    audit_goal: normalizedAuditGoals,
    custom_audit_goal: customAuditGoal,
    competitors: competitorsMerged,
    differentiation: payload.differentiation,
    known_problem: payload.knownProblem || payload.artifacts.notes,
    audit_flows: normalizedAuditFlows,
    audit_flow_instructions: auditFlowText,
    guided_capture_steps: guidedCaptureSteps,
    internal_routes: internalRoutes,
    selected_buckets: payload.selectedBuckets,
    login_required: payload.auth.requiresLogin,
    login_email: payload.auth.usernameOrEmail,
    login_password: payload.auth.password,
    access_mode: payload.accessMode,

    // Extra fields (safe to ignore in workflow if unused)
    product_context: payload.product.context,
    artifacts: payload.artifacts,
    product_dynamic_answers: productDynamicAnswers,
    question_bank_version: QUESTION_BANK_VERSION,
    selected_bucket_questions: selectedBucketQuestions,
    // ADDED
    user_age: payload.userAge,
    // ADDED
    user_gender: payload.userGender,
    // ADDED
    user_geography: payload.userGeography,
    // ADDED
    user_language: payload.userLanguage,
    // ADDED
    user_persona: userPersonaText,
    user_access: {
      user_id: payload.userAccess.userId,
      user_email: payload.userAccess.email,
      user_role: payload.userAccess.role,
      plan_type: payload.userAccess.plan,
      report_access_level: payload.userAccess.reportAccessLevel,
      locked_sections: payload.userAccess.lockedSections,
      model_tier: payload.userAccess.modelTier,
      reports_used: payload.userAccess.reportsUsed,
      report_limit: payload.userAccess.reportLimit,
    },
  };
}
