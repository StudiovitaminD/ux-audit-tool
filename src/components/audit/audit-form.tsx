"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select, Textarea, TextInput } from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BucketPicker, bucketRows } from "@/components/audit/bucket-picker";
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
  SESSION_STORAGE_KEY,
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

function createFreshAuditPayload(): AuditPayload {
  if (typeof structuredClone === "function") {
    return structuredClone(AUDIT_DEFAULTS);
  }
  return JSON.parse(JSON.stringify(AUDIT_DEFAULTS)) as AuditPayload;
}

type PersonaType = "primary" | "secondary";

type PersonaCard = {
  personaType: PersonaType | "";
  primaryUser: string;
  userAge: string;
  userGender: string;
  userLanguage: string;
  primaryUserIntent: string;
  userGeography: string;
  primaryUserGoal: string;
};

type FilePickerButtonProps = {
  buttonText: string;
  accept: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => Promise<void> | void;
};

function FilePickerButton({
  buttonText,
  accept,
  multiple = false,
  onFilesSelected,
}: FilePickerButtonProps) {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center rounded-full border-2 border-[#ff8a1f] bg-white px-5 py-3 text-sm font-semibold text-[#ff8a1f] shadow-none">
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={async (e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          if (files.length === 0) return;
          await onFilesSelected(files);
          e.currentTarget.value = "";
        }}
      />
      {buttonText}
    </label>
  );
}

type SectionHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="mb-8 flex items-center justify-between gap-4 border-b border-[color:var(--cream-dark)] pb-8">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm text-zinc-600 dark:text-zinc-300">{description}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

function createEmptyPersonaCard(personaType: PersonaType | "" = "secondary"): PersonaCard {
  return {
    personaType,
    primaryUser: "",
    userAge: "",
    userGender: "",
    userLanguage: "",
    primaryUserIntent: "",
    userGeography: "",
    primaryUserGoal: "",
  };
}

function serializePersonaCard(card: PersonaCard) {
  return [
    `Persona type: ${card.personaType || "secondary"}`.trim(),
    `Primary users: ${card.primaryUser}`.trim(),
    `Age group: ${card.userAge}`.trim(),
    `User gender: ${card.userGender}`.trim(),
    `User language: ${card.userLanguage}`.trim(),
    `User preferred Platform: ${card.primaryUserIntent}`.trim(),
    `User geography: ${card.userGeography}`.trim(),
    `User Goal: ${card.primaryUserGoal}`.trim(),
  ].join("\n");
}

function parsePersonaCard(value: string): PersonaCard | null {
  const card = createEmptyPersonaCard("");
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;
    const label = line.slice(0, separatorIndex).trim().toLowerCase();
    const valueText = line.slice(separatorIndex + 1).trim();
    if (!valueText) continue;
    if (label === "persona type") {
      const normalized = valueText.toLowerCase();
      if (normalized === "primary" || normalized === "secondary") {
        card.personaType = normalized;
      }
    }
    if (label === "primary users") card.primaryUser = valueText;
    if (label === "age group") card.userAge = valueText;
    if (label === "user gender") card.userGender = valueText;
    if (label === "user language") card.userLanguage = valueText;
    if (label === "user preferred platform") card.primaryUserIntent = valueText;
    if (label === "user geography") card.userGeography = valueText;
    if (label === "user goal") card.primaryUserGoal = valueText;
  }

  return Object.values(card).some((field) => field.trim().length > 0) ? card : null;
}

function personaCardsFromPayload(payload: AuditPayload): PersonaCard[] {
  const parsedCards = payload.userPersona
    .map((entry, index) => {
      const card = parsePersonaCard(entry);
      if (!card) return null;
      if (card.personaType !== "primary" && card.personaType !== "secondary") {
        card.personaType = index === 0 ? "primary" : "secondary";
      }
      return card;
    })
    .filter((entry): entry is PersonaCard => entry !== null);

  if (parsedCards.length > 0) return parsedCards;

  return [
    {
      personaType: "primary",
      primaryUser: payload.primaryUser,
      userAge: payload.userAge,
      userGender: payload.userGender,
      userLanguage: payload.userLanguage,
      primaryUserIntent: payload.primaryUserIntent,
      userGeography: payload.userGeography,
      primaryUserGoal: payload.primaryUserGoal,
    },
  ];
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
      { label: "Improve User Experience", value: "improve_user_experience" },
      { label: "Make Content Clearer", value: "make_content_clearer" },
      { label: "Make Navigation Simpler", value: "make_navigation_simpler" },
      { label: "Improve the Overall Look & Feel", value: "improve_look_feel" },
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
];

// ADDED
const frequencyOfUseOptions: AuditSelectOption[] = [
  { label: "Daily", value: "daily" },
  { label: "A few times a week", value: "weekly" },
  { label: "A few times a month", value: "monthly" },
  { label: "Rarely", value: "rarely" },
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
  { label: "Direct audit using URL", value: "browser_extension_capture" },
];

function accessModeOptionsFor(
  type: AuditPayload["product"]["type"],
): AuditSelectOption[] {
  if (type === "saas") {
    return accessModeOptions.filter(
      (option) =>
        option.value === "screenshot_upload_only" ||
        option.value === "browser_extension_capture",
    );
  }

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
  const [payload, setPayload] = useState<AuditPayload>(() => createFreshAuditPayload());
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
  const [personaCards, setPersonaCards] = useState<PersonaCard[]>(() => [
    createEmptyPersonaCard("primary"),
  ]);
  const formRef = useRef<HTMLFormElement | null>(null);

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
  const selectedBucketSet = new Set(payload.selectedBuckets.map((bucket) => bucket.trim()));
  const allBucketsSelected =
    bucketRows.length > 0 && bucketRows.every((row) => selectedBucketSet.has(row.bucket));
  const wantsScreenReaderCapture = selectedBucketSet.has("Screen Reader Support");
  const wantsPerformanceCapture = selectedBucketSet.has("Performance");

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
    const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
    void fetchAppSession({ expectedStorageValue: storageSnapshot })
      .then((serverSession) => {
        if (window.localStorage.getItem(SESSION_STORAGE_KEY) !== storageSnapshot) return;
        setAppSession(serverSession);
        setPayload((prev) => ({ ...prev, userAccess: auditUserAccessFromSession(serverSession) }));
      })
      .catch(() => undefined);
  }, [searchParams]);

  useEffect(() => {
    if (!payload.product.type) return;
    if (canAccessProductType(appSession.role, payload.product.type)) return;
    const fallbackType = (allowedProductTypes[0] as AuditPayload["product"]["type"]) || "";
    setError(
      appSession.role === "admin"
        ? null
        : "This audit type is not available on your current plan. We’ve switched you to an allowed audit type so you can keep going.",
    );
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

  useEffect(() => {
    if (!isPublicAuditType(primaryType)) return;
    if (payload.accessMode === "browser_extension_capture") return;
    setPayload((prev) => ({
      ...prev,
      accessMode: "browser_extension_capture",
      auth: {
        ...prev.auth,
        requiresLogin: false,
        usernameOrEmail: "",
        password: "",
      },
    }));
  }, [payload.accessMode, primaryType]);

  useEffect(() => {
    const nextPrimary = personaCards[0] ?? createEmptyPersonaCard("primary");
    const nextUserPersona = personaCards.map((card) => serializePersonaCard(card));

    setPayload((prev) => {
      if (
        prev.userPersona.length === nextUserPersona.length &&
        prev.primaryUser === nextPrimary.primaryUser &&
        prev.userAge === nextPrimary.userAge &&
        prev.userGender === nextPrimary.userGender &&
        prev.userLanguage === nextPrimary.userLanguage &&
        prev.primaryUserIntent === nextPrimary.primaryUserIntent &&
        prev.userGeography === nextPrimary.userGeography &&
        prev.primaryUserGoal === nextPrimary.primaryUserGoal &&
        prev.userPersona.every((entry, index) => entry === nextUserPersona[index])
      ) {
        return prev;
      }

      return {
        ...prev,
        primaryUser: nextPrimary.primaryUser,
        userAge: nextPrimary.userAge,
        userGender: nextPrimary.userGender,
        userLanguage: nextPrimary.userLanguage,
        primaryUserIntent: nextPrimary.primaryUserIntent,
        userGeography: nextPrimary.userGeography,
        primaryUserGoal: nextPrimary.primaryUserGoal,
        userPersona: nextUserPersona,
      };
    });
  }, [personaCards]);

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
      setPersonaCards(personaCardsFromPayload(sanitized));
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
        setPersonaCards(personaCardsFromPayload(nextPayload));
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
    const baseSteps: Step[] = [
      // UPDATED: Product type lives under “Audit Details”
      { id: 1, title: "Audit Details", required: true },
      // ADDED
      { id: 2, title: "Audit buckets", required: true },
      // UPDATED
      { id: 3, title: "Business details", required: true },
      // ADDED
      { id: 4, title: "Add User Persona", required: true },
      { id: 5, title: "Business competitors", required: true },
      { id: 6, title: "Product Access Details", required: true },
    ];
    return primaryType === "saas"
      ? [...baseSteps, { id: 7, title: "Audit flow", required: true }]
      : baseSteps;
  }, [primaryType]); // UPDATED

  // ADDED
  const maxStep = steps[steps.length - 1]?.id ?? 1;
  // ADDED
  const showErrorsForStep = attemptedSteps.includes(activeStep);

  useEffect(() => {
    if (activeStep > maxStep) setActiveStep(maxStep);
  }, [activeStep, maxStep]);

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
    setExtractError(null);
    setTranscriptFileName(null);
    setCustomAuditGoal("");
    setPersonaCards([createEmptyPersonaCard("primary")]);
    setPayload({
      ...createFreshAuditPayload(),
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
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      formRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    router.replace("/report");
  }

  function handleCancelProcess() {
    const shouldCancel = window.confirm("Are you sure you want to cancel the process?");
    if (!shouldCancel) return;
    resetAll();
  }

  function updatePersonaCard(index: number, patch: Partial<PersonaCard>) {
    setPersonaCards((cards) => {
      const next = [...cards];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addPersonaCard() {
    setPersonaCards((cards) => [...cards, createEmptyPersonaCard()]);
  }

  function removePersonaCard(index: number) {
    setPersonaCards((cards) => (cards.length > 1 ? cards.filter((_, itemIdx) => itemIdx !== index) : cards));
  }

  function selectAllBuckets() {
    setPayload((p) => {
      const allBuckets = bucketRows.map((row) => row.bucket);
      const nextSelected = allBuckets.every((bucket) => p.selectedBuckets.includes(bucket))
        ? []
        : allBuckets;

      return {
        ...p,
        selectedBuckets: nextSelected,
      };
    });
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
    if (!isPublicAuditType(primaryType) && payload.artifacts.loomLink && !isUrlLike(payload.artifacts.loomLink)) {
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
    if (!payload.primaryPlatform) errors.primaryPlatform = "Select a primary platform.";
    if (payload.product.type === "saas") {
      if (!payload.frequencyOfUse) errors.frequencyOfUse = "Select frequency of use.";
      if (!payload.dynamic_answers.saas.q16_solo_or_collab?.trim())
        errors.saasUsageMode = "Select usage mode.";
    }
    if (!payload.differentiation.trim())
      errors.differentiation = "Product differentiation is required.";
    if (!payload.primaryBusinessObjective.trim())
      errors.primaryBusinessObjective = "Business objective is required.";
    if (!payload.businessFutureGoals.trim())
      errors.businessFutureGoals = "Business future goals are required.";

    if (payload.auditGoals.length === 0)
      errors.auditGoals = "Select at least one audit goal.";

    // ADDED (n8n required)
    if (payload.selectedBuckets.length === 0)
      errors.selectedBuckets = "Select at least one bucket.";

    const hasFlow = payload.auditFlowText.trim().length > 0;
    if (!hasFlow) errors.auditFlows = "Add at least one audit flow.";
    if (!isPublicAuditType(primaryType)) {
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
          "Loom video could not be read automatically. Please add manual guided capture steps or internal routes.";
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
        payload.accessMode === "browser_extension_capture" &&
        !hasExtensionEvidence(payload)
      ) {
        errors.extensionEvidence = "Add at least one extension-captured page, screenshot, or uploaded video before submitting.";
      }
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
      payload.productName.trim() &&
      payload.primaryPlatform &&
      payload.auditGoals.length > 0
    )
      done.add(1);
    // ADDED: step 2 is audit buckets
    if (payload.selectedBuckets.length > 0) done.add(2);
    const saasExtraOk =
      payload.product.type !== "saas"
        ? true
        : !!payload.frequencyOfUse &&
          !!payload.dynamic_answers.saas.q16_solo_or_collab?.trim();

    const businessDetailsOk =
      payload.differentiation.trim() &&
      payload.primaryBusinessObjective.trim() &&
      payload.businessFutureGoals.trim();

    if (businessDetailsOk && saasExtraOk)
      done.add(3);

    // ADDED: step 4 is user + business details
    if (payload.primaryUser.trim() && payload.primaryUserGoal.trim()) done.add(4);
    // UPDATED: step 5 is business competitors
    const filledBusinessCompetitors = payload.businessCompetitors.filter(
      (c) => c.name.trim() || c.url.trim() || c.compareFocus.trim(),
    );
    const businessCompetitorsOk =
      filledBusinessCompetitors.length > 0 &&
      filledBusinessCompetitors.every((c) => !!c.name.trim() && !!c.url.trim() && isUrlLike(c.url));
    if (businessCompetitorsOk) done.add(5);
    // UPDATED: step 6 is product access details
    if (isPublicAuditType(primaryType)) {
      if (payload.productUrl.trim() && isUrlLike(payload.productUrl)) {
        done.add(6);
      }
    } else if (
      payload.productUrl.trim() &&
      isUrlLike(payload.productUrl) &&
      (payload.accessMode !== "auto_login" ||
        !payload.auth.requiresLogin ||
        (payload.auth.usernameOrEmail.trim() && payload.auth.password.trim()))
    ) {
      done.add(6);
    }
    // UPDATED: step 7 is audit flow
    if (primaryType === "saas" && payload.auditFlowText.trim()) done.add(7);
    return done;
  }, [payload]);

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
      router.push("/sign-in?returnTo=/report");
      return;
    }

    const missingRequiredSteps = steps
      .filter((s) => s.required)
      .map((s) => s.id)
      .filter((id) => !completion.has(id));
    if (missingRequiredSteps.length > 0) {
      setError("Please complete the required sections before sending the audit.");
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
      const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
      void fetchAppSession({ expectedStorageValue: storageSnapshot })
        .then((next) => {
          if (window.localStorage.getItem(SESSION_STORAGE_KEY) !== storageSnapshot) return;
          setAppSession(next);
        })
        .catch(() => undefined);
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

  const firstIncompleteStep = useMemo(() => {
    for (const step of steps) {
      if (!completion.has(step.id)) return step.id;
    }
    return maxStep;
  }, [steps, completion, maxStep]);

  useEffect(() => {
    if (activeStep > firstIncompleteStep) {
      setActiveStep(firstIncompleteStep);
    }
  }, [activeStep, firstIncompleteStep]);

  function goto(step: number) {
    setError(null);
    if (step > firstIncompleteStep) return;
    setActiveStep(Math.min(step, maxStep));
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
    setActiveStep((s) => Math.min(maxStep, s + 1));
  }

  function back() {
    setError(null);
    setActiveStep((s) => Math.max(1, s - 1));
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="grid gap-6 pb-32 lg:grid-cols-12"
    >
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
          <div className="mt-6 space-y-2">
            {steps.map((s) => {
              const done = completion.has(s.id);
              const active = activeStep === s.id;
              const isLocked = s.id > firstIncompleteStep;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (isLocked) return;
                    goto(s.id);
                  }}
                  disabled={isLocked}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all",
                    active
                      ? "bg-[color:var(--cream-dark)] dark:bg-[color:var(--white)] border-[color:var(--cream-mid)] text-[color:var(--ink)] shadow-sm font-semibold scale-[1.02]"
                      : isLocked
                        ? "cursor-not-allowed border-dashed border-[color:var(--cream-dark)] bg-white/40 opacity-55 text-[color:var(--ink-muted)] shadow-none dark:bg-white/5"
                        : "hover:bg-[color:var(--cream-dark)]/50 dark:hover:bg-[color:var(--white)]/50 text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-all",
                      active
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow-sm ring-2 ring-[color:var(--accent)]/20"
                        : done
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : isLocked
                            ? "border-dashed border-[color:var(--cream-dark)] bg-[color:var(--cream)] text-[color:var(--ink-faint)]"
                            : "border-[color:var(--cream-dark)] text-[color:var(--ink-muted)] bg-[color:var(--white)] dark:bg-[color:var(--cream-dark)]",
                    ].join(" ")}
                  >
                    {done ? "✓" : isLocked ? "🔒" : s.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-none">
                      {stepLabel(s)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      </aside>

      <section className="space-y-6 lg:col-span-8">
        {/* UPDATED: remove redundant type selection card; keep reset only */}

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {/* UPDATED: Step 1 always renders so the user can start immediately */}
        {activeStep === 1 ? (
          <Card className="p-5">
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-[color:var(--cream-dark)] pb-8">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-tight">Audit Details</h2>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Product type" error={showErrorsForStep ? validation.productType : undefined}>
                <Select
                  value={payload.product.type}
                  onChange={(e) =>
                    setProductType(e.target.value as AuditPayload["product"]["type"])
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

              <Field label="Product name" error={showErrorsForStep ? validation.productName : undefined}>
                <TextInput
                  value={payload.productName}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, productName: e.target.value }))
                  }
                  placeholder="e.g. Notion, Stripe, Figma"
                />
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
                  placeholder="Choose one or more audit goals"
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
              <Field label="About the product">
                <Textarea
                  value={payload.knownProblem}
                  onChange={(e) =>
                    setPayload((p) => ({ ...p, knownProblem: e.target.value }))
                  }
                  placeholder="e.g. Users are dropping off on the signup form"
                />
              </Field>

            </div>
          </Card>
        ) : null}

        {activeStep === 2 ? (
          <Card className="p-5">
            <SectionHeader
              title="Audit Buckets"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={selectAllBuckets}
                  className="whitespace-nowrap"
                >
                  {allBucketsSelected ? "Unselect all" : "Select all"}
                </Button>
              }
            />
            <div className="mt-3">
              <BucketPicker
                value={payload.selectedBuckets}
                onChange={(next) =>
                  setPayload((p) => ({ ...p, selectedBuckets: next }))
                }
                error={showErrorsForStep ? validation.selectedBuckets : undefined}
              />
            </div>
          </Card>
        ) : null}

        {/* UPDATED: Step 3 is Product context */}
        {activeStep === 3 ? (
          <Card className="p-5">
            <SectionHeader title="Business Details" />
            <div className="space-y-4">
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

              <div className="space-y-4">
                <Field
                  label="Business USPs"
                  error={showErrorsForStep ? validation.differentiation : undefined}
                >
                  <Textarea
                    value={payload.differentiation}
                    onChange={(e) =>
                      setPayload((p) => ({ ...p, differentiation: e.target.value }))
                    }
                    placeholder="e.g. Fast onboarding, intuitive UI, trusted by teams"
                  />
                </Field>

                <Field label="Business Objective">
                  <Textarea
                    value={payload.primaryBusinessObjective}
                    onChange={(e) =>
                      setPayload((p) => ({
                        ...p,
                        primaryBusinessObjective: e.target.value,
                      }))
                    }
                    placeholder="e.g. Increase conversions, reduce drop-off, improve retention"
                  />
                </Field>
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
                  placeholder="e.g. Launch mobile app, expand to enterprise, improve activation"
                />
              </Field>
            </div>
          </Card>
        ) : null}

        {/* ADDED: Step 4 is Add User Persona */}
        {activeStep === 4 ? (
          <Card className="p-5">
            <SectionHeader title="Add User Persona" />
            <div className="space-y-5">
              <div className="space-y-4">
                {personaCards.map((persona, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-[#e5e0d4] bg-white/70 p-5 sm:p-6"
                  >
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-nowrap items-center gap-3">
                        <div className="shrink-0 text-xl font-semibold text-[color:var(--ink)]">
                          {String(index + 1).padStart(2, "0")} User persona
                        </div>
                        <Select
                          value={persona.personaType || "secondary"}
                          onChange={(e) =>
                            updatePersonaCard(index, {
                              personaType: e.target.value as PersonaType,
                            })
                          }
                          className="h-9 w-20 shrink-0 rounded-full border border-[color:var(--cream-dark)] bg-[color:var(--cream)] px-3 pr-8 text-xs font-semibold text-[color:var(--ink)] shadow-none"
                        >
                          <option value="primary">Primary</option>
                          <option value="secondary">Secondary</option>
                        </Select>
                      </div>
                      {index > 0 ? (
                        <button
                          type="button"
                          className="inline-flex size-12 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                          onClick={() => removePersonaCard(index)}
                          aria-label={`Remove persona ${String(index + 1).padStart(2, "0")}`}
                        >
                          <img
                            src="/delete-cropped.png"
                            alt=""
                            aria-hidden="true"
                            className="size-10 object-contain"
                          />
                        </button>
                      ) : (
                        <div aria-hidden="true" className="h-12 w-12" />
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <Field
                        label="Primary users (Who is this for?)"
                        error={showErrorsForStep && index === 0 ? validation.primaryUser : undefined}
                      >
                        <TextInput
                          value={persona.primaryUser}
                          onChange={(e) =>
                            updatePersonaCard(index, { primaryUser: e.target.value })
                          }
                          placeholder="e.g. Marketing manager, student, buyer"
                        />
                      </Field>
                      <Field label="Age group">
                        <TextInput
                          value={persona.userAge}
                          onChange={(e) => updatePersonaCard(index, { userAge: e.target.value })}
                          placeholder="e.g. 18-24, 25-34"
                        />
                      </Field>
                      <Field label="User gender">
                        <Select
                          value={persona.userGender}
                          onChange={(e) =>
                            updatePersonaCard(index, { userGender: e.target.value })
                          }
                        >
                          <option value="">Select…</option>
                          <option value="women">Female</option>
                          <option value="men">Male</option>
                          <option value="both">Both</option>
                        </Select>
                      </Field>
                      <Field label="User language">
                        <TextInput
                          value={persona.userLanguage}
                          onChange={(e) =>
                            updatePersonaCard(index, { userLanguage: e.target.value })
                          }
                          placeholder="e.g. English, Hindi"
                        />
                      </Field>
                      <Field label="User preferred Platform">
                        <Select
                          value={persona.primaryUserIntent}
                          onChange={(e) =>
                            updatePersonaCard(index, { primaryUserIntent: e.target.value })
                          }
                        >
                          <option value="">Select…</option>
                          <option value="desktop">Desktop</option>
                          <option value="mobile">Mobile</option>
                          <option value="both">Both</option>
                        </Select>
                      </Field>
                      <Field label="User geography">
                        <TextInput
                          value={persona.userGeography}
                          onChange={(e) =>
                            updatePersonaCard(index, { userGeography: e.target.value })
                          }
                          placeholder="India, Pune"
                        />
                      </Field>
                    </div>

                    <div className="mt-4">
                      <Field
                        label="User Goal"
                        error={showErrorsForStep && index === 0 ? validation.primaryUserGoal : undefined}
                      >
                        <Textarea
                          rows={4}
                          value={persona.primaryUserGoal}
                          onChange={(e) =>
                            updatePersonaCard(index, { primaryUserGoal: e.target.value })
                          }
                          placeholder="e.g. Complete a task quickly without confusion"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-start">
                <Button type="button" variant="secondary" size="sm" onClick={addPersonaCard}>
                  Add persona
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        {/* UPDATED: Step 5 is Business competitors */}
        {activeStep === 5 ? (
          <Card className="p-5">
            <SectionHeader title="Business competitors" />
            <div className="space-y-5">
              {payload.businessCompetitors.map((c, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[#e5e0d4] bg-white/70 p-4 sm:p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-neutral-500">
                      Competitor {String(idx + 1).padStart(2, "0")}
                    </div>
                    {idx > 0 ? (
                      <button
                        type="button"
                        className="inline-flex size-12 items-center justify-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                        onClick={() =>
                          setPayload((p) => ({
                            ...p,
                            businessCompetitors: p.businessCompetitors.filter(
                              (_, itemIdx) => itemIdx !== idx,
                            ),
                          }))
                        }
                        aria-label={`Remove competitor ${String(idx + 1).padStart(2, "0")}`}
                      >
                        <img
                          src="/delete-cropped.png"
                          alt=""
                          aria-hidden="true"
                          className="size-10 object-contain"
                        />
                      </button>
                    ) : (
                      <div aria-hidden="true" className="h-12 w-12" />
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Competitor name">
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
                      label="Competitor URL"
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
                        placeholder="e.g. Design, speed, navigation"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-start">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setPayload((p) => ({
                    ...p,
                    businessCompetitors: [
                      ...p.businessCompetitors,
                      { name: "", url: "", compareFocus: "" },
                    ],
                  }))
                }
              >
                + Add more competitor
              </Button>
            </div>
          </Card>
        ) : null}

        {/* UPDATED: Step 6 is Product URL + credentials */}
        {activeStep === 6 ? (
          <Card className="p-5">
            <SectionHeader title="Product Access Details" />
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

              {isPublicAuditType(primaryType) ? (
                <>
                  <Field label="Screenshots">
                    <FilePickerButton
                      buttonText="Choose files"
                      accept="image/*"
                      multiple
                      onFilesSelected={async (files) => {
                        await uploadScreenshots(files);
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

                </>
              ) : (
                <>
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
                    {payload.accessMode === "auto_login" ? (
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
                    <FilePickerButton
                      buttonText="Choose files"
                      accept="image/*"
                      multiple
                      onFilesSelected={async (files) => {
                        await uploadScreenshots(files);
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
                    <FilePickerButton
                      buttonText="Choose files"
                      accept="video/*"
                      onFilesSelected={async (files) => {
                        const file = files[0];
                        if (!file) return;
                        await uploadCriticalFlowVideo(file);
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
                          <div className="truncate font-medium">
                            {payload.artifacts.criticalFlowVideo.name}
                          </div>
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
                </>
              )}
            </div>
          </Card>
        ) : null}

        {primaryType === "saas" && activeStep === 7 ? (
          <Card className="p-5">
            <SectionHeader
              title="Audit flow"
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

              {wantsScreenReaderCapture || wantsPerformanceCapture ? (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100">
                  <div className="font-semibold">Recommended capture prompts for selected buckets</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {wantsScreenReaderCapture ? (
                      <li>
                        For <span className="font-medium">Screen Reader Support</span>, add at least one
                        guided step that inspects semantics, labels, alt text, or announcements, and set
                        the screenshot type to <code>semantic_capture</code>.
                      </li>
                    ) : null}
                    {wantsPerformanceCapture ? (
                      <li>
                        For <span className="font-medium">Performance</span>, add at least one guided step
                        that switches to a mobile or low-powered pass and set the screenshot type to{" "}
                        <code>mobile_test</code>.
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

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

      </section>

      <div
        className="no-print fixed inset-x-16 bottom-6 z-30 rounded-[var(--radius)] floatingBarShell p-4 shadow-lg shadow-black/10 backdrop-blur"
        data-audit-pagination
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancelProcess}
            disabled={loading}
            className="floatingBarSecondary"
          >
            Cancel
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={back}
              disabled={activeStep === 1 || loading}
              className="floatingBarSecondary"
            >
              Back
            </Button>
            {activeStep < maxStep ? (
              <Button
                type="button"
                variant="primary"
                onClick={next}
                disabled={loading}
                className="floatingBarPrimary"
              >
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                variant="primary"
                disabled={loading || !isAllRequiredComplete}
                className="floatingBarPrimary"
              >
                {loading ? <LoadingSpinner /> : null}
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
