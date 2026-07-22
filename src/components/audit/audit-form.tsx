"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea, TextInput } from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BucketPicker } from "@/components/audit/bucket-picker";
import { IntakeAssistant } from "@/components/audit/intake-assistant";
import {
  AUDIT_DEFAULTS,
  AuditAccessMode,
  AuditPayload,
  AuditSelectOption,
  GuidedActionType,
  UploadedScreenshotLabel,
  UploadedVideo,
  toWebhookPayload,
} from "@/lib/audit-types";
import { clearLastReport } from "@/lib/report-store";
import { prefillAuditPayload } from "@/lib/audit-prefill";
import { getErrorMessage } from "@/lib/error-utils";
import { canCreateReport, canAccessProductType, getAllowedProductTypes } from "@/lib/access-control";
import {
  auditUserAccessFromSession,
  createDefaultSession,
  fetchAppSession,
  readAppSession,
  type AppSession,
  writeAppSession,
} from "@/lib/app-session";

// ADDED: autosave draft so users don’t need to re-fill the whole form
const DRAFT_KEY = "ux_audit:draft_v1";
const DRAFT_VERSION = 2;

function sanitizeDraftPayload(value: unknown): AuditPayload {
  if (!value || typeof value !== "object") return AUDIT_DEFAULTS;
  const rec = value as Record<string, unknown>;
  const merged = {
    ...AUDIT_DEFAULTS,
    ...rec,
  } as AuditPayload & { draftVersion?: number };

  const rawArtifacts =
    merged.artifacts && typeof merged.artifacts === "object" ? merged.artifacts : AUDIT_DEFAULTS.artifacts;

  const rawScreenshots = Array.isArray(rawArtifacts.screenshots) ? rawArtifacts.screenshots : [];
  const screenshots = rawScreenshots
    .map((shot) => {
      if (!shot || typeof shot !== "object") return null;
      const item = shot as Record<string, unknown>;
      const url = typeof item.url === "string" ? item.url.trim() : "";
      if (!url) return null;
      return {
        name: typeof item.name === "string" ? item.name : "Screenshot",
        type: typeof item.type === "string" ? item.type : "image/*",
        size: typeof item.size === "number" ? item.size : 0,
        url,
        label:
          typeof item.label === "string"
            ? (item.label as UploadedScreenshotLabel)
            : "other",
        publicId: typeof item.publicId === "string" ? item.publicId : "",
        width: typeof item.width === "number" ? item.width : null,
        height: typeof item.height === "number" ? item.height : null,
        format: typeof item.format === "string" ? item.format : "",
        resourceType: typeof item.resourceType === "string" ? item.resourceType : "image",
      };
    })
    .filter(Boolean) as AuditPayload["artifacts"]["screenshots"];

  const criticalFlowVideo =
    rawArtifacts.criticalFlowVideo && typeof rawArtifacts.criticalFlowVideo === "object"
      ? (rawArtifacts.criticalFlowVideo as UploadedVideo)
      : null;

  return {
    ...merged,
    artifacts: {
      loomLink: typeof rawArtifacts.loomLink === "string" ? rawArtifacts.loomLink : "",
      notes: typeof rawArtifacts.notes === "string" ? rawArtifacts.notes : "",
      extensionCaptureJson:
        typeof rawArtifacts.extensionCaptureJson === "string" ? rawArtifacts.extensionCaptureJson : "",
      screenshots,
      criticalFlowVideo: criticalFlowVideo?.url
        ? {
            name: typeof criticalFlowVideo.name === "string" ? criticalFlowVideo.name : "Critical flow video",
            type: typeof criticalFlowVideo.type === "string" ? criticalFlowVideo.type : "video/*",
            size: typeof criticalFlowVideo.size === "number" ? criticalFlowVideo.size : 0,
            url: criticalFlowVideo.url,
            publicId: typeof criticalFlowVideo.publicId === "string" ? criticalFlowVideo.publicId : "",
            width: typeof criticalFlowVideo.width === "number" ? criticalFlowVideo.width : null,
            height: typeof criticalFlowVideo.height === "number" ? criticalFlowVideo.height : null,
            format: typeof criticalFlowVideo.format === "string" ? criticalFlowVideo.format : "",
            resourceType: typeof criticalFlowVideo.resourceType === "string" ? criticalFlowVideo.resourceType : "video",
          }
        : null,
    },
  };
}

const allProductTypes: AuditSelectOption[] = [
  // UPDATED
  { label: "SaaS / Platform", value: "saas" },
  { label: "E-commerce", value: "ecommerce" },
  { label: "Marketing website", value: "marketing_website" },
];

// UPDATED: contexts vary by primary type
function productContextsFor(type: AuditPayload["product"]["type"]): AuditSelectOption[] {
  if (type === "marketing_website") {
    return [
      { label: "Landing page", value: "landing_page" },
      { label: "Marketing website", value: "marketing_website" },
      { label: "Educational website", value: "educational_website" },
      { label: "Healthcare website", value: "healthcare_website" },
      { label: "Agency / portfolio", value: "agency_portfolio" },
      { label: "Documentation", value: "documentation" },
      { label: "Blog / content", value: "blog_content" },
      { label: "Other", value: "other" },
    ];
  }

  if (type === "ecommerce") {
    return [
      { label: "D2C store", value: "d2c_store" },
      { label: "Marketplace", value: "marketplace" },
      { label: "Subscription commerce", value: "subscription_commerce" },
      { label: "Fashion / apparel", value: "fashion_apparel" },
      { label: "Electronics", value: "electronics" },
      { label: "Grocery / FMCG", value: "grocery_fmcg" },
      { label: "Luxury", value: "luxury" },
      { label: "Other", value: "other" },
    ];
  }

  // SaaS / Platform (default)
  return [
    { label: "B2B SaaS", value: "b2b_saas" },
    { label: "B2C SaaS", value: "b2c_saas" },
    { label: "Internal tool", value: "internal_tool" },
    { label: "Content / media", value: "content_media" },
    { label: "Marketplace", value: "marketplace" },
    { label: "Mobile app", value: "mobile_app" },
    { label: "Other", value: "other" },
  ];
}

const primaryPlatforms: AuditSelectOption[] = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile_web" },
  { label: "Both Desktop + Mobile", value: "desktop_and_mobile_web" },
  { label: "Android", value: "android" },
  { label: "iOS", value: "ios" },
  { label: "Both Android + iOS", value: "android_and_ios" },
];

// ADDED
const frequencyOfUseOptions: AuditSelectOption[] = [
  { label: "Daily", value: "daily" },
  { label: "A few times a week", value: "weekly" },
  { label: "A few times a month", value: "monthly" },
  { label: "Rarely", value: "rarely" },
];

const productStages: AuditSelectOption[] = [
  // UPDATED
  { label: "Prototype", value: "prototype" },
  { label: "MVP / Early beta", value: "mvp_early_beta" },
  { label: "Public launch", value: "public_launch" },
  { label: "Growth — scaling users", value: "growth_scaling_users" },
  { label: "Mature product", value: "mature_product" },
  { label: "Repositioning", value: "repositioning" },
  { label: "Major redesign", value: "major_redesign" },
];

// ADDED
const ecommerceStoreStages: AuditSelectOption[] = [
  { label: "Just launched", value: "just_launched" },
  { label: "Established store", value: "established_store" },
  { label: "Mature brand / high volume", value: "mature_store" },
  { label: "Rebranding / redesign", value: "rebranding_redesign" },
  { label: "Scaling to new markets", value: "scaling_new_markets" },
  { label: "Expanding catalog", value: "expanding_catalog" },
];

// ADDED
const websiteStages: AuditSelectOption[] = [
  { label: "New website", value: "new_website" },
  { label: "Existing site being redesigned", value: "existing_redesign" },
  { label: "Mature website", value: "mature_website" }, // UPDATED
  { label: "Preparing for a campaign", value: "campaign_prep" },
  { label: "Rebranding", value: "rebranding" },
  { label: "SEO / content scale-up", value: "seo_content_scale" },
];

function isUrlLike(value: string) {
  if (!value.trim()) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const auditGoals: AuditSelectOption[] = [
  { label: "Improve conversion", value: "improve_conversion" },
  { label: "Reduce churn / improve retention", value: "reduce_churn_retention" },
  { label: "Fix onboarding drop-off", value: "fix_onboarding_dropoff" },
  { label: "Improve overall UX quality", value: "improve_overall_ux_quality" },
  { label: "Prepare for fundraising", value: "prepare_for_fundraising" },
  { label: "Benchmark against competitors", value: "benchmark_against_competitors" },
  { label: "Accessibility compliance", value: "accessibility_compliance" },
];
const auditGoalOptionValues = new Set(auditGoals.map((g) => g.value));

const guidedActionTypes: AuditSelectOption[] = [
  { label: "Login", value: "login" },
  { label: "Go to route / URL", value: "goto" },
  { label: "Click", value: "click" },
  { label: "Select dropdown option", value: "select" },
  { label: "Fill field", value: "fill" },
  { label: "Wait", value: "wait" },
  { label: "Capture screenshot", value: "screenshot" },
  { label: "Keyboard action", value: "keyboard" },
  { label: "Mobile test", value: "mobile_test" },
  { label: "Zoom test", value: "zoom_test" },
  { label: "Error / validation test", value: "error_test" },
];

const accessModeOptions: AuditSelectOption[] = [
  { label: "Auto login with credentials", value: "auto_login" },
  { label: "Manual browser login", value: "manual_browser_login" },
  { label: "Use saved session", value: "use_saved_session" },
  { label: "Internal routes only", value: "internal_routes_only" },
  { label: "Screenshot upload only", value: "screenshot_upload_only" },
  { label: "Browser extension capture", value: "browser_extension_capture" },
];

function accessModeOptionsFor(
  type: AuditPayload["product"]["type"],
): AuditSelectOption[] {
  if (type === "marketing_website" || type === "ecommerce") {
    return accessModeOptions.filter(
      (option) =>
        option.value === "screenshot_upload_only" ||
        option.value === "browser_extension_capture",
    );
  }

  return accessModeOptions;
}

const screenshotLabelOptions: AuditSelectOption[] = [
  { label: "Login", value: "login" },
  { label: "Dashboard", value: "dashboard" },
  { label: "Navigation", value: "navigation" },
  { label: "Data grid", value: "data_grid" },
  { label: "Form", value: "form" },
  { label: "Error state", value: "error_state" },
  { label: "Empty state", value: "empty_state" },
  { label: "Loading state", value: "loading_state" },
  { label: "Report", value: "report" },
  { label: "Settings", value: "settings" },
  { label: "Mobile", value: "mobile" },
  { label: "Other", value: "other" },
];

type Step = {
  id: number;
  title: string;
  required?: boolean;
};

function stepLabel(step: Step) {
  return step.required ? `${step.title}` : step.title;
}

export function AuditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceReport = searchParams.get("sourceReport");
  const isReauditMode = !!sourceReport;
  const [payload, setPayload] = useState<AuditPayload>(AUDIT_DEFAULTS);
  const [appSession, setAppSession] = useState<AppSession>(() => createDefaultSession());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [transcriptFileName, setTranscriptFileName] = useState<string | null>(null);
  const [uploadingScreenshots, setUploadingScreenshots] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [, setVideoFileName] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  // ADDED: show validation only after user presses Next (or Submit)
  const [attemptedSteps, setAttemptedSteps] = useState<number[]>([]);
  // ADDED: custom audit goal
  const [customAuditGoal, setCustomAuditGoal] = useState("");
  // ADDED: report creating overlay copy rotation
  const [creatingIdx, setCreatingIdx] = useState(0);
  const [prefillLoading, setPrefillLoading] = useState(false);

  // ADDED
  const primaryType = payload.product.type;
  const allowedProductTypes = useMemo(
    () => getAllowedProductTypes(appSession.role),
    [appSession.role],
  );
  const productTypes = useMemo(
    () => allProductTypes.filter((option) => allowedProductTypes.includes(option.value as never)),
    [allowedProductTypes],
  );
  const accessOptions = useMemo(
    () => accessModeOptionsFor(primaryType),
    [primaryType],
  );
  const defaultAccessMode =
    primaryType === "marketing_website" || primaryType === "ecommerce"
      ? "browser_extension_capture"
      : "auto_login";
  const accessLabel =
    primaryType === "marketing_website"
      ? "How should we audit this website?"
      : primaryType === "ecommerce"
        ? "How should we audit this store?"
        : "How should we access this SaaS?";

  const extensionWorkflowTitle =
    primaryType === "marketing_website"
      ? "Manual website extension workflow"
      : primaryType === "ecommerce"
        ? "Manual store extension workflow"
        : "Manual extension workflow";

  const extensionWorkflowSteps =
    primaryType === "marketing_website"
      ? [
          "Open the public website manually.",
          "Load the unpacked Chrome extension from the repo’s chrome-extension folder.",
          "Click “Start Audit” in the extension.",
          "Capture the homepage, navigation, key landing pages, CTA sections, forms, footer, and any important content states.",
          "Optionally start recording a journey before sending evidence.",
          "Click “Copy JSON” in the extension and paste it here.",
        ]
      : primaryType === "ecommerce"
        ? [
            "Open the storefront manually.",
            "Load the unpacked Chrome extension from the repo’s chrome-extension folder.",
            "Click “Start Audit” in the extension.",
            "Capture the homepage, category/listing pages, product page, cart state, checkout entry, filters, search, and any trust or promo states.",
            "Optionally start recording a journey before sending evidence.",
            "Click “Copy JSON” in the extension and paste it here.",
          ]
        : [
            "Open the SaaS product manually.",
            "Log in manually.",
            "Load the unpacked Chrome extension from the repo’s chrome-extension folder.",
            "Click “Start Audit” in the extension.",
            "Capture each important page with “Capture this page” or enable journey auto-capture in the extension settings.",
            "Optionally start recording a journey before sending evidence.",
            "Click “Copy JSON” in the extension and paste it here.",
          ];

  useEffect(() => {
    const next = readAppSession();
    const roleOverride = searchParams.get("role");
    const planOverride = searchParams.get("plan");
    const patched =
      roleOverride || planOverride
        ? createDefaultSession({
            ...next,
            role:
              roleOverride === "admin" || roleOverride === "paid" || roleOverride === "free"
                ? roleOverride
                : next.role,
            plan: planOverride === "paid" || planOverride === "free" ? planOverride : next.plan,
          })
        : next;

    writeAppSession(patched);
    setAppSession(patched);
    setPayload((prev) => ({ ...prev, userAccess: auditUserAccessFromSession(patched) }));
    void fetchAppSession()
      .then((serverSession) => {
        setAppSession(serverSession);
        setPayload((prev) => ({ ...prev, userAccess: auditUserAccessFromSession(serverSession) }));
      })
      .catch(() => undefined);
  }, [searchParams]);

  useEffect(() => {
    if (!payload.product.type) return;
    if (canAccessProductType(appSession.role, payload.product.type)) return;
    const fallbackType = (allowedProductTypes[0] as AuditPayload["product"]["type"]) || "";
    setError(null);
    setPayload((p) => ({
      ...p,
      product: { ...p.product, type: fallbackType, context: [] },
      accessMode: accessModeOptionsFor(fallbackType)[0]?.value as AuditAccessMode || "browser_extension_capture",
      auth: {
        ...p.auth,
        requiresLogin: false,
        usernameOrEmail: "",
        password: "",
      },
      productStage: "",
      dynamic_answers: { saas: {}, ecommerce: {}, marketing: {} },
    }));
    setActiveStep(1);
    setAttemptedSteps([]);
  }, [allowedProductTypes, appSession.role, payload.product.type]);

  const extensionJsonPlaceholder =
    primaryType === "marketing_website"
      ? `[
  {
    "url": "https://www.example.com",
    "title": "Homepage",
    "screenTypeLabel": "homepage",
    "headings": ["Grow faster with Example"],
    "visibleText": "Trusted by modern teams",
    "buttons": ["Book a demo", "Learn more"],
    "links": ["Pricing", "About", "Contact"],
    "forms": ["Newsletter signup"],
    "tables": [],
    "navigationLabels": ["Products", "Solutions", "Resources"],
    "dropdownModalState": "none",
    "domSummary": "Marketing homepage with hero, trust logos, CTA, and footer",
    "screenshotUrl": "https://cdn.example.com/homepage.png"
  }
]`
      : primaryType === "ecommerce"
        ? `[
  {
    "url": "https://shop.example.com/products/running-shoes",
    "title": "Running Shoes",
    "screenTypeLabel": "product_page",
    "headings": ["Running Shoes"],
    "visibleText": "Free delivery on orders over Rs 999",
    "buttons": ["Add to cart", "Buy now"],
    "links": ["Size guide", "Reviews"],
    "forms": ["Pincode checker"],
    "tables": [],
    "navigationLabels": ["Men", "Women", "Sale", "Cart"],
    "dropdownModalState": "size_selector_open",
    "domSummary": "Product detail page with gallery, price, variants, reviews, and purchase actions",
    "screenshotUrl": "https://cdn.example.com/product-page.png"
  }
]`
        : `[
  {
    "url": "https://app.example.com/dashboard",
    "title": "Dashboard",
    "screenTypeLabel": "dashboard",
    "headings": ["Dashboard"],
    "visibleText": "Welcome back",
    "buttons": ["Create report"],
    "links": ["Settings"],
    "forms": [],
    "tables": ["Recent activity"],
    "navigationLabels": ["Dashboards", "Reports"],
    "dropdownModalState": "none",
    "domSummary": "Main dashboard with recent activity",
    "screenshotUrl": "https://cdn.example.com/dashboard.png"
  }
]`;

  useEffect(() => {
    if (!primaryType) return;
    const currentModeAllowed = accessOptions.some(
      (option) => option.value === payload.accessMode,
    );
    if (currentModeAllowed) return;

    setPayload((prev) => ({
      ...prev,
      accessMode: defaultAccessMode,
      auth:
        primaryType === "saas"
          ? prev.auth
          : {
              ...prev.auth,
              requiresLogin: false,
              usernameOrEmail: "",
              password: "",
            },
      internalRoutesText:
        primaryType === "saas" ? prev.internalRoutesText : "",
    }));
  }, [accessOptions, defaultAccessMode, payload.accessMode, primaryType]);

  function deepMerge<T>(base: T, patch: unknown): T {
    if (!patch || typeof patch !== "object") return base;
    if (!base || typeof base !== "object") return patch as T;
    if (Array.isArray(base)) return patch as T;
    const out = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      const bv = (out as Record<string, unknown>)[k];
      if (v && typeof v === "object" && !Array.isArray(v) && bv && typeof bv === "object" && !Array.isArray(bv)) {
        (out as Record<string, unknown>)[k] = deepMerge(bv, v);
      } else {
        (out as Record<string, unknown>)[k] = v;
      }
    }
    return out as T;
  }

  async function extractIntakeFromTranscript() {
    const transcript = payload.artifacts.notes?.trim();
    if (!transcript) {
      setExtractError("Paste or upload a transcript into Notes first.");
      return;
    }

    setExtractError(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/intake/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, current: payload }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const msg = getErrorMessage(data || "Transcript extraction failed.");
        throw new Error(msg || "Transcript extraction failed.");
      }
      const patch =
        data && typeof data === "object" && "patch" in data
          ? (data as Record<string, unknown>).patch
          : null;
      setPayload((p) => deepMerge(p, patch));
    } catch (e) {
      setExtractError(getErrorMessage(e));
    } finally {
      setExtracting(false);
    }
  }

  async function uploadScreenshots(files: File[]) {
    setError(null);
    setUploadingScreenshots(true);

    try {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const formData = new FormData();
          formData.set("file", file);

          const response = await fetch("/api/uploads/screenshots", {
            method: "POST",
            body: formData,
          });

          const data = (await response.json()) as
            | {
                error?: unknown;
                url?: string;
                publicId?: string;
                width?: number | null;
                height?: number | null;
                format?: string;
                resourceType?: string;
              }
            | null;

          if (!response.ok || !data?.url) {
            throw new Error(getErrorMessage(data?.error) || `Failed to upload ${file.name}.`);
          }

          return {
            name: file.name,
            type: file.type,
            size: file.size,
            url: data.url,
            label: "other" as UploadedScreenshotLabel,
            publicId: data.publicId || "",
            width: data.width ?? null,
            height: data.height ?? null,
            format: data.format || "",
            resourceType: data.resourceType || "image",
          };
        }),
      );

      const items = results
        .filter(
          (
            result,
          ): result is PromiseFulfilledResult<{
            name: string;
            type: string;
            size: number;
            url: string;
            label: UploadedScreenshotLabel;
            publicId: string;
            width: number | null;
            height: number | null;
            format: string;
            resourceType: string;
          }> => result.status === "fulfilled",
        )
        .map((result) => result.value);

      const failures = results.flatMap((result, index) => {
        if (result.status !== "rejected") return [];
        const file = files[index];
        const message = getErrorMessage(result.reason) || "Upload failed.";
        return [`${file?.name || "Unknown file"}: ${message}`];
      });

      if (items.length > 0) {
        setPayload((p) => ({
          ...p,
          artifacts: {
            ...p.artifacts,
            screenshots: [...p.artifacts.screenshots, ...items],
          },
        }));
      }

      if (failures.length > 0) {
        setError(
          failures.length === 1
            ? failures[0] || "Screenshot upload failed."
            : `Some screenshots failed to upload: ${failures.join(" | ")}`,
        );
      }
    } catch (error) {
      console.error("Screenshot upload failed:", error);
      setError(getErrorMessage(error) || "Screenshot upload failed.");
    } finally {
      setUploadingScreenshots(false);
    }
  }

  async function uploadCriticalFlowVideo(file: File) {
    setError(null);
    setUploadingVideo(true);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/uploads/screenshots", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | {
            error?: unknown;
            url?: string;
            publicId?: string;
            width?: number | null;
            height?: number | null;
            format?: string;
            resourceType?: string;
          }
        | null;

      if (!response.ok || !data?.url) {
        throw new Error(getErrorMessage(data?.error) || `Failed to upload ${file.name}.`);
      }

      const uploadedVideo: UploadedVideo = {
        name: file.name,
        type: file.type,
        size: file.size,
        url: data.url,
        publicId: data.publicId || "",
        width: data.width ?? null,
        height: data.height ?? null,
        format: data.format || "",
        resourceType: data.resourceType || "video",
      };

      setPayload((p) => ({
        ...p,
        artifacts: {
          ...p.artifacts,
          criticalFlowVideo: uploadedVideo,
        },
      }));
      setVideoFileName(file.name);
    } catch (error) {
      console.error("Critical-flow video upload failed:", error);
      setError(getErrorMessage(error) || "Video upload failed.");
    } finally {
      setUploadingVideo(false);
    }
  }

  // ADDED: restore draft once on load
  useEffect(() => {
    try {
      if (sourceReport) return;
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const sanitized = sanitizeDraftPayload(parsed);
      setPayload(sanitized);
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ ...sanitized, draftVersion: DRAFT_VERSION }),
      );
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!sourceReport) return;

    let cancelled = false;
    setPrefillLoading(true);
    setError(null);

    fetch(`/api/report/${encodeURIComponent(sourceReport)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) throw new Error(data.error || `Failed to load report (${res.status})`);
        if (cancelled) return;
        const nextPayload = prefillAuditPayload(data);
        setPayload(nextPayload);
        setActiveStep(1);
        setAttemptedSteps([]);
        try {
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ ...nextPayload, draftVersion: DRAFT_VERSION }),
          );
        } catch {
          // ignore
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Audit form prefill failed:", error);
          setError(getErrorMessage(error) || "Failed to prefill audit");
        }
      })
      .finally(() => {
        if (!cancelled) setPrefillLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceReport]);

  // ADDED: autosave draft (debounced)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ ...payload, draftVersion: DRAFT_VERSION }),
        );
      } catch {
        // ignore
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [payload, primaryType]);

  // ADDED
  const steps = useMemo<Step[]>(() => {
    return [
      // UPDATED: Product type lives under “Primary audit details”
      { id: 1, title: "Primary audit details", required: true },
      // UPDATED
      { id: 2, title: "Product details", required: true },
      // ADDED
      { id: 3, title: "User and business Details", required: true },
      { id: 4, title: "Product URL + credentials", required: true },
      { id: 5, title: "Audit flow", required: true },
    ];
  }, []); // UPDATED

  // ADDED
  const maxStep = steps[steps.length - 1]?.id ?? 1;
  // ADDED
  const showErrorsForStep = attemptedSteps.includes(activeStep);

  // ADDED
  const setProductType = useCallback((nextType: AuditPayload["product"]["type"]) => {
    setError(null);
    const nextAccessOptions = accessModeOptionsFor(nextType);
    const nextAccessMode = nextAccessOptions.some(
      (option) => option.value === payload.accessMode,
    )
      ? payload.accessMode
      : "browser_extension_capture";
    setPayload((p) => ({
      ...p,
      product: { ...p.product, type: nextType, context: [] },
      accessMode: nextAccessMode,
      auth:
        nextType === "saas"
          ? p.auth
          : {
              ...p.auth,
              requiresLogin: false,
              usernameOrEmail: "",
              password: "",
            },
      // Clear shared fields that may be irrelevant for next type
      productStage: "",
      // Reset dynamic answers to prevent stale data
      dynamic_answers: { saas: {}, ecommerce: {}, marketing: {} },
    }));
    setActiveStep(1);
    setAttemptedSteps([]);
  }, [payload.accessMode]);

  // ADDED
  function resetAll() {
    setError(null);
    setPayload({
      ...AUDIT_DEFAULTS,
      userAccess: auditUserAccessFromSession(appSession),
    });
    setActiveStep(1);
    setAttemptedSteps([]);
    // ADDED
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  // ADDED
  function updateDynamic(next: Record<string, string | undefined>) {
    if (!primaryType) return;
    setPayload((p) => {
      if (primaryType === "saas") {
        return {
          ...p,
          dynamic_answers: {
            ...p.dynamic_answers,
            saas: { ...p.dynamic_answers.saas, ...next },
          },
        };
      }
      if (primaryType === "ecommerce") {
        return {
          ...p,
          dynamic_answers: {
            ...p.dynamic_answers,
            ecommerce: { ...p.dynamic_answers.ecommerce, ...next },
          },
        };
      }
      return {
        ...p,
        dynamic_answers: {
          ...p.dynamic_answers,
          marketing: { ...p.dynamic_answers.marketing, ...next },
        },
      };
    });
  }

  function hasExtensionEvidence(value: AuditPayload) {
    if (value.artifacts.screenshots.length > 0 || value.artifacts.criticalFlowVideo || value.artifacts.notes.trim()) {
      return true;
    }
    if (!value.artifacts.extensionCaptureJson.trim()) return false;
    try {
      const parsed = JSON.parse(value.artifacts.extensionCaptureJson) as unknown;
      if (Array.isArray(parsed)) return parsed.length > 0;
      return Boolean(parsed);
    } catch {
      return false;
    }
  }

  function isPublicAuditType(type: AuditPayload["product"]["type"]) {
    return type === "marketing_website" || type === "ecommerce";
  }

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    // UPDATED (Q1)
    if (!payload.productName.trim()) errors.productName = "Product name is required.";
    // ADDED (Q1)
    if (!payload.productOneLiner.trim())
      errors.productOneLiner = "Add a one-sentence description.";
    if (!payload.productUrl.trim())
      errors.productUrl = "Product URL is required.";
    else if (!isUrlLike(payload.productUrl))
      errors.productUrl = "Enter a valid URL (including https://).";
    // ADDED
    if (payload.artifacts.loomLink && !isUrlLike(payload.artifacts.loomLink)) {
      errors.loomLink = "Enter a valid Loom link (including https://).";
    }

    if (payload.auth.requiresLogin) {
      if (!payload.auth.usernameOrEmail.trim())
        errors.authUser = "Email / username is required when login is enabled.";
      if (!payload.auth.password.trim())
        errors.authPass = "Password is required when login is enabled.";
    }

    // UPDATED
    if (!payload.product.type) errors.productType = "Select a primary type.";
    // UPDATED (n8n intake alignment)
    if (!payload.primaryUser.trim())
      errors.primaryUser = "Primary user is required.";
    if (!payload.primaryUserGoal.trim())
      errors.primaryUserGoal = "Primary user goal is required.";
    // ADDED (product context required fields)
    if (!payload.constraints.trim()) errors.constraints = "Product constraints are required.";
    if (!payload.primaryPlatform) errors.primaryPlatform = "Select a primary platform.";
    if (payload.product.type === "saas") {
      if (!payload.productStage) errors.productStage = "Select a product stage.";
      if (!payload.frequencyOfUse) errors.frequencyOfUse = "Select frequency of use.";
      if (!payload.dynamic_answers.saas.q16_solo_or_collab?.trim())
        errors.saasUsageMode = "Select usage mode.";
    } else if (payload.product.type === "ecommerce") {
      if (!payload.dynamic_answers.ecommerce.store_stage?.trim())
        errors.storeStage = "Select a store stage.";
    } else if (payload.product.type === "marketing_website") {
      if (!payload.dynamic_answers.marketing.site_goal?.trim())
        errors.siteGoal = "Select a website goal.";
    }
    if (!payload.differentiation.trim())
      errors.differentiation = "Product differentiation is required.";

    if (payload.auditGoals.length === 0)
      errors.auditGoals = "Select at least one audit goal.";

    // ADDED (n8n required)
    if (payload.selectedBuckets.length === 0)
      errors.selectedBuckets = "Select at least one bucket.";

    const hasFlow = payload.auditFlowText.trim().length > 0;
    if (!hasFlow) errors.auditFlows = "Add at least one audit flow.";
    const hasGuidedSteps = payload.guidedCaptureSteps.some(
      (step) =>
        step.stepName.trim() ||
        step.targetText.trim() ||
        step.targetSelector.trim() ||
        step.expectedText.trim() ||
        step.expectedHeading.trim() ||
        step.expectedUrlContains.trim(),
    );
    const hasInternalRoutes = payload.internalRoutesText
      .split("\n")
      .some((line) => line.trim().startsWith("/"));
    if (payload.artifacts.loomLink.trim() && !hasGuidedSteps && !hasInternalRoutes) {
      errors.guidedCaptureSteps =
        primaryType === "marketing_website" || primaryType === "ecommerce"
          ? "Loom video could not be read automatically. Please add manual capture steps or labeled screenshots."
          : "Loom video could not be read automatically. Please add manual guided capture steps or internal routes.";
    }

    if (payload.accessMode === "auto_login" && payload.auth.requiresLogin) {
      if (!payload.auth.usernameOrEmail.trim()) errors.authUser = "Username or email is required.";
      if (!payload.auth.password.trim()) errors.authPass = "Password is required.";
    }

    if (
      primaryType === "saas" &&
      payload.accessMode === "internal_routes_only" &&
      !hasInternalRoutes
    ) {
      errors.internalRoutes = "Add at least one internal route for route-based capture.";
    }

    if (
      payload.accessMode === "screenshot_upload_only" &&
      payload.artifacts.screenshots.length === 0
    ) {
      errors.screenshots = "Upload at least one labeled screenshot for screenshot-only audits.";
    }

    if (
      payload.accessMode === "browser_extension_capture" &&
      !isPublicAuditType(primaryType) &&
      !hasExtensionEvidence(payload)
    ) {
      errors.extensionEvidence = "Add at least one extension-captured page, screenshot, or uploaded video before submitting.";
    }

    payload.competitors.forEach((c, idx) => {
      if (c.url && !isUrlLike(c.url)) {
        errors[`competitorUrl${idx}`] = "Enter a valid URL (including https://).";
      }
    });
    // ADDED
    payload.businessCompetitors.forEach((c, idx) => {
      if (c.url && !isUrlLike(c.url)) {
        errors[`businessCompetitorUrl${idx}`] =
          "Enter a valid URL (including https://).";
      }
    });

    return errors;
  }, [payload, primaryType]);

  const completion = useMemo(() => {
    const done = new Set<number>();
    // UPDATED: step 1 is primary audit details (type + required audit focus)
    if (
      payload.product.type &&
      payload.auditGoals.length > 0 &&
      payload.selectedBuckets.length > 0
    )
      done.add(1);
    // UPDATED: step 2 includes product details
    const stageOk =
      payload.product.type === "saas"
        ? !!payload.productStage
        : payload.product.type === "ecommerce"
          ? !!payload.dynamic_answers.ecommerce.store_stage?.trim()
          : payload.product.type === "marketing_website"
            ? !!payload.dynamic_answers.marketing.site_goal?.trim()
            : false;

    const saasExtraOk =
      payload.product.type !== "saas"
        ? true
        : !!payload.frequencyOfUse &&
          !!payload.dynamic_answers.saas.q16_solo_or_collab?.trim();

    if (
      payload.productName.trim() &&
      payload.productOneLiner.trim() &&
      payload.constraints.trim() &&
      payload.primaryPlatform &&
      stageOk &&
      saasExtraOk &&
      payload.differentiation.trim()
    )
      done.add(2);

    // ADDED: step 3 is user + business details
    if (payload.primaryUser.trim() && payload.primaryUserGoal.trim()) done.add(3);
    // UPDATED: step 4 is url + credentials
    if (
      payload.productUrl.trim() &&
      isUrlLike(payload.productUrl) &&
      (payload.accessMode !== "auto_login" ||
        !payload.auth.requiresLogin ||
        (payload.auth.usernameOrEmail.trim() && payload.auth.password.trim()))
    )
      done.add(4);
    // UPDATED: step 5 is audit flow
    if (payload.auditFlowText.trim()) done.add(5);
    return done;
  }, [payload]);

  const progressPct = Math.max(
    5,
    Math.round((completion.size / steps.length) * 100),
  );

  // ADDED
  const creatingMessages = useMemo(
    () => [
      "Creating report…",
      "Capturing evidence…",
      "Scoring buckets…",
      "Writing recommendations…",
      "Preparing download…",
    ],
    [],
  );

  // ADDED
  useEffect(() => {
    if (!loading) return;
    const t = window.setInterval(() => {
      setCreatingIdx((i) => (i + 1) % creatingMessages.length);
    }, 1200);
    return () => window.clearInterval(t);
  }, [loading, creatingMessages.length]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (appSession.email === "guest@local.test") {
      setError("Please sign in or sign up before creating an audit.");
      router.push("/sign-in?returnTo=/audit");
      return;
    }

    const missingRequiredSteps = steps
      .filter((s) => s.required)
      .map((s) => s.id)
      .filter((id) => !completion.has(id));
    if (missingRequiredSteps.length > 0) {
      setActiveStep(missingRequiredSteps[0]);
      // ADDED: reveal validation on missing steps
      setAttemptedSteps((prev) => {
        const next = new Set(prev);
        missingRequiredSteps.forEach((id) => next.add(id));
        return Array.from(next);
      });
      return;
    }

    if (
      payload.accessMode === "browser_extension_capture" &&
      !isPublicAuditType(primaryType) &&
      !hasExtensionEvidence(payload)
    ) {
      setError("Extension capture mode needs at least one captured page or uploaded screenshot/video evidence.");
      setActiveStep(4);
      return;
    }

    setLoading(true);
    try {
      const submissionPayload: AuditPayload = {
        ...payload,
        userAccess: auditUserAccessFromSession(appSession),
      };
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toWebhookPayload(submissionPayload)),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const debugInfo =
          data && typeof data === "object" && data
            ? (data as Record<string, unknown>).debug
            : null;
        const message = getErrorMessage(
          data && typeof data === "object"
            ? data
            : { message: `Request failed (${response.status})` },
        );
        const suspiciousPaths =
          debugInfo &&
          typeof debugInfo === "object" &&
          Array.isArray((debugInfo as Record<string, unknown>).suspiciousPaths)
            ? ((debugInfo as Record<string, unknown>).suspiciousPaths as unknown[])
                .map((item) => String(item))
                .filter(Boolean)
            : [];
        const topLevelKeys =
          debugInfo &&
          typeof debugInfo === "object" &&
          Array.isArray((debugInfo as Record<string, unknown>).topLevelKeys)
            ? ((debugInfo as Record<string, unknown>).topLevelKeys as unknown[])
                .map((item) => String(item))
                .filter(Boolean)
            : [];

        const detailLines = [
          message || `Request failed (${response.status})`,
          suspiciousPaths.length
            ? `Suspicious paths: ${suspiciousPaths.join(", ")}`
            : "",
          topLevelKeys.length
            ? `Top-level keys: ${topLevelKeys.join(", ")}`
            : "",
        ].filter(Boolean);

        throw new Error(detailLines.join("\n"));
      }

      const payloadData = data as unknown; // UPDATED
      const rec =
        payloadData && typeof payloadData === "object" ? (payloadData as Record<string, unknown>) : null;
      const reportId = rec && typeof rec.reportId === "string" ? rec.reportId : null;
      if (!reportId) throw new Error("Missing reportId from server");
      clearLastReport();
      void fetchAppSession().then(setAppSession).catch(() => undefined);
      // UPDATED: async job flow — report is generated in background
      router.push(`/report?rid=${encodeURIComponent(reportId)}`);
    } catch (err) {
      console.error("Audit form submit failed:", err);
      setError(getErrorMessage(err) || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // ADDED
  const firstMissingRequiredStep = useMemo(() => {
    for (const s of steps) {
      if (s.required && !completion.has(s.id)) return s.id;
    }
    return null;
  }, [steps, completion]);

  // ADDED
  const isAllRequiredComplete = firstMissingRequiredStep === null;

  // ADDED
  const maxAllowedStep = isReauditMode
    ? maxStep
    : firstMissingRequiredStep
      ? firstMissingRequiredStep
      : maxStep;

  function goto(step: number) {
    setError(null);
    // UPDATED: prevent locked steps from becoming active
    setActiveStep(Math.min(step, maxAllowedStep));
  }

  function next() {
    setError(null);
    // UPDATED: only advance if current step is complete (for required steps)
    const current = activeStep;
    const stepMeta = steps.find((s) => s.id === current);
    const isRequired = !!stepMeta?.required;
    const isComplete = completion.has(current) || !isRequired;
    if (!isReauditMode && !isComplete) {
      setAttemptedSteps((prev) =>
        prev.includes(current) ? prev : [...prev, current],
      );
      return;
    }
    setActiveStep((s) => Math.min(maxAllowedStep, s + 1));
  }

  function back() {
    setError(null);
    setActiveStep((s) => Math.max(1, s - 1));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-12">
      {prefillLoading ? (
        <div className="lg:col-span-12 rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-4 text-sm text-[color:var(--ink-muted)]">
          Prefilling audit form from previous report…
        </div>
      ) : null}
      {/* ADDED */}
      {loading ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 backdrop-blur-md transition-opacity">
          <div className="w-[min(480px,92vw)] rounded-2xl border border-[color:var(--cream-dark)] bg-[color:var(--card)] p-8 text-center shadow-2xl relative overflow-hidden">
            {/* Elegant Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-[color:var(--accent)]/10 blur-3xl pointer-events-none" />

            <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-[color:var(--cream-dark)] bg-[color:var(--cream)] shadow-inner">
              <svg className="w-8 h-8 text-[color:var(--accent)] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            
            <h2 className="mt-6 text-xl font-bold tracking-tight text-[color:var(--ink)]">
              {creatingMessages[creatingIdx]}
            </h2>
            
            <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
              Running heuristic audits & generating your customized report.
            </p>

            <div className="mt-6 w-full h-1.5 bg-[color:var(--cream-dark)] rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-[color:var(--accent)] rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${((creatingIdx + 1) / creatingMessages.length) * 100}%` }}
              />
            </div>

            <div className="mt-4 text-xs text-[color:var(--ink-faint)]">
              Keep this tab open · Assembling deck slide {creatingIdx + 1} of {creatingMessages.length}
            </div>
          </div>
        </div>
      ) : null}

      <aside className="lg:col-span-4">
        <Card className="sticky top-20 p-5">
          <div className="text-xs font-semibold tracking-wider text-zinc-500 dark:text-zinc-400">
            Founder Context Intake
          </div>
          <div className="mt-2 text-lg font-semibold tracking-tight">
            5 steps · ~5 minutes
          </div>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Fill this once. Your agent reads it and runs the audit.
          </div>

          <div className="mt-5">
            <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-white/10">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Progress: {progressPct}%
            </div>
          </div>

          <div className="mt-6 space-y-2">
            {steps.map((s) => {
              const done = completion.has(s.id);
              const active = activeStep === s.id;
              // UPDATED: lock steps beyond what’s currently allowed
              const locked = s.id > maxAllowedStep;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => goto(s.id)}
                  // UPDATED: allow step 1 even before product type is selected
                  disabled={(s.id !== 1 && !primaryType) || locked}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all border border-transparent",
                    active
                      ? "bg-[color:var(--cream-dark)] dark:bg-[color:var(--white)] border-[color:var(--cream-mid)] text-[color:var(--ink)] shadow-sm font-semibold scale-[1.02]"
                      : "hover:bg-[color:var(--cream-dark)]/50 dark:hover:bg-[color:var(--white)]/50 text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
                    ((s.id !== 1 && !primaryType) || locked) ? "opacity-40 cursor-not-allowed" : "",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-all",
                      active
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow-sm ring-2 ring-[color:var(--accent)]/20"
                        : done
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-[color:var(--cream-dark)] text-[color:var(--ink-muted)] bg-[color:var(--white)] dark:bg-[color:var(--cream-dark)]",
                    ].join(" ")}
                  >
                    {done ? "✓" : s.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-none">
                      {stepLabel(s)}
                    </div>
                  </div>
                  {locked && (
                    <svg className="w-3.5 h-3.5 text-[color:var(--ink-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      </aside>

      <IntakeAssistant payload={payload} setPayload={setPayload} />

      <section className="space-y-6 lg:col-span-8">
        {/* UPDATED: remove redundant type selection card; keep reset only */}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetAll}
            disabled={loading}
          >
            Reset
          </Button>
        </div>

        {/* UPDATED: remove this state; start directly with the form */}

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {/* UPDATED: Step 1 always renders so the user can start immediately */}
        {activeStep === 1 ? (
          <Card className="p-5">
            <CardHeader
              title="01 / 05 — Primary audit details"
              description="Product type + audit focus."
            />
            <Field
              label="Product type"
              error={showErrorsForStep ? validation.productType : undefined}
            >
              <Select
                value={payload.product.type}
                onChange={(e) =>
                  setProductType(
                    e.target.value as AuditPayload["product"]["type"],
                  )
                }
              >
                <option value="">Select…</option>
                {productTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </Field>
            {appSession.role !== "admin" ? (
              <div className="mt-3 rounded-xl border border-[color:var(--cream-dark)] bg-[color:var(--cream)] p-4 text-sm text-[color:var(--ink-muted)]">
                SaaS audits are currently admin-only while that audit path is still in progress. Free and paid users can run `marketing_website` and `ecommerce` audits here.
              </div>
            ) : null}

            {/* ADDED: moved from previous “Primary goal of audit” step */}
            <div className="mt-5 space-y-5">
              <Field
                label="Primary audit goal(s)"
                error={showErrorsForStep ? validation.auditGoals : undefined}
              >
                <MultiSelect
                  options={auditGoals}
                  values={payload.auditGoals}
                  onChange={(values) =>
                    setPayload((p) => ({ ...p, auditGoals: values }))
                  }
                  placeholder=""
                />
              </Field>

              {/* ADDED: show custom goals (values not in preset options) */}
              {payload.auditGoals.some((g) => !auditGoalOptionValues.has(g)) ? (
                <div className="flex flex-wrap gap-2">
                  {payload.auditGoals
                    .filter((g) => !auditGoalOptionValues.has(g))
                    .map((g) => (
                      <div
                        key={g}
                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-3 py-1 text-sm"
                      >
                        <span className="truncate">{g}</span>
                        <button
                          type="button"
                          className="text-[color:var(--accent)] hover:brightness-110"
                          aria-label={`Remove goal ${g}`}
                          onClick={() =>
                            setPayload((p) => ({
                              ...p,
                              auditGoals: p.auditGoals.filter((x) => x !== g),
                            }))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                </div>
              ) : null}

              {/* ADDED: manual audit goal */}
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Add a custom goal (optional)">
                  <TextInput
                    value={customAuditGoal}
                    onChange={(e) => setCustomAuditGoal(e.target.value)}
                    placeholder="Type a goal not listed above…"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const v = customAuditGoal.trim();
                      if (!v) return;
                      setPayload((p) => {
                        const next = new Set(p.auditGoals);
                        next.add(v);
                        return { ...p, auditGoals: Array.from(next) };
                      });
                      setCustomAuditGoal("");
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const v = customAuditGoal.trim();
                    if (!v) return;
                    setPayload((p) => {
                      const next = new Set(p.auditGoals);
                      next.add(v);
                      return { ...p, auditGoals: Array.from(next) };
                    });
                    setCustomAuditGoal("");
                  }}
                  disabled={!customAuditGoal.trim()}
                >
                  Add
                </Button>
              </div>

              {/* UPDATED: Reason for Audit (free text) */}
              <Field label="Reason for Audit">
                <Textarea
                  value={payload.knownProblem}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, knownProblem: e.target.value }))
                  }
                  placeholder=""
                />
              </Field>

              <div>
                <div className="text-sm font-semibold">
                  Buckets to evaluate (select what you want audited)
                </div>
                <div className="mt-3">
                  <BucketPicker
                    value={payload.selectedBuckets}
                    onChange={(next) =>
                      setPayload((p) => ({ ...p, selectedBuckets: next }))
                    }
                    error={showErrorsForStep ? validation.selectedBuckets : undefined}
                  />
                </div>
              </div>

              {/* UPDATED: moved to “Reason for Audit” above buckets */}
            </div>
          </Card>
        ) : null}

        {/* UPDATED: Step 2 is Product context */}
        {primaryType && activeStep === 2 ? (
          <Card className="p-5">
            <CardHeader
              // UPDATED
              title="02 / 05 — Product details"
              description="Help the agent understand what the product is and who it’s for."
            />
            <div className="space-y-4">
              {/* UPDATED: context lives here (optional) */}
              <Field label="Product context (optional)">
                <MultiSelect
                  options={productContextsFor(primaryType)}
                  values={payload.product.context}
                  onChange={(values) =>
                    setPayload((p) => ({
                      ...p,
                      product: {
                        ...p.product,
                        context: values as AuditPayload["product"]["context"],
                      },
                    }))
                  }
                  placeholder=""
                />
              </Field>

              <Field
                label={primaryType === "saas" ? "Product name" : "Brand name"}
                error={showErrorsForStep ? validation.productName : undefined}
              >
                <TextInput
                  value={payload.productName}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, productName: e.target.value }))
                  }
                  placeholder={
                    primaryType === "saas"
                      ? "e.g. Notion, Stripe, Figma"
                      : "e.g. Nike, Sephora, Vitamin D"
                  }
                />
              </Field>

              {/* ADDED */}
              <Field
                label="One-sentence description"
                error={showErrorsForStep ? validation.productOneLiner : undefined}
              >
                <Textarea
                  value={payload.productOneLiner}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, productOneLiner: e.target.value }))
                  }
                  placeholder="e.g. A team wiki where projects, docs, and tasks live together."
                />
              </Field>

              {/* UPDATED: moved “Primary user” + “Primary user goal” to User/Business step */}

              {/* ADDED */}
              <Field
                label="Product constraints"
                error={showErrorsForStep ? validation.constraints : undefined}
              >
                <Textarea
                  value={payload.constraints}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, constraints: e.target.value }))
                  }
                  placeholder=""
                />
              </Field>

              {/* ADDED */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Product stage"
                  error={
                    showErrorsForStep
                      ? primaryType === "saas"
                        ? validation.productStage
                        : primaryType === "ecommerce"
                          ? validation.storeStage
                          : validation.siteGoal
                      : undefined
                  }
                >
                  {primaryType === "saas" ? (
                    <Select
                      value={payload.productStage}
                      onChange={(e) =>
                        setPayload((p) => ({ ...p, productStage: e.target.value }))
                      }
                    >
                      <option value="">Select…</option>
                      {productStages.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  ) : primaryType === "ecommerce" ? (
                    <Select
                      value={payload.dynamic_answers.ecommerce.store_stage ?? ""}
                      onChange={(e) => updateDynamic({ store_stage: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {/* UPDATED */}
                      {ecommerceStoreStages.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      value={payload.dynamic_answers.marketing.site_goal ?? ""}
                      onChange={(e) => updateDynamic({ site_goal: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {/* UPDATED */}
                      {websiteStages.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field
                  label="Primary platform"
                  error={showErrorsForStep ? validation.primaryPlatform : undefined}
                >
                  <Select
                    value={payload.primaryPlatform}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, primaryPlatform: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {primaryPlatforms.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* ADDED (SaaS only) */}
              {primaryType === "saas" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Product used solo or collaboratively"
                    error={showErrorsForStep ? validation.saasUsageMode : undefined}
                  >
                    <Select
                      value={payload.dynamic_answers.saas.q16_solo_or_collab ?? ""}
                      onChange={(e) =>
                        updateDynamic({ q16_solo_or_collab: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      <option value="solo">Mostly solo</option>
                      <option value="collab">Mostly collaborative</option>
                      <option value="mix">Mix of both</option>
                    </Select>
                  </Field>
                  <Field
                    label="Frequency of use"
                    error={showErrorsForStep ? validation.frequencyOfUse : undefined}
                  >
                    <Select
                      value={payload.frequencyOfUse}
                      onChange={(e) =>
                        setPayload((p) => ({ ...p, frequencyOfUse: e.target.value }))
                      }
                    >
                      <option value="">Select…</option>
                      {frequencyOfUseOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}

              {/* ADDED */}
              <Field
                label="Product differentiation"
                error={showErrorsForStep ? validation.differentiation : undefined}
              >
                <Textarea
                  value={payload.differentiation}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, differentiation: e.target.value }))
                  }
                  placeholder=""
                />
              </Field>
            </div>
          </Card>
        ) : null}

        {/* ADDED: Step 3 is User and business Details */}
        {primaryType && activeStep === 3 ? (
          <Card className="p-5">
            <CardHeader
              title="03 / 05 — User and business Details"
              description="User + business context for the audit."
            />
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Primary users (Who is this for?)"
                  error={showErrorsForStep ? validation.primaryUser : undefined}
                >
                  <TextInput
                    value={payload.primaryUser}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, primaryUser: e.target.value }))
                    }
                    placeholder=""
                  />
                </Field>
                <Field label="Primary User Intent">
                  <TextInput
                    value={payload.primaryUserIntent}
                    onChange={(e) =>
                      setPayload((p) => ({
                        ...p,
                        primaryUserIntent: e.target.value,
                      }))
                    }
                    placeholder=""
                  />
                </Field>
              </div>

              {/* ADDED */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="User age">
                  <TextInput
                    value={payload.userAge}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, userAge: e.target.value }))
                    }
                    placeholder=""
                  />
                </Field>
                <Field label="User gender">
                  <Select
                    value={payload.userGender}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, userGender: e.target.value }))
                    }
                  >
                    <option value="">Select…</option>
                    {/* UPDATED */}
                    <option value="women">Women</option>
                    <option value="men">Men</option>
                    <option value="both">Both (men & women)</option>
                    <option value="non_binary">Non-binary</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="User geography">
                  <TextInput
                    value={payload.userGeography}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, userGeography: e.target.value }))
                    }
                    placeholder=""
                  />
                </Field>
                <Field label="User language">
                  <TextInput
                    value={payload.userLanguage}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, userLanguage: e.target.value }))
                    }
                    placeholder=""
                  />
                </Field>
              </div>

              {/* UPDATED: removed Primary User Goal; user persona is full width */}
              <Field
                label="Primary User Goal"
                error={showErrorsForStep ? validation.primaryUserGoal : undefined}
              >
                <TextInput
                  value={payload.primaryUserGoal}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, primaryUserGoal: e.target.value }))
                  }
                  placeholder=""
                />
              </Field>

              {/* UPDATED: user persona uses audit-flow style inputs */}
              <Field label="User persona">
                <div className="space-y-3">
                  {payload.userPersona.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-[color:var(--card-border)] bg-white/60 text-sm font-semibold text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                        {idx + 1}
                      </div>
                      <TextInput
                        value={line}
                        onChange={(e) =>
                          setPayload((p) => {
                            const next = [...p.userPersona];
                            next[idx] = e.target.value;
                            return { ...p, userPersona: next };
                          })
                        }
                        placeholder=""
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 px-3"
                        onClick={() =>
                          setPayload((p) => {
                            const next = p.userPersona.filter((_, i) => i !== idx);
                            return { ...p, userPersona: next.length ? next : [""] };
                          })
                        }
                        disabled={payload.userPersona.length === 1}
                        aria-label="Remove persona line"
                        title="Remove"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setPayload((p) => ({ ...p, userPersona: [...p.userPersona, ""] }))
                    }
                  >
                    + Add another persona line
                  </Button>
                </div>
              </Field>

              <Field label="Primary Business Objective">
                <Textarea
                  value={payload.primaryBusinessObjective}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      primaryBusinessObjective: e.target.value,
                    }))
                  }
                  placeholder=""
                />
              </Field>

              <div className="space-y-3">
                <div className="text-sm font-semibold">Business competitors</div>
                {payload.businessCompetitors.map((c, idx) => (
                  <div key={idx} className="grid gap-3 sm:grid-cols-3">
                    <Field label={`Competitor ${String(idx + 1).padStart(2, "0")} name`}>
                      <TextInput
                        value={c.name}
                        onChange={(e) =>
                          setPayload((p) => {
                            const next = [...p.businessCompetitors];
                            next[idx] = { ...next[idx], name: e.target.value };
                            return { ...p, businessCompetitors: next };
                          })
                        }
                        placeholder="Competitor name"
                      />
                    </Field>
                    <Field
                      label={`Competitor ${String(idx + 1).padStart(2, "0")} URL`}
                      error={
                        showErrorsForStep
                          ? validation[`businessCompetitorUrl${idx}`]
                          : undefined
                      }
                    >
                      <TextInput
                        value={c.url}
                        onChange={(e) =>
                          setPayload((p) => {
                            const next = [...p.businessCompetitors];
                            next[idx] = { ...next[idx], url: e.target.value };
                            return { ...p, businessCompetitors: next };
                          })
                        }
                        placeholder="https://competitor.com"
                      />
                    </Field>
                    <Field label="Compare">
                      <TextInput
                        value={c.compareFocus}
                        onChange={(e) =>
                          setPayload((p) => {
                            const next = [...p.businessCompetitors];
                            next[idx] = {
                              ...next[idx],
                              compareFocus: e.target.value,
                            };
                            return { ...p, businessCompetitors: next };
                          })
                        }
                        placeholder=""
                      />
                    </Field>
                  </div>
                ))}
              </div>

              <Field label="Business Future goals">
                <Textarea
                  value={payload.businessFutureGoals}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      businessFutureGoals: e.target.value,
                    }))
                  }
                  placeholder=""
                />
              </Field>
            </div>
          </Card>
        ) : null}

        {/* UPDATED: Step 4 is Product URL + credentials */}
        {primaryType && activeStep === 4 ? (
          <Card className="p-5">
            <CardHeader
              title="04 / 05 — Product URL + credentials"
              description="The live URL the AI agent will open and navigate. If the product requires a login, provide credentials."
            />
            <div className="space-y-4">
              <Field
                label="Product URL"
                error={showErrorsForStep ? validation.productUrl : undefined}
              >
                <TextInput
                  value={payload.productUrl}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, productUrl: e.target.value }))
                  }
                  placeholder="https://yourproduct.com"
                />
              </Field>

              <Field label={accessLabel}>
                <Select
                  value={payload.accessMode}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      accessMode: e.target.value as AuditAccessMode,
                      auth: {
                        ...p.auth,
                        requiresLogin:
                          e.target.value !== "screenshot_upload_only" &&
                          e.target.value !== "internal_routes_only"
                            ? p.auth.requiresLogin
                            : false,
                      },
                    }))
                  }
                >
                  {accessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="rounded-xl border border-[color:var(--card-border)] bg-white/60 p-4 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                {primaryType === "marketing_website" || primaryType === "ecommerce" ? (
                  <span>
                    This audit will use public-page evidence first. Add labeled screenshots and
                    browser-extension JSON to score the site without login or internal routes.
                  </span>
                ) : payload.accessMode === "auto_login" ? (
                  <span>
                    The tool will try to sign in automatically, capture internal screens, and
                    save a reusable auth session when login succeeds.
                  </span>
                ) : payload.accessMode === "manual_browser_login" ? (
                  <span>
                    Manual browser login is prepared as a guided mode. For now, pair it with guided
                    capture steps or uploaded screenshots so the audit can continue with reliable
                    evidence.
                  </span>
                ) : payload.accessMode === "use_saved_session" ? (
                  <span>
                    The tool will try to restore a previously saved authenticated session for this
                    domain before running capture.
                  </span>
                ) : payload.accessMode === "internal_routes_only" ? (
                  <span>The tool will skip generic exploration and try only the internal routes you provide below.</span>
                ) : payload.accessMode === "screenshot_upload_only" ? (
                  <span>
                    The tool will build a Limited Coverage or evidence-only audit from your labeled
                    screenshots instead of trying live browser capture.
                  </span>
                ) : (
                  <span>
                    The audit will rely on extension-captured evidence first. Browserbase is treated
                    as an optional fallback only and is not required for scoring.
                  </span>
                )}
              </div>

              {/* ADDED */}
              <Field label="Screenshots">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-white dark:file:text-zinc-950 dark:hover:file:bg-zinc-200"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length === 0) return;
                    await uploadScreenshots(files);
                    e.currentTarget.value = "";
                  }}
                />

                {uploadingScreenshots ? (
                  <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Uploading screenshots…
                  </div>
                ) : null}

                {payload.artifacts.screenshots.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {payload.artifacts.screenshots.map((s, idx) => (
                      <div
                        key={`${s.name}-${idx}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--card-border)] bg-white/50 px-3 py-2 text-sm dark:bg-white/5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.name}</div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {Math.round(s.size / 1024)} KB · {s.label || "other"}
                          </div>
                        </div>
                        <Select
                          value={s.label || "other"}
                          onChange={(e) =>
                            setPayload((p) => ({
                              ...p,
                              artifacts: {
                                ...p.artifacts,
                                screenshots: p.artifacts.screenshots.map((shot, i) =>
                                  i === idx
                                    ? {
                                        ...shot,
                                        label: e.target.value as UploadedScreenshotLabel,
                                      }
                                    : shot,
                                ),
                              },
                            }))
                          }
                        >
                          {screenshotLabelOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPayload((p) => ({
                              ...p,
                              artifacts: {
                                ...p.artifacts,
                                screenshots: p.artifacts.screenshots.filter(
                                  (_, i) => i !== idx,
                                ),
                              },
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </Field>

              {/* ADDED */}
              <Field label="Critical-flow video (optional)">
                <input
                  type="file"
                  accept="video/*"
                  className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-xl file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-white dark:file:text-zinc-950 dark:hover:file:bg-zinc-200"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    await uploadCriticalFlowVideo(file);
                    e.currentTarget.value = "";
                  }}
                />

                {uploadingVideo ? (
                  <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                    Uploading video…
                  </div>
                ) : null}

                {payload.artifacts.criticalFlowVideo ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-[color:var(--card-border)] bg-white/50 px-3 py-2 text-sm dark:bg-white/5">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{payload.artifacts.criticalFlowVideo.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {payload.artifacts.criticalFlowVideo.type || "video"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPayload((p) => ({
                          ...p,
                          artifacts: { ...p.artifacts, criticalFlowVideo: null },
                        }));
                        setVideoFileName(null);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </Field>

              <Field
                label="Browser extension evidence (JSON)"
                hint="Paste the JSON captures from your extension. Each item can include screenshot URL, URL, title, headings, visible text, buttons, links, forms, tables, navigation labels, dropdown/modal state, DOM summary, and a screen type label."
                error={showErrorsForStep ? validation.extensionEvidence : undefined}
              >
                <div className="mb-2 rounded-xl border border-[color:var(--card-border)] bg-white/60 p-3 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                  <div className="font-medium text-[color:var(--ink)]">{extensionWorkflowTitle}</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {extensionWorkflowSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
                <Textarea
                  rows={10}
                  value={payload.artifacts.extensionCaptureJson}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      artifacts: { ...p.artifacts, extensionCaptureJson: e.target.value },
                    }))
                  }
                  placeholder={extensionJsonPlaceholder}
                />
              </Field>

              <Field
                label="Loom video link"
                error={showErrorsForStep ? validation.loomLink : undefined}
              >
                <TextInput
                  value={payload.artifacts.loomLink}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      artifacts: { ...p.artifacts, loomLink: e.target.value },
                    }))
                  }
                  placeholder="https://www.loom.com/share/…"
                />
              </Field>

              {/* ADDED */}
              <Field
                label="Notes for the AI"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color:var(--card-border)] bg-white/60 px-3 py-2 text-sm dark:bg-white/5">
                    <input
                      type="file"
                      accept=".txt,.md,text/plain"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const text = await f.text();
                        setTranscriptFileName(f.name);
                        setPayload((p) => ({
                          ...p,
                          artifacts: { ...p.artifacts, notes: text },
                        }));
                      }}
                    />
                    Upload transcript
                  </label>
                  {transcriptFileName ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Loaded: {transcriptFileName}
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={extracting}
                    onClick={extractIntakeFromTranscript}
                  >
                    {extracting ? "Extracting…" : "Extract from transcript"}
                  </Button>
                  {extractError ? (
                    <div className="w-full text-xs text-red-600 dark:text-red-400">
                      {extractError}
                    </div>
                  ) : null}
                </div>
                <Textarea
                  value={payload.artifacts.notes}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      artifacts: { ...p.artifacts, notes: e.target.value },
                    }))
                  }
                  placeholder=""
                />
              </Field>

              {primaryType === "saas" ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={payload.auth.requiresLogin}
                      onChange={(e) =>
                        setPayload((p) => ({
                          ...p,
                          auth: { ...p.auth, requiresLogin: e.target.checked },
                        }))
                      }
                    />
                    Product requires login to access
                  </label>

                  {payload.auth.requiresLogin && payload.accessMode === "auto_login" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Email / Username"
                        error={showErrorsForStep ? validation.authUser : undefined}
                      >
                        <TextInput
                          value={payload.auth.usernameOrEmail}
                          onChange={(e) =>
                            setPayload((p) => ({
                              ...p,
                              auth: { ...p.auth, usernameOrEmail: e.target.value },
                            }))
                          }
                          placeholder="test@example.com"
                          autoComplete="username"
                        />
                      </Field>
                      <Field
                        label="Password"
                        error={showErrorsForStep ? validation.authPass : undefined}
                      >
                        <TextInput
                          type="password"
                          value={payload.auth.password}
                          onChange={(e) =>
                            setPayload((p) => ({
                              ...p,
                              auth: { ...p.auth, password: e.target.value },
                            }))
                          }
                          placeholder="••••••••"
                          autoComplete="current-password"
                        />
                      </Field>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-white/10 bg-white/70 p-4 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                    Note: credentials are used only by the AI agent to navigate
                    authenticated flows. Your workflow should treat this data as
                    sensitive.
                  </div>
                </>
              ) : null}
            </div>
          </Card>
        ) : null}

        {primaryType && activeStep === 5 ? (
          <Card className="p-5">
            <CardHeader
              title="05 / 05 — Audit flow"
              description="Describe the full audit flow, exploration steps, required screenshots, and anything the agent must check before scoring."
            />
            <div className="space-y-3">
              <Field
                label="Audit flow instructions"
                hint="You can paste a full step-by-step flow like login → dashboard → module navigation → data table → filters → error states → then start the audit."
                error={showErrorsForStep ? validation.auditFlows : undefined}
              >
                <Textarea
                  rows={18}
                  value={payload.auditFlowText}
                  onChange={(e) =>
                    setPayload((p) => ({
                      ...p,
                      auditFlowText: e.target.value,
                    }))
                  }
                  placeholder={`Example:
Audit Flow for SCY Platform

1. Open the login page.
2. Log in using provided credentials.
3. Wait for dashboard/home to load.
4. Capture dashboard/home screen.
5. Open navigation and context selectors.
6. Open one internal module.
7. Capture table/form/filter states.
8. Capture one empty/error/loading state if available.
9. Only after required screenshots are captured, start the audit.`}
                />
              </Field>

              <div className="rounded-xl border border-[color:var(--card-border)] bg-white/60 p-4 text-sm text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
                The backend will convert this into ordered audit steps for exploration and evaluation. Use numbered steps, required screenshots, and explicit rules when needed.
              </div>

              <div className="space-y-4 rounded-xl border border-[color:var(--card-border)] bg-white/60 p-4 dark:bg-white/5">
                <div>
                  <div className="text-sm font-semibold text-[color:var(--ink)]">Guided Capture Steps</div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                    Add manual pre-audit capture steps the explorer should follow before scoring.
                  </div>
                </div>

                {payload.guidedCaptureSteps.map((step, idx) => (
                  <div key={idx} className="rounded-xl border border-[color:var(--card-border)] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-medium">Step {idx + 1}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-3"
                        onClick={() =>
                          setPayload((p) => {
                            const next = p.guidedCaptureSteps.filter((_, i) => i !== idx);
                            return {
                              ...p,
                              guidedCaptureSteps: next.length ? next : AUDIT_DEFAULTS.guidedCaptureSteps,
                            };
                          })
                        }
                        disabled={payload.guidedCaptureSteps.length === 1}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Step name">
                        <TextInput
                          value={step.stepName}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], stepName: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="Open Items screen"
                        />
                      </Field>
                      <Field label="Action type">
                        <Select
                          value={step.actionType}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = {
                                ...next[idx],
                                actionType: e.target.value as GuidedActionType,
                              };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                        >
                          {guidedActionTypes.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Click target text">
                        <TextInput
                          value={step.targetText}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], targetText: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="Master Data"
                        />
                      </Field>
                      <Field label="Target selector">
                        <TextInput
                          value={step.targetSelector}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], targetSelector: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder='[data-audit="module-dropdown"]'
                        />
                      </Field>
                      <Field label="Then click text">
                        <TextInput
                          value={step.thenClickText}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], thenClickText: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="SCP"
                        />
                      </Field>
                      <Field label="Screenshot type">
                        <TextInput
                          value={step.screenshotType}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], screenshotType: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="data_grid"
                        />
                      </Field>
                      <Field label="Expected text">
                        <TextInput
                          value={step.expectedText}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], expectedText: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="Supply Chain Planning"
                        />
                      </Field>
                      <Field label="Expected heading">
                        <TextInput
                          value={step.expectedHeading}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], expectedHeading: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="Items"
                        />
                      </Field>
                      <Field label="Expected URL contains">
                        <TextInput
                          value={step.expectedUrlContains}
                          onChange={(e) =>
                            setPayload((p) => {
                              const next = [...p.guidedCaptureSteps];
                              next[idx] = { ...next[idx], expectedUrlContains: e.target.value };
                              return { ...p, guidedCaptureSteps: next };
                            })
                          }
                          placeholder="/scp/master-data/items"
                        />
                      </Field>
                      <Field label="Required">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={step.required}
                            onChange={(e) =>
                              setPayload((p) => {
                                const next = [...p.guidedCaptureSteps];
                                next[idx] = { ...next[idx], required: e.target.checked };
                                return { ...p, guidedCaptureSteps: next };
                              })
                            }
                          />
                          Required step
                        </label>
                      </Field>
                    </div>

                    <Field label="Expected evidence keywords" hint="Comma-separated keywords like table, grid, filters, rows">
                      <TextInput
                        value={step.expectedEvidence}
                        onChange={(e) =>
                          setPayload((p) => {
                            const next = [...p.guidedCaptureSteps];
                            next[idx] = { ...next[idx], expectedEvidence: e.target.value };
                            return { ...p, guidedCaptureSteps: next };
                          })
                        }
                        placeholder="table, grid, rows, filters"
                      />
                    </Field>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setPayload((p) => ({
                      ...p,
                      guidedCaptureSteps: [
                        ...p.guidedCaptureSteps,
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
                    }))
                  }
                >
                  + Add guided step
                </Button>

                {showErrorsForStep && validation.guidedCaptureSteps ? (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {validation.guidedCaptureSteps}
                  </p>
                ) : null}
              </div>

              {primaryType === "saas" ? (
                <Field
                  label="Manual internal routes after login"
                  hint="Optional. Add one internal route per line, like /scp or /scp/master-data/items."
                >
                  <Textarea
                    rows={6}
                    value={payload.internalRoutesText}
                    onChange={(e) =>
                      setPayload((p) => ({
                        ...p,
                        internalRoutesText: e.target.value,
                      }))
                    }
                    placeholder={"/scp\n/scp/master-data/items\n/scp/transactional-data/resource-capacity"}
                  />
                </Field>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* ADDED: Back/Next navigation (validation shows only after Next) */}
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={back}
            disabled={activeStep === 1 || loading}
          >
            Back
          </Button>
          {activeStep < maxStep ? (
            <Button
              type="button"
              variant="primary"
              onClick={next}
              disabled={loading}
            >
              Next
            </Button>
          ) : null}
        </div>

        {primaryType && activeStep === 5 ? (
        <Card className="p-5">
          <CardHeader
            title="Submit"
            description={
              isAllRequiredComplete
                ? "Ready to send your context to the agent."
                : "Complete the required steps to unlock submission."
            }
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {isAllRequiredComplete ? (
              <Button type="submit" variant="primary" size="lg" disabled={loading}>
                {loading ? <LoadingSpinner /> : null}
                Send context to agent
              </Button>
            ) : null}
          </div>

          {/* UPDATED: removed helper text */}
        </Card>
        ) : null}
      </section>
    </form>
  );
}
