import { AUDIT_DEFAULTS, type AuditPayload } from "@/lib/audit-types";
import { readStoredIntake } from "@/lib/intake-storage";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
}

function asBool(value: unknown) {
  return typeof value === "boolean" ? value : String(value).toLowerCase() === "true";
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function formatAuditFlowText(value: unknown) {
  const rows = asStringArray(value);
  return rows
    .map((row, index) => `${index + 1}. ${row}`)
    .join("\n");
}

function formatInternalRoutesText(value: unknown) {
  return asStringArray(value).join("\n");
}

function parseCompetitorLines(value: unknown) {
  const rows = asStringArray(value);
  const parsed = rows.map((row) => {
    const [namePart, urlPart] = row.split("—").map((item) => item.trim());
    const url = urlPart && /^https?:\/\//i.test(urlPart) ? urlPart : "";
    return { name: namePart || row, url };
  });

  while (parsed.length < 3) parsed.push({ name: "", url: "" });
  return parsed.slice(0, 3);
}

function normalizePlatform(value: unknown): AuditPayload["primaryPlatform"] {
  const platform = asString(value).toLowerCase();
  if (platform === "desktop") return "desktop";
  if (platform === "mobile web" || platform === "mobile_web") return "mobile_web";
  if (platform === "desktop + mobile web" || platform === "desktop_and_mobile_web") {
    return "desktop_and_mobile_web";
  }
  if (platform === "android") return "android";
  if (platform === "ios") return "ios";
  if (platform === "android + ios" || platform === "android_and_ios") return "android_and_ios";
  return "";
}

function normalizeStoredScreenshots(value: unknown): AuditPayload["artifacts"]["screenshots"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const rec = asRecord(item);
      const url = asString(rec?.url);
      if (!url) return null;
      return {
        name: asString(rec?.name) || "Screenshot",
        type: asString(rec?.type) || "image/*",
        size: Number(rec?.size) || 0,
        url,
        label: asString(rec?.label) || "other",
        publicId: asString(rec?.publicId),
        width: typeof rec?.width === "number" ? rec.width : null,
        height: typeof rec?.height === "number" ? rec.height : null,
        format: asString(rec?.format),
        resourceType: asString(rec?.resourceType) || "image",
      };
    })
    .filter(Boolean) as AuditPayload["artifacts"]["screenshots"];
}

function prefillFromFormPayload(value: unknown): AuditPayload | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const artifacts = asRecord(rec.artifacts) ?? {};

  return {
    ...AUDIT_DEFAULTS,
    ...rec,
    auth: {
      ...AUDIT_DEFAULTS.auth,
      ...(asRecord(rec.auth) ?? {}),
    },
    accessMode:
      (asString(rec.accessMode || rec.access_mode) as AuditPayload["accessMode"]) ||
      AUDIT_DEFAULTS.accessMode,
    product: {
      ...AUDIT_DEFAULTS.product,
      ...(asRecord(rec.product) ?? {}),
      context: asStringArray(asRecord(rec.product)?.context),
    },
    dynamic_answers: {
      saas: (asRecord(asRecord(rec.dynamic_answers)?.saas) ?? {}) as AuditPayload["dynamic_answers"]["saas"],
      ecommerce: (asRecord(asRecord(rec.dynamic_answers)?.ecommerce) ?? {}) as AuditPayload["dynamic_answers"]["ecommerce"],
      marketing: (asRecord(asRecord(rec.dynamic_answers)?.marketing) ?? {}) as AuditPayload["dynamic_answers"]["marketing"],
    },
    userPersona: asStringArray(rec.userPersona).length ? asStringArray(rec.userPersona) : [""],
    auditGoals: asStringArray(rec.auditGoals),
    selectedBuckets: asStringArray(rec.selectedBuckets),
    auditFlowText:
      asString(rec.auditFlowText) ||
      asString(rec.audit_flow_instructions) ||
      formatAuditFlowText(rec.auditFlows),
    auditFlows: asStringArray(rec.auditFlows).length ? asStringArray(rec.auditFlows) : [""],
    competitors: Array.isArray(rec.competitors)
      ? ((rec.competitors as unknown[]).map((item) => {
          const competitor = asRecord(item);
          return {
            name: asString(competitor?.name),
            url: asString(competitor?.url),
          };
        }) as AuditPayload["competitors"])
      : AUDIT_DEFAULTS.competitors,
    businessCompetitors: Array.isArray(rec.businessCompetitors)
      ? ((rec.businessCompetitors as unknown[]).map((item) => {
          const competitor = asRecord(item);
          return {
            name: asString(competitor?.name),
            url: asString(competitor?.url),
            compareFocus: asString(competitor?.compareFocus),
          };
        }) as AuditPayload["businessCompetitors"])
      : AUDIT_DEFAULTS.businessCompetitors,
    artifacts: {
      loomLink: asString(artifacts.loomLink || artifacts.loom_link),
      notes: asString(artifacts.notes),
      extensionCaptureJson: asString(artifacts.extensionCaptureJson),
      screenshots: normalizeStoredScreenshots(artifacts.screenshots),
      criticalFlowVideo:
        artifacts.criticalFlowVideo && typeof artifacts.criticalFlowVideo === "object"
          ? {
              name: asString((artifacts.criticalFlowVideo as Record<string, unknown>).name) || "Critical flow video",
              type: asString((artifacts.criticalFlowVideo as Record<string, unknown>).type) || "video/*",
              size: Number((artifacts.criticalFlowVideo as Record<string, unknown>).size) || 0,
              url: asString((artifacts.criticalFlowVideo as Record<string, unknown>).url),
              publicId: asString((artifacts.criticalFlowVideo as Record<string, unknown>).publicId),
              width:
                typeof (artifacts.criticalFlowVideo as Record<string, unknown>).width === "number"
                  ? Number((artifacts.criticalFlowVideo as Record<string, unknown>).width)
                  : null,
              height:
                typeof (artifacts.criticalFlowVideo as Record<string, unknown>).height === "number"
                  ? Number((artifacts.criticalFlowVideo as Record<string, unknown>).height)
                  : null,
              format: asString((artifacts.criticalFlowVideo as Record<string, unknown>).format),
              resourceType: asString((artifacts.criticalFlowVideo as Record<string, unknown>).resourceType) || "video",
            }
          : null,
    },
    guidedCaptureSteps: Array.isArray(rec.guidedCaptureSteps)
      ? (rec.guidedCaptureSteps as AuditPayload["guidedCaptureSteps"])
      : Array.isArray(rec.guided_capture_steps)
        ? (rec.guided_capture_steps as AuditPayload["guidedCaptureSteps"])
        : AUDIT_DEFAULTS.guidedCaptureSteps,
    internalRoutesText:
      asString(rec.internalRoutesText) ||
      formatInternalRoutesText(rec.internal_routes),
  };
}

export function prefillAuditPayload(source: unknown): AuditPayload {
  const root = asRecord(source) ?? {};
  const nestedReport = asRecord(root.report) ?? {};
  const rootIntake = readStoredIntake(root) ?? {};
  const nestedReportIntake = readStoredIntake(nestedReport) ?? {};
  const formPayload =
    prefillFromFormPayload(asRecord(root.form_payload)) ||
    prefillFromFormPayload(asRecord(rootIntake.form_payload)) ||
    prefillFromFormPayload(asRecord(nestedReportIntake.form_payload)) ||
    prefillFromFormPayload(asRecord(nestedReport.form_payload));
  if (formPayload) return formPayload;

  const report = { ...root, ...nestedReport };
  const intake = {
    ...rootIntake,
    ...nestedReportIntake,
  };
  const artifacts = {
    ...(asRecord(root.artifacts) ?? {}),
    ...(asRecord(report.artifacts) ?? {}),
    ...(asRecord(intake.artifacts) ?? {}),
  };

  const productType = (
    asString(intake.product_type) ||
    asString(report.product_type)
  ) as AuditPayload["product"]["type"];
  const dynamicAnswers =
    asRecord(intake.product_dynamic_answers) ??
    asRecord(report.product_dynamic_answers) ??
    {};
  const userPersona = asStringArray(intake.user_persona || report.user_persona);
  const auditFlows = asStringArray(intake.audit_flows || report.audit_flows);
  const auditFlowInstructions = asString(
    intake.audit_flow_instructions || report.audit_flow_instructions,
  );
  const guidedCaptureSteps = (intake.guided_capture_steps || report.guided_capture_steps) as
    | AuditPayload["guidedCaptureSteps"]
    | undefined;
  const internalRoutes = intake.internal_routes || report.internal_routes;
  const auditGoals = asStringArray(intake.audit_goal || report.audit_goal);
  const selectedBuckets = asStringArray(intake.selected_buckets || report.selected_buckets);
  const productContexts = asStringArray(intake.product_context || report.product_context);
  const competitors = asString(intake.competitors || report.competitors);
  const knownProblem = asString(intake.known_problem || report.known_problem);
  const differentiation = asString(intake.differentiation || report.differentiation);
  const constraints = asString(intake.constraints || report.constraints);
  const primaryUserIntent = asString(intake.primary_user_intent || report.primary_user_intent);
  const successMetric = asString(intake.success_metric || report.success_metric);
  const primaryUserGoal = asString(intake.primary_user_goal || report.primary_user_goal);
  const stageValue =
    asString(intake.product_stage) ||
    asString(intake.store_status) ||
    asString(intake.site_situation) ||
    asString(report.product_stage) ||
    asString(report.store_status) ||
    asString(report.site_situation);

  return {
    ...AUDIT_DEFAULTS,
    productName: asString(intake.product_name || report.product_name),
    productOneLiner: primaryUserIntent || primaryUserGoal || knownProblem,
    frequencyOfUse: asString(intake.frequency_of_use || report.frequency_of_use),
    primaryUserIntent: primaryUserIntent || primaryUserGoal,
    userAge: asString(intake.user_age || report.user_age),
    userGender: asString(intake.user_gender || report.user_gender),
    userGeography: asString(intake.user_geography || report.user_geography),
    userLanguage: asString(intake.user_language || report.user_language),
    userPersona: userPersona.length ? userPersona : [""],
    primaryBusinessObjective: successMetric,
    businessCompetitors: [
      { name: "", url: "", compareFocus: "" },
      { name: "", url: "", compareFocus: "" },
      { name: "", url: "", compareFocus: "" },
    ],
    businessFutureGoals: "",
    productUrl: asString(intake.product_url || report.product_url),
    auth: {
      requiresLogin: asBool(intake.login_required || report.login_required),
      usernameOrEmail: asString(intake.login_email || report.login_email),
      password: asString(intake.login_password || report.login_password),
    },
    accessMode:
      (asString(intake.access_mode || report.access_mode) as AuditPayload["accessMode"]) ||
      AUDIT_DEFAULTS.accessMode,
    product: {
      type: productType || "",
      context: productContexts,
    },
    primaryUser: asString(intake.primary_user || report.primary_user),
    primaryUserGoal,
    dynamic_answers: {
      saas: productType === "saas" ? (dynamicAnswers as AuditPayload["dynamic_answers"]["saas"]) : {},
      ecommerce:
        productType === "ecommerce"
          ? (dynamicAnswers as AuditPayload["dynamic_answers"]["ecommerce"])
          : {},
      marketing:
        productType === "marketing_website"
          ? (dynamicAnswers as AuditPayload["dynamic_answers"]["marketing"])
          : {},
    },
    primaryPlatform: normalizePlatform(intake.primary_platform || report.primary_platform),
    productStage: stageValue,
    competitors: parseCompetitorLines(competitors),
    differentiation,
    auditGoals,
    selectedBuckets,
    knownProblem,
    constraints: constraints || knownProblem || successMetric,
    artifacts: {
      extensionCaptureJson: asString(artifacts.extensionCaptureJson),
      screenshots: Array.isArray(artifacts.screenshots)
        ? (artifacts.screenshots.filter((item) => {
            const rec = asRecord(item);
            return !!asString(rec?.url);
          }) as AuditPayload["artifacts"]["screenshots"])
        : [],
      criticalFlowVideo:
        artifacts.criticalFlowVideo && typeof artifacts.criticalFlowVideo === "object"
          ? {
              name: asString((artifacts.criticalFlowVideo as Record<string, unknown>).name) || "Critical flow video",
              type: asString((artifacts.criticalFlowVideo as Record<string, unknown>).type) || "video/*",
              size: Number((artifacts.criticalFlowVideo as Record<string, unknown>).size) || 0,
              url: asString((artifacts.criticalFlowVideo as Record<string, unknown>).url),
              publicId: asString((artifacts.criticalFlowVideo as Record<string, unknown>).publicId),
              width:
                typeof (artifacts.criticalFlowVideo as Record<string, unknown>).width === "number"
                  ? Number((artifacts.criticalFlowVideo as Record<string, unknown>).width)
                  : null,
              height:
                typeof (artifacts.criticalFlowVideo as Record<string, unknown>).height === "number"
                  ? Number((artifacts.criticalFlowVideo as Record<string, unknown>).height)
                  : null,
              format: asString((artifacts.criticalFlowVideo as Record<string, unknown>).format),
              resourceType: asString((artifacts.criticalFlowVideo as Record<string, unknown>).resourceType) || "video",
            }
          : null,
      loomLink: asString(artifacts.loomLink || artifacts.loom_link),
      notes: asString(artifacts.notes),
    },
    guidedCaptureSteps:
      Array.isArray(guidedCaptureSteps) && guidedCaptureSteps.length
        ? guidedCaptureSteps
        : AUDIT_DEFAULTS.guidedCaptureSteps,
    internalRoutesText: formatInternalRoutesText(internalRoutes),
    auditFlowText:
      auditFlowInstructions || (auditFlows.length ? formatAuditFlowText(auditFlows) : ""),
    auditFlows: auditFlows.length ? auditFlows : [""],
  };
}
