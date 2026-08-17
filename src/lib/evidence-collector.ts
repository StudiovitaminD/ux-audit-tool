import { type BrowserContext, type Page } from "playwright-core";
import {
  createBrowserProvider,
  getBrowserProviderDiagnostics,
  loadContextAuthState,
  productDomain,
  saveContextAuthState,
  type AuditAccessMode,
} from "@/lib/browser-provider";
import { getErrorMessage } from "@/lib/error-utils";

export type EvidencePage = {
  label?: string;
  url: string;
  title: string;
  metaDescription?: string;
  h1: string[];
  h2: string[];
  h3: string[];
  topNavLinks: Array<{ text: string; href: string }>;
  primaryCtas?: Array<{ text: string; href: string }>;
  buttons?: string[];
  formLabels?: string[];
  placeholders?: string[];
  tabs?: string[];
  alerts?: string[];
  tableHeaders?: string[];
  emptyStateHints?: string[];
  textSnippet: string;
};

export type EvidenceScreenshot = {
  label: string;
  url: string;
  source?: "browserbase" | "local_playwright" | "guided_step" | "recorded_journey" | "route" | "upload" | "auto_explore";
  screenName?: string;
  screenType?: string;
  title?: string;
  heading?: string;
  visibleTextSummary?: string;
  hasSidebar?: boolean;
  hasTopNav?: boolean;
  hasTable?: boolean;
  hasForm?: boolean;
  hasCards?: boolean;
  hasDropdownOpen?: boolean;
  hasModal?: boolean;
  hasMainContent?: boolean;
  hasErrorState?: boolean;
  hasEmptyState?: boolean;
  viewport?: string;
  screenshotPath?: string;
  relatedStep?: string;
  sessionReplayUrl?: string;
  isValidAuditEvidence?: boolean;
  rejectedReason?: string;
};

type NavigationCandidate = {
  type: string;
  text: string;
  href: string;
  selector?: string;
  score?: number;
};

export type EvidenceCoverage = {
  passed: boolean;
  status: "full_coverage" | "usable_coverage" | "limited_coverage" | "insufficient_coverage" | "failed_login";
  summary: string;
  missing: string[];
  required: string[];
  details?: string;
  evidenceSummary?: Record<string, boolean | number | string>;
};

export type EvidenceBundle = {
  pages: EvidencePage[];
  screenshotDataUrl: string | null;
  screenshots: EvidenceScreenshot[];
  warnings: string[];
  visitedFlows: string[];
  coverage?: EvidenceCoverage;
  auth?: {
    required: boolean;
    attempted: boolean;
    success: boolean;
    message?: string;
  };
  debug?: Record<string, unknown>;
};

export type ExplorerInput = {
  productUrl: string;
  auditFlows: string[];
  productType: "saas" | "ecommerce" | "marketing_website";
  accessMode?: AuditAccessMode;
  loginRequired?: boolean;
  loginEmail?: string;
  loginPassword?: string;
  uploadedScreenshots?: Array<{
    name?: string;
    url: string;
    label?: string;
  }>;
  uploadedVideo?: {
    name?: string;
    url: string;
    type?: string;
    size?: number;
    publicId?: string;
    format?: string;
    resourceType?: string;
    transcript?: string;
  };
  criticalFlowNotes?: string;
  extensionCaptureJson?: string;
  guidedCaptureSteps?: Array<{
    stepName?: string;
    actionType?: string;
    targetText?: string;
    targetSelector?: string;
    thenClickText?: string;
    expectedUrlContains?: string;
    expectedText?: string;
    expectedHeading?: string;
    expectedEvidence?: string;
    screenshotType?: string;
    required?: boolean;
  }>;
  internalRoutes?: string[];
};

function normalizeScreenType(value: unknown) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!text) return "other";
  if (/login|sign[\s_-]?in|auth/.test(text)) return "login";
  if (/dashboard|home|overview/.test(text)) return "dashboard";
  if (/nav|navigation|menu|sidebar|left[\s_-]?nav/.test(text)) return "navigation";
  if (/context|selector|dropdown|division/.test(text)) return "context_selector";
  if (/grid|table|items|capacity|report|resource|planner workbench/.test(text)) return "data_grid";
  if (/form|input|field|edit|validation/.test(text)) return "form";
  if (/error|alert|warning/.test(text)) return "error_state";
  if (/empty|no[\s_-]?data/.test(text)) return "empty_state";
  if (/loading|spinner|skeleton/.test(text)) return "loading_state";
  if (/mobile/.test(text)) return "mobile_test";
  if (/keyboard/.test(text)) return "keyboard";
  if (/zoom/.test(text)) return "zoom_test";
  if (/settings/.test(text)) return "settings";
  if (/output|analysis|recommendation|result/.test(text)) return "report";
  return text.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "other";
}

type CaptureOptions = {
  label?: string;
  screenType?: string;
  allowWeakEvidence?: boolean;
};

type GuidedStepResult = {
  stepName: string;
  actionType: string;
  success: boolean;
  reason?: string;
  currentUrl?: string;
  targetText?: string;
  targetSelector?: string;
  thenClickText?: string;
  targetFound?: boolean;
  clicked?: boolean;
  contentChanged?: boolean;
  screenshotCaptured?: boolean;
  visibleTextSample?: string;
  screenshotAccepted?: boolean;
};

export abstract class BaseExplorer {
  protected warnings: string[] = [];
  protected pages: EvidencePage[] = [];
  protected screenshots: EvidenceScreenshot[] = [];
  protected visitedFlows: string[] = [];
  protected visitedUrls = new Set<string>();
  protected auth: NonNullable<EvidenceBundle["auth"]>;
  protected debug: Record<string, unknown> = {};

  constructor(protected input: ExplorerInput) {
    this.auth = {
      required: Boolean(input.loginRequired),
      attempted: false,
      success: !input.loginRequired,
      message: "",
    };
  }

  async run(context: BrowserContext) {
    const page = await context.newPage();
    const startUrl = this.input.productUrl;
    try {
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settlePage(page);
      await this.capturePage(page, this.input.loginRequired ? "Login" : "Homepage");

      if (this.input.loginRequired) {
        await this.checkAuth(page);
      }

      if (this.auth.success) {
        const explorationDebug = await this.exploreProduct(page as Page);
        if (explorationDebug && typeof explorationDebug === "object") {
          this.debug = { ...this.debug, ...explorationDebug };
        }
      } else if (this.input.loginRequired) {
        await this.capturePage(page, "Login failure state");
      }
    } catch (error) {
      console.error("Exploration failed on start page:", error);
      this.warnings.push(`Exploration failed on start page: ${getErrorMessage(error)}`);
    } finally {
      await page.close().catch(() => {});
    }
  }

  protected abstract exploreProduct(page: Page): Promise<Record<string, unknown> | void>;

  protected async checkAuth(page: Page) {
    const missingCredentials = !safeText(this.input.loginEmail) || !safeText(this.input.loginPassword);
    if (this.input.loginRequired && missingCredentials) {
      this.auth = {
        required: true,
        attempted: false,
        success: false,
        message: "Login required but credentials are missing.",
      };
      this.warnings.push(this.auth.message || "Login required but credentials are missing.");
      return;
    }

    const result = await attemptLogin(page, this.input);
    this.auth = {
      required: true,
      attempted: result.attempted,
      success: result.success,
      message: result.warning || "",
    };
    if (result.warning) this.warnings.push(result.warning);
    // Record structured auth debug info
    try {
      (this.debug as Record<string, unknown>)['auth'] = {
        attempted: Boolean(result.attempted),
        success: Boolean(result.success),
        detectionReason: result.detectionReason || "",
        message: result.warning || "",
      };
    } catch {}
  }

  protected async capturePage(page: Page, labelOrOptions?: string | CaptureOptions) {
    await captureCurrentPage(page, this.input, this.pages, this.screenshots, this.warnings, labelOrOptions);
    const current = this.pages[this.pages.length - 1];
    if (!current) return;
    const flowLabel = bestFlowLabelForPage(current, this.input.auditFlows);
    if (flowLabel && !this.visitedFlows.includes(flowLabel)) {
      this.visitedFlows.push(flowLabel);
    }
  }

  protected pageAlreadyVisited(url: string) {
    return this.visitedUrls.has(url.replace(/\/+$/, ""));
  }

  protected addVisitedUrl(url: string) {
    this.visitedUrls.add(url.replace(/\/+$/, ""));
  }

  getResult(): EvidenceBundle {
    return {
      pages: this.pages,
      screenshots: this.screenshots,
      screenshotDataUrl: this.screenshots[0]?.url || null,
      warnings: this.warnings,
      visitedFlows: [...this.visitedFlows],
      auth: this.auth,
      debug: this.debug,
    };
  }
}

export class SaaSExplorer extends BaseExplorer {
  protected async exploreProduct(page: Page) {
    await this.capturePage(page, "Home / dashboard");
    this.addVisitedUrl(page.url());

    if (!this.auth.success) return;

    const debug = await exploreAuthenticatedApp(page, this.input, this.pages, this.screenshots, this.warnings);
    this.pages.forEach((p) => {
      const flowLabel = bestFlowLabelForPage(p, this.input.auditFlows);
      if (flowLabel && !this.visitedFlows.includes(flowLabel)) {
        this.visitedFlows.push(flowLabel);
      }
    });

    return {
      ...(debug || {}),
      auth: this.auth,
    };
  }
}

export class WebsiteExplorer extends BaseExplorer {
  protected async exploreProduct(page: Page) {
    await this.capturePage(page, "Homepage");
    this.addVisitedUrl(page.url());

    const candidates = await collectNavigationCandidates(page, this.input.auditFlows);
    let visited = 0;
    for (const candidate of candidates) {
      if (visited >= 3) break;
      if (!candidate.href || this.pageAlreadyVisited(candidate.href)) continue;
      if (!/pricing|features|about|contact|demo|learn|product|services/i.test(candidate.text + " " + candidate.href)) continue;
      try {
        await page.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settlePage(page);
        await this.capturePage(page, candidate.text || candidate.href);
        this.addVisitedUrl(page.url());
        visited += 1;
      } catch (error) {
        console.error(`Website exploration failed for ${candidate.href}:`, error);
        this.warnings.push(`Website exploration failed for ${candidate.href}: ${getErrorMessage(error)}`);
      }
    }
  }
}

export class EcommerceExplorer extends BaseExplorer {
  protected async exploreProduct(page: Page) {
    await this.capturePage(page, "Homepage");
    this.addVisitedUrl(page.url());

    const sitemapCandidates = await collectNavigationCandidates(page, this.input.auditFlows);
    const listingLink = sitemapCandidates.find((item) => /shop|products|collections|category|browse/i.test(item.text + " " + item.href));
    if (listingLink?.href && !this.pageAlreadyVisited(listingLink.href)) {
      try {
        await page.goto(listingLink.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settlePage(page);
        await this.capturePage(page, "Category / listing");
        this.addVisitedUrl(page.url());
      } catch (error) {
        console.error("Ecommerce listing navigation failed:", error);
        this.warnings.push(`Ecommerce listing navigation failed: ${getErrorMessage(error)}`);
      }
    }

    const productLink = sitemapCandidates.find((item) => /product|item|collection|details|view/i.test(item.text + " " + item.href));
    if (productLink?.href && !this.pageAlreadyVisited(productLink.href)) {
      try {
        await page.goto(productLink.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settlePage(page);
        await this.capturePage(page, "Product detail");
        this.addVisitedUrl(page.url());
      } catch (error) {
        console.error("Ecommerce product page capture failed:", error);
        this.warnings.push(`Ecommerce product page capture failed: ${getErrorMessage(error)}`);
      }
    }

    const cartLink = sitemapCandidates.find((item) => /cart|basket|checkout|purchase/i.test(item.text + " " + item.href));
    if (cartLink?.href && !this.pageAlreadyVisited(cartLink.href)) {
      try {
        await page.goto(cartLink.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await settlePage(page);
        await this.capturePage(page, "Cart / checkout entry");
        this.addVisitedUrl(page.url());
      } catch (error) {
        console.error("Ecommerce cart/checkout navigation failed:", error);
        this.warnings.push(`Ecommerce cart/checkout navigation failed: ${getErrorMessage(error)}`);
      }
    }
  }
}

export function createExplorer(input: ExplorerInput): BaseExplorer {
  if (input.productType === "ecommerce") return new EcommerceExplorer(input);
  if (input.productType === "marketing_website") return new WebsiteExplorer(input);
  return new SaaSExplorer(input);
}

function isLikelyLoginScreen(page: EvidencePage) {
  const text = [
    page.label || "",
    page.title,
    ...page.h1,
    ...page.h2,
    ...(page.formLabels || []),
    ...(page.buttons || []),
    page.textSnippet,
  ]
    .join(" ")
    .toLowerCase();
  return /sign in|log in|login|password|username|otp|verification code|enter your email/.test(text);
}

function isLoadingOnlyScreen(page: EvidencePage) {
  const text = [page.title, ...page.h1, ...page.h2, page.textSnippet].join(" ").toLowerCase();
  const stripped = text.replace(/\s+/g, " ").trim();
  if (!stripped) return true;
  if (stripped.length < 40 && /loading|please wait|fetching|initializing|processing/.test(stripped)) {
    return true;
  }
  return false;
}

function isBrowserErrorScreen(page: EvidencePage) {
  const text = [page.title, ...page.h1, ...page.h2, page.textSnippet].join(" ").toLowerCase();
  return /404|not found|500|502|503|504|this page could not be found|site can.t be reached|server error/.test(
    text,
  );
}

function evidenceFlagsFromPage(page: EvidencePage) {
  const allText = [
    page.title,
    ...page.h1,
    ...page.h2,
    ...page.h3,
    ...(page.buttons || []),
    ...(page.formLabels || []),
    ...(page.tabs || []),
    ...(page.tableHeaders || []),
    page.textSnippet,
  ]
    .join(" ")
    .toLowerCase();
  return {
    hasSidebar: /sidebar|left nav|left navigation|master data|transactional data|menu/.test(allText),
    hasTopNav:
      page.topNavLinks.length >= 3 ||
      /top nav|header|division|context|selector|profile|settings/.test(allText),
    hasTable: (page.tableHeaders?.length ?? 0) > 0 || /\btable\b|\bgrid\b|\brows\b|\bcolumns\b/.test(allText),
    hasForm:
      (page.formLabels?.length ?? 0) > 1 ||
      (page.placeholders?.length ?? 0) > 0 ||
      /\bform\b|\binput\b|\bfield\b/.test(allText),
    hasCards: /\bdashboard\b|\bcard\b|\bwidget\b|\bsummary\b|\boverview\b/.test(allText),
    hasDropdownOpen:
      (page.tabs?.length ?? 0) > 0 ||
      /\bdropdown\b|\bselect\b|\boption\b|\bdivision\b|\bcontext\b/.test(allText),
    hasModal: /\bmodal\b|\bdialog\b|\bconfirm\b|\bpopup\b/.test(allText),
    hasMainContent: page.textSnippet.length > 140 || page.h1.length > 0 || page.h2.length > 0,
    hasErrorState:
      (page.alerts?.length ?? 0) > 0 || /error|invalid|warning|failed|issue/.test(allText),
    hasEmptyState:
      (page.emptyStateHints?.length ?? 0) > 0 || /empty|no data|nothing here/.test(allText),
  };
}

function validateCapturedEvidencePage(
  input: ExplorerInput,
  page: EvidencePage,
  previousPage?: EvidencePage,
  options?: CaptureOptions,
) {
  const flags = evidenceFlagsFromPage(page);
  const reasons: string[] = [];
  const normalizedUrl = page.url.replace(/\/+$/, "");
  const startUrl = input.productUrl.replace(/\/+$/, "");
  const isDuplicate =
    previousPage &&
    previousPage.url.replace(/\/+$/, "") === normalizedUrl &&
    previousPage.title === page.title &&
    previousPage.h1.join("|") === page.h1.join("|") &&
    previousPage.tableHeaders?.join("|") === page.tableHeaders?.join("|") &&
    previousPage.textSnippet.slice(0, 400) === page.textSnippet.slice(0, 400);

  if (isBrowserErrorScreen(page)) reasons.push("browser error page");
  if (isLoadingOnlyScreen(page)) reasons.push("loading-only screen");
  if (input.loginRequired && !options?.allowWeakEvidence && isLikelyLoginScreen(page)) {
    reasons.push("still on login page after login");
  }
  if (isDuplicate) reasons.push("duplicate of previous screenshot");

  const meaningfulSignals =
    Number(flags.hasTable) +
    Number(flags.hasForm) +
    Number(flags.hasCards) +
    Number(flags.hasDropdownOpen) +
    Number((page.tabs?.length ?? 0) > 0) +
    Number((page.topNavLinks?.length ?? 0) >= 3) +
    Number(page.textSnippet.length > 180) +
    Number(page.h1.length > 0 || page.h2.length > 0);

  const mainContentChanged =
    !previousPage ||
    previousPage.url.replace(/\/+$/, "") !== normalizedUrl ||
    previousPage.title !== page.title ||
    previousPage.h1.join("|") !== page.h1.join("|") ||
    previousPage.textSnippet.slice(0, 400) !== page.textSnippet.slice(0, 400) ||
    previousPage.tableHeaders?.join("|") !== page.tableHeaders?.join("|");

  const onlyNavExpansion =
    flags.hasSidebar &&
    !flags.hasTable &&
    !flags.hasForm &&
    !flags.hasCards &&
    !mainContentChanged &&
    normalizedUrl === startUrl;

  if (!options?.allowWeakEvidence && onlyNavExpansion) {
    reasons.push("sidebar expansion without main content change");
  }

  if (!options?.allowWeakEvidence && meaningfulSignals < 2) {
    reasons.push("no meaningful main content");
  }

  return {
    isValid: reasons.length === 0,
    reason: reasons.join("; "),
    flags,
  };
}

export function validateExplorationCoverage(
  input: ExplorerInput,
  evidence: EvidenceBundle,
): EvidenceCoverage {
  const missing: string[] = [];
  const required: string[] = [];
  const pageCount = evidence.pages.length;
  const hasHome = pageCount > 0;
  const hasCriticalFlowVideo = evidence.screenshots.some(
    (shot) => shot.source === "upload" && shot.screenType === "critical_flow_video",
  );
  const hasCriticalFlowTranscript = evidence.pages.some((page) =>
    /transcript|notes|critical flow|video evidence/i.test(
      [page.label || "", page.title, page.textSnippet].join(" "),
    ),
  );
  required.push("homepage");

  const hasNavigation = evidence.pages.some(
    (page) =>
      page.topNavLinks.length >= 3 ||
      (page.tabs?.length ?? 0) >= 2 ||
      /navigation|nav|menu|context|selector/i.test(
        [page.label || "", page.title, page.textSnippet].join(" "),
      ),
  ) || hasCriticalFlowVideo || hasCriticalFlowTranscript;
  const internalProductPages = evidence.pages.filter((page) => {
    const identityStrength =
      ((page.buttons?.length ?? 0) >= 2 ? 1 : 0) +
      ((page.formLabels?.length ?? 0) >= 2 ? 1 : 0) +
      ((page.tableHeaders?.length ?? 0) >= 1 ? 1 : 0) +
      ((page.tabs?.length ?? 0) >= 1 ? 1 : 0) +
      (/dashboard|scenario|planning|workspace|module|report|analysis|output|input|grid|table|context/i.test(
        [page.label || "", page.title, ...page.h1, ...page.h2, page.textSnippet].join(" "),
      )
        ? 1
        : 0);
    return (
      identityStrength >= 2 &&
      (page.url.replace(/\/+$/, "") !== input.productUrl.replace(/\/+$/, "") ||
        Boolean(page.label && !/login|homepage/i.test(page.label)))
    );
  }).length;
  const effectiveInternalProductPages =
    hasCriticalFlowVideo || hasCriticalFlowTranscript
      ? Math.max(internalProductPages, 3)
      : internalProductPages;

  const marketingPages = evidence.pages.filter((page) => {
    const text = [page.title, page.metaDescription || "", ...page.h1, ...page.h2, ...page.h3, page.textSnippet]
      .join(" ")
      .toLowerCase();
    return /pricing|features|about|contact|demo|subscribe|get started|trust|testimonial|case study/.test(text);
  }).length;

  if (!hasHome) {
    missing.push("Homepage could not be captured.");
  }

  if (input.productType === "saas") {
    if (!hasNavigation) missing.push("Navigation / context selectors were not captured.");
    if (effectiveInternalProductPages < 3) missing.push("At least 3 internal product screens were not captured.");
    required.push("nav/context", "internal screens");
  } else if (input.productType === "marketing_website") {
    if (marketingPages < 3) missing.push("At least 3 marketing pages (pricing, features, about, contact) were not captured.");
    required.push("marketing pages");
  } else if (input.productType === "ecommerce") {
    const hasListing = evidence.pages.some((page) => /category|collection|products|shop|browse/i.test(page.url) || /category|collection|products|shop|browse/i.test(page.title + " " + page.textSnippet));
    const hasPdp = evidence.pages.some((page) => /add to cart|buy now|price|product details/i.test(page.title + " " + page.textSnippet));
    const hasCart = evidence.pages.some((page) => /cart|checkout|basket|order summary/i.test(page.title + " " + page.textSnippet));
    if (!hasListing) missing.push("A listing/category page was not captured.");
    if (!hasPdp) missing.push("A product detail page was not captured.");
    if (!hasCart) missing.push("A cart or checkout entry page was not captured.");
    required.push("listing/page", "product page", "cart/checkout");
  }

  const authFailed =
    input.loginRequired && evidence.auth?.required && evidence.auth.attempted && !evidence.auth.success;
  const passed = missing.length === 0 && !authFailed;
  const hasForm = evidence.pages.some(
    (page) => (page.formLabels?.length ?? 0) > 1 || (page.placeholders?.length ?? 0) > 0,
  );
  const hasTable = evidence.pages.some((page) => (page.tableHeaders?.length ?? 0) > 0);
  const hasAuthenticatedScreen = input.loginRequired ? effectiveInternalProductPages > 0 : pageCount > 0;
  const hasMarketingDepth = hasHome && hasNavigation && marketingPages >= 3;
  const hasEcommerceDepth = evidence.pages.some((page) =>
    /category|collection|products|shop|browse/i.test(page.url) ||
    /category|collection|products|shop|browse/i.test(`${page.title} ${page.textSnippet}`),
  );
  const hasProductDetail = evidence.pages.some((page) =>
    /add to cart|buy now|price|product details/i.test(`${page.title} ${page.textSnippet}`),
  );
  const hasCartOrCheckout = evidence.pages.some((page) =>
    /cart|checkout|basket|order summary/i.test(`${page.title} ${page.textSnippet}`),
  );

  let status: EvidenceCoverage["status"];
  let summary: string;

  if (authFailed) {
    status = "failed_login";
    summary =
      evidence.auth?.message?.trim() ||
      "Login failed. Please verify the username, password, and account access before running the audit.";
  } else if (input.productType === "marketing_website") {
    status = hasMarketingDepth
      ? "full_coverage"
      : hasHome && hasNavigation && marketingPages >= 2
        ? "usable_coverage"
        : pageCount > 0
          ? "limited_coverage"
          : "insufficient_coverage";
    summary =
      status === "full_coverage"
        ? "Website coverage is strong enough for a full marketing website audit."
        : status === "usable_coverage"
          ? "Website coverage is usable but still incomplete. Some questions may remain unscored."
          : status === "limited_coverage"
            ? "Only limited public-site coverage was captured. This should produce a Limited Coverage Report."
            : `Exploration coverage missing: ${missing.join(" ")}`;
  } else if (input.productType === "ecommerce") {
    status =
      hasHome && hasNavigation && hasEcommerceDepth && hasProductDetail && hasCartOrCheckout
        ? "full_coverage"
        : hasHome && hasNavigation && (hasEcommerceDepth || hasProductDetail)
          ? "usable_coverage"
          : pageCount > 0
            ? "limited_coverage"
            : "insufficient_coverage";
    summary =
      status === "full_coverage"
        ? "E-commerce coverage is strong enough for a full storefront audit."
        : status === "usable_coverage"
          ? "E-commerce coverage is usable but still incomplete. Some questions may remain unscored."
          : status === "limited_coverage"
            ? "Only limited storefront coverage was captured. This should produce a Limited Coverage Report."
            : `Exploration coverage missing: ${missing.join(" ")}`;
  } else {
    status = hasNavigation && effectiveInternalProductPages >= 3 && (hasForm || hasTable)
      ? "full_coverage"
      : hasNavigation && effectiveInternalProductPages >= 2
        ? "usable_coverage"
        : hasAuthenticatedScreen
          ? "limited_coverage"
          : "insufficient_coverage";
    summary =
      status === "full_coverage"
        ? `Exploration coverage is strong enough for a full ${input.productType} audit.`
        : status === "usable_coverage"
          ? "Exploration coverage is usable but not complete. Some questions may be marked insufficient evidence."
          : status === "limited_coverage"
            ? "Only limited authenticated product coverage was captured. This should produce a Limited Coverage Report."
            : `Exploration coverage missing: ${missing.join(" ")}`;
  }

  return {
    passed,
    status,
    summary,
    missing,
    required,
    details: summary,
    evidenceSummary: {
      dashboardCaptured: hasHome,
      navigationCaptured: hasNavigation,
      internalScreensCaptured: internalProductPages,
      tableOrGridCaptured: hasTable,
      formCaptured: hasForm,
      dropdownOrContextCaptured: evidence.pages.some(
        (page) =>
          (page.tabs?.length ?? 0) > 0 ||
          /context|selector|division|dropdown|option/i.test(
            [page.label || "", page.title, page.textSnippet].join(" "),
          ),
      ),
      screenshotCount: evidence.screenshots.length,
      validPageCount: evidence.pages.length,
      coverageStatus: status,
    },
  };
}

const FLOW_KEYWORD_MAP: Array<{ match: RegExp; keywords: string[] }> = [
  { match: /login/i, keywords: ["login", "log in", "sign in", "authenticate"] },
  { match: /dashboard|home/i, keywords: ["dashboard", "home", "overview", "landing"] },
  {
    match: /left nav|top nav|context selectors|navigation/i,
    keywords: ["dashboard", "home", "overview", "context", "selector", "navigation", "menu"],
  },
  { match: /module entry/i, keywords: ["module", "service", "workspace", "entry"] },
  { match: /data grid|input editing/i, keywords: ["data", "grid", "table", "input", "edit"] },
  {
    match: /scenario|planning execution/i,
    keywords: ["scenario", "plan", "planning", "run", "execute", "simulation"],
  },
  {
    match: /outputs|analysis|recommendations/i,
    keywords: ["output", "analysis", "recommendation", "result", "report"],
  },
  { match: /export|submission/i, keywords: ["export", "submit", "download", "publish"] },
  { match: /error|empty|loading states/i, keywords: ["error", "empty", "loading", "status", "alert"] },
];

async function attemptLogin(page: Page, input: {
  productUrl: string;
  loginEmail?: string;
  loginPassword?: string;
}) {
  const email = safeText(input.loginEmail);
  const password = safeText(input.loginPassword);
  if (!email || !password) {
    return { attempted: false, success: false, warning: "" };
  }

  const warningPrefix = "Login automation:";

  try {
    const emailSelectors = [
      'input[type="email"]',
      'input[name*="email" i]',
      'input[id*="email" i]',
      'input[name*="user" i]',
      'input[id*="user" i]',
      'input[name*="login" i]',
      'input[id*="login" i]',
      'input[type="text"]',
    ];
    const passwordSelectors = [
      'input[type="password"]',
      'input[name*="password" i]',
      'input[id*="password" i]',
    ];
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
      'button:has-text("Submit")',
      '[role="button"]:has-text("Login")',
      '[role="button"]:has-text("Log in")',
      '[role="button"]:has-text("Sign in")',
    ];

    let emailSelector = "";
    for (const selector of emailSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        emailSelector = selector;
        break;
      }
    }

    let passwordSelector = "";
    for (const selector of passwordSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        passwordSelector = selector;
        break;
      }
    }

    if (!emailSelector || !passwordSelector) {
      return {
        attempted: true,
        success: false,
        warning: `${warningPrefix} could not find login fields on ${input.productUrl}`,
      };
    }

    await page.locator(emailSelector).first().fill(email);
    await page.locator(passwordSelector).first().fill(password);

    let submitted = false;
    for (const selector of submitSelectors) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        await Promise.allSettled([
          page.waitForLoadState("networkidle", { timeout: 15_000 }),
          locator.click(),
        ]);
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      await Promise.allSettled([
        page.waitForLoadState("networkidle", { timeout: 15_000 }),
        page.locator(passwordSelector).first().press("Enter"),
      ]);
    }

    await page.waitForTimeout(1500);

    const stillHasPasswordField = await page.locator(passwordSelectors.join(", ")).first().count();
    const currentUrl = page.url();
    const sameUrl = currentUrl.replace(/\/+$/, "") === input.productUrl.replace(/\/+$/, "");
    const authenticatedSignals = await page
      .evaluate(() => {
        const bodyText = (document.body?.textContent || "").toLowerCase();
        const navCount = document.querySelectorAll(
          "nav a, header a, [role='navigation'] a, [role='tab'], button, a[href]",
        ).length;
        const dataRegionCount = document.querySelectorAll(
          "table, [role='grid'], [role='tablist'], [role='main'], main, aside",
        ).length;
        const positiveKeywords = [
          "dashboard",
          "logout",
          "sign out",
          "scenario",
          "planning",
          "module",
          "workspace",
          "export",
        ];
        return {
          navCount,
          dataRegionCount,
          hasPositiveKeyword: positiveKeywords.some((keyword) => bodyText.includes(keyword)),
        };
      })
      .catch(() => ({
        navCount: 0,
        dataRegionCount: 0,
        hasPositiveKeyword: false,
      }));
    const success =
      !stillHasPasswordField ||
      !sameUrl ||
      authenticatedSignals.hasPositiveKeyword ||
      authenticatedSignals.navCount >= 6 ||
      authenticatedSignals.dataRegionCount >= 2;

    // Additional detection: look for logout/profile links, avatar, or tokens in storage/cookies
    const extraSignals = await page
      .evaluate(() => {
        const hasLogout = Boolean(Array.from(document.querySelectorAll("a,button,span")).some(el => /(logout|sign out|signout|log out)/i.test(el.textContent || "")));
        const hasProfile = Boolean(Array.from(document.querySelectorAll("[data-testid*='profile'],[data-testid*='avatar'],.avatar, .user-menu")).length);
        const cookieText = typeof document.cookie === 'string' ? document.cookie.toLowerCase() : '';
        const hasCookieToken = /session|token|jwt|auth|sid|sessionid/.test(cookieText);
        let hasLocal = false;
        try {
          hasLocal = Object.keys(localStorage || {}).some(k => /token|auth|session|access|id|jwt/i.test(k));
        } catch {
          hasLocal = false;
        }
        return { hasLogout, hasProfile, hasCookieToken, hasLocal };
      })
      .catch(() => ({ hasLogout: false, hasProfile: false, hasCookieToken: false, hasLocal: false }));

    let detectionReason = '';
    if (extraSignals.hasLogout) detectionReason = 'logout link detected';
    else if (extraSignals.hasProfile) detectionReason = 'profile/avatar detected';
    else if (extraSignals.hasLocal) detectionReason = 'localStorage auth key detected';
    else if (extraSignals.hasCookieToken) detectionReason = 'auth cookie detected';
    else if (authenticatedSignals.hasPositiveKeyword) detectionReason = 'positive page keywords detected';
    else if (authenticatedSignals.navCount >= 6) detectionReason = 'navigation link count high';
    else if (authenticatedSignals.dataRegionCount >= 2) detectionReason = 'data regions detected';

    const finalSuccess = success || !!detectionReason;

    return {
      attempted: true,
      success: finalSuccess,
      warning: finalSuccess ? '' : `${warningPrefix} submission completed but authenticated state could not be confirmed`,
      detectionReason: detectionReason || '',
    };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      warning: `${warningPrefix} failed with ${getErrorMessage(error)}`,
    };
  }
}

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(text: string, max = 1800) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function takeTagText(html: string, tag: string, max: number) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html)) && out.length < max) {
    const raw = m[1] || "";
    const t = stripTags(raw);
    if (t) out.push(t);
  }
  return out;
}

function takeMeta(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] ? String(m[1]).trim() : "";
}

function takeAnchors(html: string, max: number) {
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: Array<{ text: string; href: string }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html)) && links.length < max) {
    const href = (m[1] || "").trim();
    const text = stripTags(m[2] || "");
    if (!href || !text) continue;
    links.push({ text, href });
  }
  return links;
}

function takeButtonText(html: string, max: number) {
  const buttonMatches = takeTagText(html, "button", max);
  const inputRe =
    /<input[^>]+(?:type=["'](?:submit|button|reset)["'])[^>]+(?:value=["']([^"']+)["'])?[^>]*>/gi;
  const inputs: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = inputRe.exec(html)) && inputs.length < max) {
    const value = safeText(match[1] || "");
    if (value) inputs.push(value);
  }
  return uniq([...buttonMatches, ...inputs]).slice(0, max);
}

function takeAttributeValues(html: string, tag: string, attr: string, max: number) {
  const re = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["'][^>]*>`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(html)) && out.length < max) {
    const value = safeText(match[1] || "");
    if (value) out.push(value);
  }
  return uniq(out).slice(0, max);
}

function takeElementsByKeywords(html: string, tag: string, keywords: string[], max: number) {
  const values = takeTagText(html, tag, max * 3);
  return values
    .filter((value) => {
      const lower = value.toLowerCase();
      return keywords.some((keyword) => lower.includes(keyword));
    })
    .slice(0, max);
}

function keywordsForFlow(flow: string) {
  const trimmed = safeText(flow);
  for (const entry of FLOW_KEYWORD_MAP) {
    if (entry.match.test(trimmed)) return entry.keywords;
  }
  return trimmed
    .split(/[\/,+]/g)
    .flatMap((part) => part.split(/\s+/g))
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length >= 3);
}

async function settlePage(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(300);
}

async function extractPageEvidence(page: Page): Promise<EvidencePage> {
  const data = await page.evaluate(() => {
    const take = (sel: string, max: number) =>
      Array.from(document.querySelectorAll(sel))
        .map((n) => (n.textContent || "").trim())
        .filter(Boolean)
        .slice(0, max);
    const textList = (selectors: string, max: number) =>
      Array.from(document.querySelectorAll(selectors))
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean)
        .slice(0, max);
    const attrList = (selectors: string, attr: string, max: number) =>
      Array.from(document.querySelectorAll(selectors))
        .map((node) => node.getAttribute(attr) || "")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, max);

    const navLike = Array.from(
      document.querySelectorAll("nav a[href], header a[href], [role='navigation'] a[href]"),
    ) as HTMLAnchorElement[];
    const topNavLinks = navLike
      .slice(0, 24)
      .map((a) => ({
        text: (a.textContent || "").trim(),
        href: a.getAttribute("href") || "",
      }))
      .filter((x) => x.text && x.href)
      .slice(0, 12);

    const primaryCtas = Array.from(
      document.querySelectorAll("a[href], button, [role='button']"),
    )
      .map((node) => ({
        text: (node.textContent || "").trim(),
        href: node instanceof HTMLAnchorElement ? node.href : "",
      }))
      .filter((entry) => entry.text)
      .filter((entry) =>
        /contact|talk|book|get started|start|pricing|request|submit|export|run|plan/i.test(
          entry.text,
        ),
      )
      .slice(0, 8);

    const mainText =
      (document.querySelector("main")?.textContent || document.body?.textContent || "") + "";

    return {
      title: document.title || "",
      metaDescription:
        document.querySelector("meta[name='description']")?.getAttribute("content") || "",
      h1: take("h1", 6),
      h2: take("h2", 8),
      h3: take("h3", 8),
      topNavLinks,
      primaryCtas,
      buttons: textList("button, input[type='submit'], input[type='button']", 12),
      formLabels: [
        ...textList("label", 12),
        ...attrList("input, textarea, select", "aria-label", 8),
      ].slice(0, 12),
      placeholders: attrList("input[placeholder], textarea[placeholder]", "placeholder", 10),
      tabs: textList("[role='tab'], .tab, .tabs button, .tabs a", 10),
      alerts: textList("[role='alert'], .alert, .error, .warning, .success, .toast", 10),
      tableHeaders: textList("th, [role='columnheader']", 12),
      emptyStateHints: textList(".empty, .no-data, [data-empty-state], [data-testid*='empty']", 8),
      mainText,
    };
  });

  return {
    url: page.url(),
    title: safeText(data.title),
    metaDescription: safeText(data.metaDescription),
    h1: data.h1.map(safeText).filter(Boolean),
    h2: data.h2.map(safeText).filter(Boolean),
    h3: data.h3.map(safeText).filter(Boolean),
    topNavLinks: data.topNavLinks
      .map((l) => ({ text: safeText(l.text), href: safeText(l.href) }))
      .filter((l) => l.text && l.href),
    primaryCtas: data.primaryCtas
      .map((l) => ({ text: safeText(l.text), href: safeText(l.href) }))
      .filter((l) => l.text),
    buttons: (data.buttons || []).map(safeText).filter(Boolean),
    formLabels: (data.formLabels || []).map(safeText).filter(Boolean),
    placeholders: (data.placeholders || []).map(safeText).filter(Boolean),
    tabs: (data.tabs || []).map(safeText).filter(Boolean),
    alerts: (data.alerts || []).map(safeText).filter(Boolean),
    tableHeaders: (data.tableHeaders || []).map(safeText).filter(Boolean),
    emptyStateHints: (data.emptyStateHints || []).map(safeText).filter(Boolean),
    textSnippet: truncate(String(data.mainText || "")),
  };
}

function addEvidencePage(pages: EvidencePage[], entry: EvidencePage) {
  const duplicate = pages.some(
    (page) =>
      (page.url.replace(/\/+$/, "") === entry.url.replace(/\/+$/, "") &&
        (page.label || "") === (entry.label || "") &&
        page.h1.join("|") === entry.h1.join("|") &&
        (page.tabs || []).join("|") === (entry.tabs || []).join("|") &&
        (page.tableHeaders || []).join("|") === (entry.tableHeaders || []).join("|")) ||
      (page.title &&
        entry.title &&
        page.title === entry.title &&
        page.h1.join("|") === entry.h1.join("|") &&
        (page.tabs || []).join("|") === (entry.tabs || []).join("|") &&
        (page.tableHeaders || []).join("|") === (entry.tableHeaders || []).join("|")),
  );
  if (!duplicate) pages.push(entry);
}

async function captureScreenshotDataUrl(page: Page) {
  const buf = await page.screenshot({ fullPage: true });
  return `data:image/png;base64,${buf.toString("base64")}`;
}

async function captureCurrentPage(
  page: Page,
  input: ExplorerInput,
  pages: EvidencePage[],
  screenshots: EvidenceScreenshot[],
  warnings: string[],
  labelOrOptions?: string | CaptureOptions,
) {
  const options =
    typeof labelOrOptions === "string" ? { label: labelOrOptions } : labelOrOptions || {};
  try {
    await settlePage(page);
    const entry = await extractPageEvidence(page);
    entry.label = safeText(options.label) || entry.title || page.url();
    const previousPage = pages[pages.length - 1];
    const validation = validateCapturedEvidencePage(input, entry, previousPage, options);
    const image = await captureScreenshotDataUrl(page);
    screenshots.push({
      label: entry.label,
      url: image,
      source: "local_playwright",
      screenName: entry.label,
      screenType: safeText(options.screenType) || "screen",
      title: entry.title,
      heading: entry.h1[0] || entry.h2[0] || "",
      visibleTextSummary: entry.textSnippet,
      ...validation.flags,
      viewport: "1400x900",
      isValidAuditEvidence: validation.isValid,
      rejectedReason: validation.isValid ? "" : validation.reason,
    });
    if (validation.isValid) {
      addEvidencePage(pages, entry);
    } else {
      warnings.push(`Rejected screenshot ${entry.label}: ${validation.reason}`);
    }
  } catch (error) {
    warnings.push(`Failed to capture ${options.label || page.url()}: ${getErrorMessage(error)}`);
  }
}

async function clickCandidate(page: Page, keyword: string) {
  const lower = keyword.toLowerCase();
  const locators = [
    page.locator(`a:has-text("${keyword}")`).first(),
    page.locator(`button:has-text("${keyword}")`).first(),
    page.locator(`[role="button"]:has-text("${keyword}")`).first(),
    page.locator(`[role="tab"]:has-text("${keyword}")`).first(),
    page.locator(`text="${keyword}"`).first(),
  ];

  for (const locator of locators) {
    try {
      if ((await locator.count()) > 0) {
        const beforeUrl = page.url();
        await Promise.allSettled([
          page.waitForLoadState("networkidle", { timeout: 15_000 }),
          locator.click(),
        ]);
        await page.waitForTimeout(800);
        if (page.url() !== beforeUrl) return true;
        const hasStateChange = await page
          .locator(`text=/${lower}/i`)
          .count()
          .catch(() => 0);
        if (hasStateChange >= 0) return true;
      }
    } catch {}
  }

  return false;
}

async function readPageFingerprint(page: Page) {
  return page
    .evaluate(() => {
      const text = (document.querySelector("main")?.textContent || document.body?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);
      const title = (document.title || "").trim();
      const h1 = Array.from(document.querySelectorAll("h1"))
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 4)
        .join("|");
      const tabs = Array.from(
        document.querySelectorAll("[role='tab'], .tab, .tabs button, .tabs a"),
      )
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 10)
        .join("|");
      const headers = Array.from(document.querySelectorAll("th, [role='columnheader']"))
        .map((node) => (node.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 10)
        .join("|");
      return `${title}::${h1}::${tabs}::${headers}::${text}`;
    })
    .catch(() => page.url());
}

async function waitForMeaningfulScreenChange(
  page: Page,
  beforeUrl: string,
  beforeFingerprint: string,
) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    await settlePage(page);
    const currentUrl = page.url();
    const currentFingerprint = await readPageFingerprint(page);
    if (currentUrl !== beforeUrl) return true;
    if (currentFingerprint && currentFingerprint !== beforeFingerprint) return true;
  }
  return false;
}

async function tryExpandSelectors(page: Page) {
  const selectorTriggers = [
    "[aria-haspopup='listbox']",
    "[aria-haspopup='menu']",
    "[role='combobox']",
    "select",
    "button[aria-expanded='false']",
    "[data-testid*='select']",
    "[class*='select']",
    "[class*='dropdown']",
  ];

  for (const selector of selectorTriggers) {
    const locator = page.locator(selector).first();
    try {
      if ((await locator.count()) === 0) continue;
      await locator.click({ timeout: 2_000 }).catch(() => {});
      await page.waitForTimeout(300);
      const options = page.locator(
        "[role='option'], [role='menuitem'], option, li, .menu-item, .dropdown-item",
      );
      const count = await options.count().catch(() => 0);
      await page.keyboard.press("Escape").catch(() => {});
      if (count > 0) return true;
    } catch {}
  }

  return false;
}

async function navigateToFlow(page: Page, flow: string) {
  const keywords = keywordsForFlow(flow);
  for (const keyword of keywords) {
    const clicked = await clickCandidate(page, keyword);
    if (clicked) return true;
  }

  const href = await page.evaluate((needleList) => {
    const normalizedNeedles = needleList.map((value) => value.toLowerCase());
    const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
    const match = anchors.find((anchor) => {
      const text = (anchor.textContent || "").trim().toLowerCase();
      const hrefValue = (anchor.getAttribute("href") || "").toLowerCase();
      return normalizedNeedles.some((needle) => text.includes(needle) || hrefValue.includes(needle));
    });
    return match?.href || "";
  }, keywords);

  if (href) {
    await page.goto(href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return true;
  }

  return false;
}

function scoreFlowMatch(page: EvidencePage, flow: string) {
  const keywords = keywordsForFlow(flow);
  if (!keywords.length) return 0;
  const haystack = [
    page.label || "",
    page.title,
    page.metaDescription || "",
    ...page.h1,
    ...page.h2,
    ...page.h3,
    ...(page.buttons || []),
    ...(page.tabs || []),
    ...(page.tableHeaders || []),
    ...(page.formLabels || []),
    page.textSnippet,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword.toLowerCase())) score += 1;
  }
  return score;
}

function bestFlowLabelForPage(page: EvidencePage, flows: string[]) {
  let bestFlow = "";
  let bestScore = 0;
  for (const flow of flows) {
    const score = scoreFlowMatch(page, flow);
    if (score > bestScore) {
      bestScore = score;
      bestFlow = flow;
    }
  }
  return bestScore > 0 ? bestFlow : "";
}

async function collectNavigationCandidates(
  page: Page,
  flows: string[],
): Promise<NavigationCandidate[]> {
  const flowKeywords = uniq(
    flows
      .flatMap((flow) => keywordsForFlow(flow))
      .map((keyword) => keyword.toLowerCase()),
  );
  const origin = new URL(page.url()).origin;

  return page
    .evaluate(
      ({ flowKeywords, origin }) => {
        const toText = (node: Element | null) => (node?.textContent || "").trim();

        const anchors = Array.from(document.querySelectorAll("a[href]"))
          .map((node) => {
            const anchor = node as HTMLAnchorElement;
            return {
              type: "href",
              text: toText(anchor),
              href: anchor.href || "",
              selector: "",
            };
          })
          .filter((item) => item.text || item.href);

        const clickables = Array.from(
          document.querySelectorAll(
            [
              "button",
              "[role='button']",
              "[role='tab']",
              ".tab",
              ".menu-item",
              "aside a[href]",
              "aside button",
              "[role='navigation'] button",
              "[role='navigation'] a[href]",
              "[role='tablist'] [role='tab']",
              "[data-testid*='nav'] a[href]",
              "[data-testid*='nav'] button",
              "[class*='sidebar'] a[href]",
              "[class*='sidebar'] button",
              "[class*='menu'] a[href]",
              "[class*='menu'] button",
              "[class*='tabs'] button",
              "[class*='tabs'] a[href]",
              "main a[href]",
              "main button",
              "[role='main'] a[href]",
              "[role='main'] button",
              "[aria-haspopup='menu']",
              "[aria-haspopup='listbox']",
              "[role='combobox']",
            ].join(", "),
          ),
        )
          .map((node, index) => {
            const el = node as HTMLElement;
            const href = el instanceof HTMLAnchorElement ? el.href || "" : "";
            const role = el.getAttribute("role") || "";
            const testId = el.getAttribute("data-testid") || "";
            const className = typeof el.className === "string" ? el.className : "";
            const selector = el.id
              ? `#${CSS.escape(el.id)}`
              : testId
                ? `[data-testid="${CSS.escape(testId)}"]`
                : `${el.tagName.toLowerCase()}${className ? `.${className
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => CSS.escape(part))
                    .join(".")}` : ""}:nth-of-type(${index + 1})`;

            return {
              type:
                role === "tab"
                  ? "tab"
                  : href
                    ? "href"
                    : /listbox|menu|combobox/i.test(role + " " + className)
                      ? "menu"
                      : "click",
              text: toText(el),
              href,
              selector,
            };
          })
          .filter((item) => item.text);

        const combined = [...anchors, ...clickables]
          .map((item) => {
            const lower = `${item.text} ${item.href}`.toLowerCase();
            const sameOrigin = item.href ? item.href.startsWith(origin) : true;
            const flowScore = flowKeywords.reduce(
              (sum, keyword) => sum + (lower.includes(keyword) ? 1 : 0),
              0,
            );
            const structureScore =
              (/dashboard|home|overview|workspace|module|planning|scenario|report|analysis|output|input|table|grid|context|nav|menu|export|submit/i.test(
                item.text,
              )
                ? 2
                : 0) +
              (item.type === "tab" ? 2 : 0) +
              (item.type === "menu" ? 1 : 0) +
              (item.type === "href" && item.href ? 1 : 0);
            return { ...item, sameOrigin, score: flowScore + structureScore };
          })
          .filter((item) => item.sameOrigin)
          .filter((item) => item.text.length >= 2 || item.href)
          .sort(
            (left, right) =>
              (right.score || 0) - (left.score || 0) || left.text.length - right.text.length,
          )
          .slice(0, 60);

        return combined;
      },
      { flowKeywords, origin },
    )
    .catch(() => []);
}

async function visitCandidate(page: Page, candidate: NavigationCandidate) {
  const beforeUrl = page.url();
  const beforeFingerprint = await readPageFingerprint(page);

  if (candidate.type === "href" && candidate.href) {
    await page.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    return true;
  }

  if (candidate.selector) {
    try {
      const locator = page.locator(candidate.selector).first();
      if ((await locator.count()) > 0) {
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 4_000 }).catch(() => {});
        const changed = await waitForMeaningfulScreenChange(page, beforeUrl, beforeFingerprint);
        if (changed) return true;
      }
    } catch {}
  }

  if (candidate.text) {
    const clicked = await clickCandidate(page, candidate.text);
    if (!clicked) return false;
    return waitForMeaningfulScreenChange(page, beforeUrl, beforeFingerprint);
  }

  return false;
}

async function clickBestEffort(page: Page, targetText?: string, targetSelector?: string) {
  const selector = safeText(targetSelector);
  if (selector) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0) {
      await locator.scrollIntoViewIfNeeded().catch(() => {});
      await locator.click({ timeout: 5_000 }).catch(() => {});
      return true;
    }
  }

  const target = safeText(targetText);
  if (!target) return false;
  const locators = [
    page.locator(`text="${target}"`).first(),
    page.getByRole("button", { name: target, exact: false }).first(),
    page.getByRole("link", { name: target, exact: false }).first(),
    page.getByRole("tab", { name: target, exact: false }).first(),
    page.locator(`button:has-text("${target}")`).first(),
    page.locator(`a:has-text("${target}")`).first(),
    page.locator(`[role='menuitem']:has-text("${target}")`).first(),
    page.locator(`aside >> text="${target}"`).first(),
    page.locator(`nav >> text="${target}"`).first(),
  ];
  for (const locator of locators) {
    try {
      if ((await locator.count()) > 0) {
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 5_000 }).catch(() => {});
        return true;
      }
    } catch {}
  }
  return false;
}

async function waitForExpectedState(
  page: Page,
  step: NonNullable<ExplorerInput["guidedCaptureSteps"]>[number],
) {
  const expectedUrlContains = safeText(step.expectedUrlContains);
  const expectedText = safeText(step.expectedText);
  const expectedHeading = safeText(step.expectedHeading);

  if (expectedUrlContains) {
    await page.waitForURL(new RegExp(expectedUrlContains.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), {
      timeout: 10_000,
    }).catch(() => {});
  }
  if (expectedHeading) {
    await page
      .locator("h1, h2, [role='heading']")
      .filter({ hasText: expectedHeading })
      .first()
      .waitFor({ timeout: 8_000 })
      .catch(() => {});
  }
  if (expectedText) {
    await page.getByText(expectedText, { exact: false }).first().waitFor({ timeout: 8_000 }).catch(() => {});
  }
  await settlePage(page);
}

async function executeGuidedSteps(
  page: Page,
  input: ExplorerInput,
  pages: EvidencePage[],
  screenshots: EvidenceScreenshot[],
  warnings: string[],
) {
  const steps = Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps : [];
  const results: GuidedStepResult[] = [];

  for (const rawStep of steps) {
    const stepName = safeText(rawStep.stepName) || safeText(rawStep.targetText) || "Guided step";
    const actionType = safeText(rawStep.actionType).toLowerCase() || "click";
    try {
      if (actionType === "login" && input.loginRequired && !input.loginEmail) {
        results.push({ stepName, actionType, success: false, reason: "missing login credentials" });
        continue;
      }

      if (actionType === "goto") {
        const target = safeText(rawStep.targetSelector || rawStep.targetText || rawStep.expectedUrlContains);
        if (!target) {
          results.push({ stepName, actionType, success: false, reason: "target route missing" });
          continue;
        }
        const url = target.startsWith("http")
          ? target
          : new URL(target.startsWith("/") ? target : `/${target}`, page.url()).toString();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      } else if (actionType === "click" || actionType === "select") {
        const clicked = await clickBestEffort(page, rawStep.targetText, rawStep.targetSelector);
        if (!clicked) {
          results.push({
            stepName,
            actionType,
            success: false,
            reason: "target not found",
            currentUrl: page.url(),
          });
          continue;
        }
        if (safeText(rawStep.thenClickText)) {
          await page.waitForTimeout(250);
          const secondClick = await clickBestEffort(page, rawStep.thenClickText, "");
          if (!secondClick) {
            results.push({
              stepName,
              actionType,
              success: false,
              reason: "secondary target not found",
              currentUrl: page.url(),
            });
            continue;
          }
        }
      } else if (actionType === "fill") {
        const selector = safeText(rawStep.targetSelector);
        const value = safeText(rawStep.targetText);
        if (!selector || !value) {
          results.push({ stepName, actionType, success: false, reason: "selector or value missing" });
          continue;
        }
        await page.locator(selector).first().fill(value, { timeout: 5_000 });
      } else if (actionType === "wait") {
        await page.waitForTimeout(1200);
      } else if (actionType === "keyboard") {
        await page.keyboard.press(safeText(rawStep.targetText) || "Tab");
      } else if (actionType === "mobile_test") {
        await page.setViewportSize({ width: 375, height: 812 });
      } else if (actionType === "zoom_test") {
        await page.evaluate(() => {
          document.documentElement.style.zoom = "2";
        });
      } else if (actionType === "error_test") {
        await page.keyboard.press("Tab").catch(() => {});
      }

      await waitForExpectedState(page, rawStep);
      const beforeCount = pages.length;
      await captureCurrentPage(page, input, pages, screenshots, warnings, {
        label: stepName,
        screenType: safeText(rawStep.screenshotType) || actionType,
        allowWeakEvidence: actionType === "select" || actionType === "mobile_test" || actionType === "zoom_test",
      });
      const screenshotAccepted = pages.length > beforeCount;
      results.push({
        stepName,
        actionType,
        success: !rawStep.required || screenshotAccepted,
        reason: screenshotAccepted ? "" : "content did not change or screenshot rejected",
        currentUrl: page.url(),
        visibleTextSample: pages[pages.length - 1]?.textSnippet?.slice(0, 160) || "",
        screenshotAccepted,
      });
    } catch (error) {
      const reason = getErrorMessage(error);
      warnings.push(`Guided step failed (${stepName}): ${reason}`);
      results.push({
        stepName,
        actionType,
        success: false,
        reason,
        currentUrl: page.url(),
      });
    }
  }

  return results;
}

async function captureInternalRoutes(
  page: Page,
  input: ExplorerInput,
  pages: EvidencePage[],
  screenshots: EvidenceScreenshot[],
  warnings: string[],
) {
  const routes = Array.isArray(input.internalRoutes) ? input.internalRoutes.filter(Boolean) : [];
  const results: GuidedStepResult[] = [];
  for (const route of routes) {
    try {
      const url = route.startsWith("http")
        ? route
        : new URL(route.startsWith("/") ? route : `/${route}`, page.url()).toString();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await settlePage(page);
      const beforeCount = pages.length;
      await captureCurrentPage(page, input, pages, screenshots, warnings, {
        label: route,
        screenType: "internal_route",
      });
      results.push({
        stepName: route,
        actionType: "goto",
        success: pages.length > beforeCount,
        reason: pages.length > beforeCount ? "" : "screenshot rejected",
        currentUrl: page.url(),
        screenshotAccepted: pages.length > beforeCount,
      });
    } catch (error) {
      results.push({
        stepName: route,
        actionType: "goto",
        success: false,
        reason: getErrorMessage(error),
        currentUrl: page.url(),
      });
    }
  }
  return results;
}

async function exploreAuthenticatedApp(
  page: Page,
  input: ExplorerInput,
  pages: EvidencePage[],
  screenshots: EvidenceScreenshot[],
  warnings: string[],
) {
  const flows = input.auditFlows.map(safeText).filter(Boolean);
  const maxCapturedPagesRaw = Number(process.env.EVIDENCE_MAX_AUTH_PAGES || 12);
  const maxCapturedPages = Number.isFinite(maxCapturedPagesRaw)
    ? Math.max(4, Math.min(20, maxCapturedPagesRaw))
    : 12;
  const guidedStepResults = await executeGuidedSteps(page, input, pages, screenshots, warnings);
  const internalRouteResults = await captureInternalRoutes(page, input, pages, screenshots, warnings);

  await captureCurrentPage(page, input, pages, screenshots, warnings, {
    label: "Post-login landing",
    screenType: "dashboard",
  });
  await tryExpandSelectors(page).catch(() => {});
  await captureCurrentPage(page, input, pages, screenshots, warnings, {
    label: "Navigation / context selectors",
    screenType: "context_selector",
    allowWeakEvidence: true,
  });

  if (input.accessMode === "internal_routes_only") {
    return {
      guidedStepsFound: Array.isArray(input.guidedCaptureSteps) && input.guidedCaptureSteps.length > 0,
      guidedStepsCount: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
      guidedStepResults,
      internalRoutesCount: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
      internalRouteResults,
      attemptedCandidates: [],
      successfulCandidates: [],
      visitedUrls: pages.map((entry) => entry.url.replace(/\/+$/, "")),
      visitedFingerprints: [],
      capturedLabels: pages.map((p) => p.label || p.title || p.url),
      screenshotCount: screenshots.length,
      capturedPageCount: pages.length,
      duplicateScreenshotsRejected: screenshots.filter((shot) => shot.isValidAuditEvidence === false).length,
      explorationMode: "internal_routes_only",
    };
  }

  const visitedUrls = new Set(pages.map((entry) => entry.url.replace(/\/+$/, "")));
  const visitedFingerprints = new Set<string>();
  for (const entry of pages) {
    const identity = [
      entry.title,
      entry.h1.join("|"),
      entry.h2.join("|"),
      (entry.tableHeaders || []).join("|"),
      (entry.tabs || []).join("|"),
      entry.textSnippet.slice(0, 500),
    ].join("::");
    if (identity.replace(/:+/g, "").trim()) visitedFingerprints.add(identity);
  }
  const attemptedCandidates: string[] = [];
  const successfulCandidates: string[] = [];
  const attemptedKeys = new Set<string>();

  const crawlQueue = await collectNavigationCandidates(page, flows);
  for (const flow of flows) {
    crawlQueue.unshift({
      type: "flow",
      text: flow,
      href: "",
    });
  }

  while (crawlQueue.length && pages.length < maxCapturedPages) {
    const candidate = crawlQueue.shift();
    if (!candidate) break;

    const candidateKey = `${candidate.type}:${candidate.href || candidate.text}`.toLowerCase();
    if (!candidateKey || attemptedKeys.has(candidateKey)) continue;
    attemptedKeys.add(candidateKey);
    attemptedCandidates.push(candidateKey);

    try {
      let navigated = false;

      if (candidate.type === "flow") {
        navigated = await navigateToFlow(page, candidate.text);
      } else {
        navigated = await visitCandidate(page, candidate);
      }

      if (!navigated) continue;

      await settlePage(page);
      const currentUrl = page.url().replace(/\/+$/, "");
      const evidence = await extractPageEvidence(page);
      const identity = [
        evidence.title,
        evidence.h1.join("|"),
        evidence.h2.join("|"),
        (evidence.tableHeaders || []).join("|"),
        (evidence.tabs || []).join("|"),
        evidence.textSnippet.slice(0, 500),
      ].join("::");
      const sameUrl = visitedUrls.has(currentUrl);
      const sameFingerprint = visitedFingerprints.has(identity);
      if (sameUrl && sameFingerprint) continue;

      const matchedFlow = bestFlowLabelForPage(evidence, flows);
      const label = matchedFlow || candidate.text || evidence.title || page.url();
      evidence.label = label;
      addEvidencePage(pages, evidence);
      const image = await captureScreenshotDataUrl(page);
      screenshots.push({ label, url: image });
      visitedUrls.add(currentUrl);
      if (identity.replace(/:+/g, "").trim()) visitedFingerprints.add(identity);
      successfulCandidates.push(candidateKey);

      const moreCandidates = await collectNavigationCandidates(page, flows);
      for (const nextCandidate of moreCandidates) {
        const nextKey = `${nextCandidate.type}:${nextCandidate.href || nextCandidate.text}`.toLowerCase();
        if (!attemptedKeys.has(nextKey)) crawlQueue.push(nextCandidate);
      }
    } catch (error) {
      warnings.push(
        `Authenticated crawl step failed for ${candidate.text || candidate.href}: ${getErrorMessage(error)}`,
      );
    }
  }

  for (const flow of flows) {
    const matched = pages.some((entry) => scoreFlowMatch(entry, flow) > 0);
    if (!matched) {
      warnings.push(`No captured page strongly matched audit flow: ${flow}`);
    }
  }
  const debug = {
    guidedStepsFound: Array.isArray(input.guidedCaptureSteps) && input.guidedCaptureSteps.length > 0,
    guidedStepsCount: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
    guidedStepResults,
    internalRoutesCount: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
    internalRouteResults,
    attemptedCandidates,
    successfulCandidates,
    visitedUrls: Array.from(visitedUrls),
    visitedFingerprints: Array.from(visitedFingerprints).slice(0, 50),
    capturedLabels: pages.map((p) => p.label || p.title || p.url),
    screenshotCount: screenshots.length,
    capturedPageCount: pages.length,
    duplicateScreenshotsRejected: screenshots.filter((shot) => shot.isValidAuditEvidence === false).length,
  };

  return debug;
}

function commonPublicTargets(productUrl: string, productType?: "saas" | "ecommerce" | "marketing_website") {
  const seeds =
    productType === "marketing_website"
      ? ["/pricing", "/features", "/about", "/contact", "/demo", "/customers"]
      : productType === "ecommerce"
        ? ["/shop", "/products", "/collections", "/category", "/cart", "/checkout"]
        : [];
  return seeds
    .map((path) => {
      try {
        return new URL(path, productUrl).toString();
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

async function discoverPublicTargets(
  startUrl: string,
  productType?: "saas" | "ecommerce" | "marketing_website",
) {
  try {
    const res = await fetch(startUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    const sameOriginLinks = takeAnchors(html, 120)
      .map((link) => safeText(link.href))
      .filter(Boolean)
      .map((href) => {
        try {
          return new URL(href, startUrl).toString();
        } catch {
          return "";
        }
      })
      .filter(Boolean)
      .filter((href) => {
        try {
          return new URL(href).origin === new URL(startUrl).origin;
        } catch {
          return false;
        }
      });
    const marketingPatterns = /pricing|features|about|contact|demo|customer|case-study|testimonial|solutions/i;
    const ecommercePatterns = /shop|products|product|collections|category|cart|checkout|basket/i;
    const preferred =
      productType === "marketing_website"
        ? sameOriginLinks.filter((href) => marketingPatterns.test(href))
        : productType === "ecommerce"
          ? sameOriginLinks.filter((href) => ecommercePatterns.test(href))
          : sameOriginLinks;
    return uniq([...preferred, ...commonPublicTargets(startUrl, productType)]);
  } catch {
    return commonPublicTargets(startUrl, productType);
  }
}

async function collectEvidenceViaFetch(input: {
  productUrl: string;
  auditFlows: string[];
  productType?: "saas" | "ecommerce" | "marketing_website";
}) {
  const warnings: string[] = [];
  const startUrl = input.productUrl;

  const extraTargets: string[] = [];
  for (const f of input.auditFlows) {
    const m = String(f).match(/https?:\/\/[^\s)]+/g);
    if (m?.length) extraTargets.push(...m);
  }
  const discoveredTargets = await discoverPublicTargets(startUrl, input.productType);
  const maxPages = Number(process.env.EVIDENCE_MAX_PAGES || 5);
  const targets = uniq([startUrl, ...extraTargets, ...discoveredTargets]).slice(
    0,
    Number.isFinite(maxPages) ? Math.max(1, Math.min(8, maxPages)) : 5,
  );

  const pages: EvidencePage[] = [];
  const screenshotDataUrl: string | null = null;
  const screenshots: EvidenceScreenshot[] = [];

  for (const url of targets) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch?.[1] ? stripTags(titleMatch[1]) : "";
      const metaDescription = takeMeta(html, "description");
      const h1 = takeTagText(html, "h1", 6);
      const h2 = takeTagText(html, "h2", 8);
      const h3 = takeTagText(html, "h3", 8);
      const allLinks = takeAnchors(html, 80);

      const topNavLinks = allLinks
        .filter((l) => l.text.length <= 28)
        .slice(0, 12);

      // Heuristic: treat prominent CTA-like link texts as primary CTAs.
      const primaryCtas = allLinks
        .filter((l) => {
          const t = l.text.toLowerCase();
          return (
            t.includes("contact") ||
            t.includes("let") ||
            t.includes("talk") ||
            t.includes("book") ||
            t.includes("get started") ||
            t.includes("start") ||
            t.includes("pricing") ||
            t.includes("request")
          );
        })
        .slice(0, 8);

      const buttons = takeButtonText(html, 12);
      const formLabels = uniq([
        ...takeTagText(html, "label", 12),
        ...takeAttributeValues(html, "input", "aria-label", 8),
        ...takeAttributeValues(html, "textarea", "aria-label", 6),
        ...takeAttributeValues(html, "select", "aria-label", 6),
      ]).slice(0, 12);
      const placeholders = uniq([
        ...takeAttributeValues(html, "input", "placeholder", 10),
        ...takeAttributeValues(html, "textarea", "placeholder", 6),
      ]).slice(0, 10);
      const tabs = allLinks
        .filter((l) => /tab|overview|details|settings|dashboard|report|scenario/i.test(l.text))
        .slice(0, 10)
        .map((l) => safeText(l.text));
      const alerts = uniq([
        ...takeElementsByKeywords(html, "div", ["error", "warning", "success", "failed", "saved"], 10),
        ...takeElementsByKeywords(html, "p", ["error", "warning", "success", "failed", "saved"], 10),
        ...takeElementsByKeywords(html, "span", ["error", "warning", "success", "failed", "saved"], 10),
      ]).slice(0, 10);
      const tableHeaders = uniq([
        ...takeTagText(html, "th", 12),
        ...takeElementsByKeywords(html, "div", ["total", "status", "date", "name", "id"], 12),
      ]).slice(0, 12);
      const emptyStateHints = uniq([
        ...takeElementsByKeywords(html, "p", ["no data", "empty", "nothing", "not found"], 8),
        ...takeElementsByKeywords(html, "div", ["no data", "empty", "nothing", "not found"], 8),
      ]).slice(0, 8);

      const mainText = stripTags(html);
      const entry: EvidencePage = {
        url,
        title: safeText(title),
        metaDescription: safeText(metaDescription),
        h1,
        h2,
        h3,
        topNavLinks: topNavLinks.map((l) => ({
          text: safeText(l.text),
          href: safeText(l.href),
        })),
        primaryCtas: primaryCtas.map((l) => ({
          text: safeText(l.text),
          href: safeText(l.href),
        })),
        buttons,
        formLabels,
        placeholders,
        tabs,
        alerts,
        tableHeaders,
        emptyStateHints,
        textSnippet: truncate(mainText),
      };
      pages.push(entry);
    } catch (e) {
      warnings.push(
        `Failed to capture ${url}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  if (!pages.length && input.productType === "marketing_website") {
    const fallbackTitle = (() => {
      try {
        return new URL(startUrl).hostname.replace(/^www\./i, "") || "Marketing website";
      } catch {
        return "Marketing website";
      }
    })();
    pages.push({
      url: startUrl,
      title: fallbackTitle,
      metaDescription: "",
      h1: [fallbackTitle],
      h2: [],
      h3: [],
      topNavLinks: [],
      primaryCtas: [],
      buttons: [],
      formLabels: [],
      placeholders: [],
      tabs: [],
      alerts: [],
      tableHeaders: [],
      emptyStateHints: [],
      textSnippet: `Public fetch could not read ${startUrl}; using the submitted URL as fallback evidence.`,
    });
    warnings.push(
      `Public fetch could not read ${startUrl}; using a fallback evidence page so the audit can continue.`,
    );
  }

  return {
    pages,
    screenshotDataUrl,
    screenshots,
    warnings,
    visitedFlows: [],
    auth: {
      required: false,
      attempted: false,
      success: true,
      message: "",
    },
  } satisfies EvidenceBundle;
}

function uploadedScreenshotsToEvidence(
  input: Pick<ExplorerInput, "uploadedScreenshots">,
): Pick<EvidenceBundle, "pages" | "screenshots" | "warnings" | "visitedFlows" | "auth" | "debug" | "screenshotDataUrl"> {
  const uploads = Array.isArray(input.uploadedScreenshots) ? input.uploadedScreenshots : [];
  const pages: EvidencePage[] = uploads.map((shot, index) => {
    const label = safeText(shot.label) || safeText(shot.name) || `Uploaded screenshot ${index + 1}`;
    const title = safeText(shot.name) || label;
    const normalizedType = normalizeScreenType(shot.label || shot.name || "");
    const normalized = `${label} ${title}`.toLowerCase();
    return {
      label,
      url: `upload://screenshot-${index + 1}`,
      title,
      metaDescription: "",
      h1: [title],
      h2: [],
      h3: [],
      topNavLinks: /nav|menu|context|selector|division|dashboard/.test(normalized) || normalizedType === "navigation"
        ? [{ text: title, href: "" }]
        : [],
      primaryCtas: [],
      buttons: /button|save|submit|run|create|export/.test(normalized) ? [title] : [],
      formLabels: /form|input|edit|field|validation/.test(normalized) || normalizedType === "form" ? [title] : [],
      placeholders: [],
      tabs: /tab|module|dashboard|navigation/.test(normalized) || ["dashboard", "navigation", "context_selector"].includes(normalizedType) ? [title] : [],
      alerts: /error|empty|loading|warning|alert/.test(normalized) || ["error_state", "empty_state", "loading_state"].includes(normalizedType) ? [title] : [],
      tableHeaders: /grid|table|items|capacity|report|resource/.test(normalized) || ["data_grid", "report"].includes(normalizedType) ? [title] : [],
      emptyStateHints: /empty|no data|loading/.test(normalized) || ["empty_state", "loading_state"].includes(normalizedType) ? [title] : [],
      textSnippet: label,
    };
  });
  const screenshots: EvidenceScreenshot[] = uploads.map((shot, index) => ({
    label: safeText(shot.name) || `Uploaded screenshot ${index + 1}`,
    url: shot.url,
    source: "upload",
    screenName: safeText(shot.name) || `Uploaded screenshot ${index + 1}`,
    screenType: normalizeScreenType(shot.label || shot.name || ""),
    isValidAuditEvidence: true,
    rejectedReason: "",
  }));

  return {
    pages,
    screenshotDataUrl: screenshots[0]?.url || null,
    screenshots,
    warnings: [],
    visitedFlows: [],
    auth: {
      required: false,
      attempted: false,
      success: true,
      message: "",
    },
    debug: {
      evidenceSource: "uploaded_screenshots",
      uploadedScreenshotsReceived: uploads.length,
      uploadedScreenshotsStored: screenshots.length,
      uploadedScreenshotsConvertedToEvidence: pages.length,
      uploadedScreenshotsUsedForQuestions: pages.length,
      uploadedScreenshotErrors: [],
      uploadedScreenshotCount: screenshots.length,
    },
  };
}

function uploadedVideoToEvidence(
  input: Pick<ExplorerInput, "uploadedVideo" | "criticalFlowNotes">,
): Pick<EvidenceBundle, "pages" | "screenshots" | "warnings" | "visitedFlows" | "auth" | "debug" | "screenshotDataUrl"> {
  const video = input.uploadedVideo;
  if (!video?.url) {
    return {
      pages: [],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: [],
      visitedFlows: [],
      auth: {
        required: false,
        attempted: false,
        success: true,
        message: "",
      },
      debug: {
        evidenceSource: "uploaded_video",
        uploadedVideoReceived: 0,
        uploadedVideoStored: 0,
        uploadedVideoConvertedToEvidence: 0,
        uploadedVideoUsedForQuestions: 0,
      },
    };
  }

  const title = safeText(video.name) || "Critical flow video";
  const transcript = safeText(input.criticalFlowNotes || video.transcript || "");
  const summaryText = [
    transcript ? `Transcript / notes: ${transcript}` : "",
    video.type ? `Media type: ${video.type}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const page: EvidencePage = {
    label: "Critical flow video",
    url: video.url,
    title,
    metaDescription: "User-uploaded critical flow video evidence",
    h1: [title],
    h2: [],
    h3: [],
    topNavLinks: [],
    primaryCtas: [],
    buttons: [],
    formLabels: [],
    placeholders: [],
    tabs: [],
    alerts: transcript ? ["Transcript available"] : [],
    tableHeaders: [],
    emptyStateHints: [],
    textSnippet: summaryText || `Critical flow video evidence: ${title}`,
  };

  const screenshot: EvidenceScreenshot = {
    label: title,
    url: video.url,
    source: "upload",
    screenName: title,
    screenType: "critical_flow_video",
    title,
    visibleTextSummary: transcript || "Video evidence uploaded by the user",
    isValidAuditEvidence: true,
    rejectedReason: "",
  };

  return {
    pages: [page],
    screenshotDataUrl: video.url,
    screenshots: [screenshot],
    warnings: [],
    visitedFlows: [],
    auth: {
      required: false,
      attempted: false,
      success: true,
      message: "",
    },
    debug: {
      evidenceSource: "uploaded_video",
      uploadedVideoReceived: 1,
      uploadedVideoStored: 1,
      uploadedVideoConvertedToEvidence: 1,
      uploadedVideoUsedForQuestions: 1,
      uploadedVideoTranscriptLength: transcript.length,
    },
  };
}

function parseExtensionCaptureJson(value: string) {
  if (!value || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(Boolean) as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object") return [parsed as Record<string, unknown>];
  } catch {
    return [];
  }
  return [];
}

function extensionCapturesToEvidence(input: {
  extensionCaptureJson?: string;
  productUrl: string;
  auditFlows: string[];
}) {
  const captures = parseExtensionCaptureJson(input.extensionCaptureJson || "");
  if (!captures.length) return null;

  const pages: EvidencePage[] = [];
  const screenshots: EvidenceScreenshot[] = [];
  const warnings: string[] = [];

  captures.forEach((capture, index) => {
    const url = safeText(capture.url || input.productUrl);
    const title = safeText(capture.title || `Captured screen ${index + 1}`);
    const headings = Array.isArray(capture.headings)
      ? capture.headings.map((heading) => safeText(heading)).filter(Boolean)
      : [];
    const visibleText = safeText(capture.visibleText || capture.domSummary || capture.screenTypeLabel);
    const buttons = Array.isArray(capture.buttons)
      ? capture.buttons.map((button) => safeText(button)).filter(Boolean)
      : [];
    const links = Array.isArray(capture.links)
      ? capture.links.map((link) => safeText(link)).filter(Boolean)
      : [];
    const forms = Array.isArray(capture.forms)
      ? capture.forms.map((form) => safeText(form)).filter(Boolean)
      : [];
    const tables = Array.isArray(capture.tables)
      ? capture.tables.map((table) => safeText(table)).filter(Boolean)
      : [];
    const navigationLabels = Array.isArray(capture.navigationLabels)
      ? capture.navigationLabels.map((label) => safeText(label)).filter(Boolean)
      : [];
    const screenTypeLabel = normalizeScreenType(
      safeText(capture.screenTypeLabel) || safeText(capture.title) || safeText(capture.url),
    );
    const topNavLinks = [
      ...navigationLabels.map((label) => ({ text: label, href: url })),
      ...links.map((link) => ({ text: link, href: url })),
    ];
    const screenshotUrl = safeText(capture.screenshotUrl);
    const domSummary = safeText(capture.domSummary);
    const pageLabel = screenTypeLabel || title || `Captured screen ${index + 1}`;

    pages.push({
      label: pageLabel,
      url,
      title,
      h1: headings.slice(0, 3),
      h2: [],
      h3: [],
      topNavLinks,
      buttons,
      formLabels: forms,
      placeholders: [],
      tabs:
        navigationLabels.length > 0
          ? navigationLabels
          : ["dashboard", "navigation", "context_selector"].includes(screenTypeLabel)
            ? [title]
            : [],
      alerts: [],
      tableHeaders:
        tables.length > 0
          ? tables
          : ["data_grid", "report"].includes(screenTypeLabel)
            ? [title]
            : [],
      emptyStateHints: [],
      textSnippet: [visibleText, domSummary].filter(Boolean).join(" \n "),
    });

    if (screenshotUrl) {
      screenshots.push({
        label: pageLabel,
        url: screenshotUrl,
        source: "upload",
        screenName: pageLabel,
        screenType: screenTypeLabel,
        title,
        heading: headings[0] || "",
        visibleTextSummary: visibleText,
        isValidAuditEvidence: true,
      });
    }
  });

  return {
    pages,
    screenshotDataUrl: screenshots[0]?.url || null,
    screenshots,
    warnings,
    visitedFlows: [],
    auth: {
      required: false,
      attempted: false,
      success: true,
      message: "",
    },
    debug: {
      extensionCapturesReceived: captures.length,
      extensionCaptureEvidencePages: pages.length,
      extensionCaptureEvidenceScreenshots: screenshots.length,
      evidenceSource: "extension_capture",
    },
  } satisfies EvidenceBundle;
}

function mergeEvidenceBundles(
  primary: EvidenceBundle,
  secondary: Pick<
    EvidenceBundle,
    "pages" | "screenshots" | "warnings" | "visitedFlows" | "auth" | "debug" | "screenshotDataUrl"
  > | null,
): EvidenceBundle {
  if (!secondary) return primary;
  return {
    ...primary,
    pages: [...(primary.pages || []), ...(secondary.pages || [])],
    screenshots: [...(primary.screenshots || []), ...(secondary.screenshots || [])],
    warnings: [...(primary.warnings || []), ...(secondary.warnings || [])],
    visitedFlows: Array.from(
      new Set([...(primary.visitedFlows || []), ...(secondary.visitedFlows || [])]),
    ),
    screenshotDataUrl: primary.screenshotDataUrl || secondary.screenshotDataUrl || null,
    auth: primary.auth || secondary.auth,
    debug: {
      ...(secondary.debug || {}),
      ...(primary.debug || {}),
    },
  };
}

export async function collectEvidence(input: {
  productUrl: string;
  auditFlows: string[];
  productType: "saas" | "ecommerce" | "marketing_website";
  accessMode?: AuditAccessMode;
  loginRequired?: boolean;
  loginEmail?: string;
  loginPassword?: string;
  uploadedScreenshots?: ExplorerInput["uploadedScreenshots"];
  uploadedVideo?: ExplorerInput["uploadedVideo"];
  criticalFlowNotes?: string;
  extensionCaptureJson?: string;
  guidedCaptureSteps?: ExplorerInput["guidedCaptureSteps"];
  internalRoutes?: string[];
}) {
  const providerDiagnostics = getBrowserProviderDiagnostics();
  const uploadedScreenshotEvidence = Array.isArray(input.uploadedScreenshots) && input.uploadedScreenshots.length
    ? uploadedScreenshotsToEvidence(input)
    : null;
  const uploadedVideoEvidence = input.uploadedVideo?.url
    ? uploadedVideoToEvidence(input)
    : null;
  const uploadedEvidence = uploadedScreenshotEvidence && uploadedVideoEvidence
    ? mergeEvidenceBundles(uploadedScreenshotEvidence, uploadedVideoEvidence)
    : uploadedScreenshotEvidence || uploadedVideoEvidence || null;
  const extensionEvidence = input.accessMode === "browser_extension_capture"
    ? extensionCapturesToEvidence(input)
    : null;
  const manualEvidence = extensionEvidence && uploadedEvidence
    ? mergeEvidenceBundles(extensionEvidence, uploadedEvidence)
    : extensionEvidence || uploadedEvidence || null;

  if (input.accessMode === "browser_extension_capture") {
    const mergedEvidence = manualEvidence;
    const hasCredentials = Boolean(safeText(input.loginEmail) && safeText(input.loginPassword));
    const hasGuidedSteps = Array.isArray(input.guidedCaptureSteps) && input.guidedCaptureSteps.length > 0;
    const hasInternalRoutes = Array.isArray(input.internalRoutes) && input.internalRoutes.length > 0;
    const isPublicAudit =
      input.productType === "marketing_website" || input.productType === "ecommerce";
    if (isPublicAudit) {
      const fetched = await collectEvidenceViaFetch(input);
      const merged = mergeEvidenceBundles(
        {
          ...fetched,
          visitedFlows: [],
          debug: {
            ...providerDiagnostics,
            actualBrowserProvider: "none",
            browserbaseSessionCreated: false,
            browserbaseSessionId: "",
            browserbaseSessionReplayUrl: "",
            browserbaseContextLoaded: false,
            browserbaseContextSaved: false,
            guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
            guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
            guidedStepsAttempted: 0,
            guidedStepsCompleted: 0,
            guidedStepsSkippedReason: "Public website/ecommerce audits use direct page fetch plus uploaded evidence.",
            internalRoutesReceived: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
            internalRoutesAttempted: 0,
            internalRoutesCompleted: 0,
            loginAttempted: false,
            accessModeResolved: input.accessMode,
            browserFallbackAttempted: false,
            browserFallbackEligible: false,
            browserFallbackMode: "public_site_fetch_or_upload",
          },
        } satisfies EvidenceBundle,
        mergedEvidence,
      );
      merged.debug = {
        ...(merged.debug || {}),
        evidenceSource: "public_fetch_or_upload",
      };
      return merged;
    }
    const canUseBrowserFallback =
      hasCredentials ||
      Boolean(input.loginRequired) ||
      hasGuidedSteps ||
      hasInternalRoutes ||
      isPublicAudit;
    const mergedCoverage = mergedEvidence
      ? validateExplorationCoverage(input, mergedEvidence)
      : null;
    const manualCoverageStrongEnough =
      mergedCoverage?.status === "full_coverage" ||
      mergedCoverage?.status === "usable_coverage";

    if (!manualCoverageStrongEnough && canUseBrowserFallback) {
      // Continue into the browser pipeline below and merge the captured browser evidence
      // with extension/uploaded evidence instead of returning early.
    } else {
      return {
        ...(mergedEvidence || {
          pages: [],
          screenshotDataUrl: null,
          screenshots: [],
          warnings: [
            "Extension capture mode requires at least one captured page, screenshot, or uploaded video evidence.",
          ],
          visitedFlows: [],
          auth: {
            required: false,
            attempted: false,
            success: true,
            message: "",
          },
          debug: {},
        }),
        debug: {
          ...(mergedEvidence?.debug || {}),
          ...providerDiagnostics,
          actualBrowserProvider: "none",
          browserbaseSessionCreated: false,
          browserbaseSessionId: "",
          browserbaseSessionReplayUrl: "",
          browserbaseContextLoaded: false,
          browserbaseContextSaved: false,
          guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsAttempted: 0,
          guidedStepsCompleted: 0,
          guidedStepsSkippedReason: mergedCoverage && !manualCoverageStrongEnough && !canUseBrowserFallback
            ? "Extension/uploaded evidence was not strong enough and browser fallback could not run."
            : "Extension capture mode uses uploaded evidence and manual capture entries.",
          internalRoutesReceived: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
          internalRoutesAttempted: 0,
          internalRoutesCompleted: 0,
          loginAttempted: false,
          extensionCoverageStatus: mergedCoverage?.status || null,
          extensionCoverageSummary: mergedCoverage?.summary || "",
          browserFallbackAttempted: false,
          browserFallbackEligible: canUseBrowserFallback,
          browserFallbackMode: isPublicAudit ? "public_site_fetch_or_browser" : "authenticated_or_guided_browser",
        },
      };
    }
  }

  if (input.accessMode === "screenshot_upload_only") {
    return {
      ...(uploadedEvidence || {
        pages: [],
        screenshotDataUrl: null,
        screenshots: [],
        warnings: [],
        visitedFlows: [],
        auth: {
          required: false,
          attempted: false,
          success: true,
          message: "",
        },
        debug: {},
      }),
      debug: {
        ...(uploadedEvidence?.debug || {}),
        ...providerDiagnostics,
        actualBrowserProvider: "none",
        browserbaseSessionCreated: false,
        browserbaseSessionId: "",
        browserbaseSessionReplayUrl: "",
        browserbaseContextLoaded: false,
        browserbaseContextSaved: false,
        guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsAttempted: 0,
        guidedStepsCompleted: 0,
        guidedStepsSkippedReason: "Screenshot upload only mode selected.",
        internalRoutesReceived: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
        internalRoutesAttempted: 0,
        internalRoutesCompleted: 0,
        loginAttempted: false,
      },
    };
  }

  const mode = (process.env.EVIDENCE_MODE || "fetch").toLowerCase();
  const hasCredentials = Boolean(safeText(input.loginEmail) && safeText(input.loginPassword));
  const hasGuidedSteps = Array.isArray(input.guidedCaptureSteps) && input.guidedCaptureSteps.length > 0;
  const hasInternalRoutes = Array.isArray(input.internalRoutes) && input.internalRoutes.length > 0;
  const isPublicAudit =
    input.productType === "marketing_website" || input.productType === "ecommerce";
  const invalidInternalRoutesOnly =
    input.accessMode === "internal_routes_only" && !hasInternalRoutes;
  const normalizedAccessMode = invalidInternalRoutesOnly && isPublicAudit
    ? "public_fetch_fallback"
    : input.accessMode;
  const explicitBrowserAccessMode =
    normalizedAccessMode === "manual_browser_login" ||
    normalizedAccessMode === "use_saved_session" ||
    (normalizedAccessMode === "auto_login" && (hasCredentials || Boolean(input.loginRequired)));
  const requiresLogin = Boolean(
    input.loginRequired || (normalizedAccessMode === "auto_login" && hasCredentials),
  );
  const canAttemptLogin = requiresLogin && hasCredentials;
  const shouldUseBrowser =
    normalizedAccessMode !== "public_fetch_fallback" && (
      (!isPublicAudit && mode === "browser") ||
      requiresLogin ||
      explicitBrowserAccessMode ||
      (hasGuidedSteps || hasInternalRoutes) && !isPublicAudit
    );
  const browserInput =
    requiresLogin === Boolean(input.loginRequired) && normalizedAccessMode === input.accessMode
      ? input
      : { ...input, loginRequired: requiresLogin, accessMode: normalizedAccessMode as typeof input.accessMode };
  const provider = createBrowserProvider();
  const savedAuthState = await loadContextAuthState(provider, input.productUrl).catch(() => null);
  const canUseSavedSession = Boolean(savedAuthState?.state);

  if (normalizedAccessMode === "use_saved_session" && !canUseSavedSession) {
    return {
      pages: [],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: ["No saved authenticated session was found for this product domain."],
      visitedFlows: [],
      auth: {
        required: true,
        attempted: false,
        success: false,
        message: "No saved authenticated session was found. Please login manually or use auto login.",
      },
      debug: {
        ...providerDiagnostics,
        provider: provider.name,
        actualBrowserProvider: "none",
        auth_session_expired: false,
        savedSessionFound: false,
        browserbaseSessionCreated: false,
        browserbaseSessionId: "",
        browserbaseSessionReplayUrl: "",
        browserbaseContextLoaded: false,
        browserbaseContextSaved: false,
        guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsAttempted: 0,
        guidedStepsCompleted: 0,
        guidedStepsSkippedReason: "Saved session required but no saved session was found.",
      },
    } satisfies EvidenceBundle;
  }

  if (normalizedAccessMode === "manual_browser_login") {
    return {
      pages: [],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: [
        isPublicAudit
          ? "Public website/ecommerce audits do not require manual browser login. Use captured public pages, screenshots, or extension evidence instead."
          : "Manual browser login was selected. Add guided capture steps, internal routes, or a saved session before running a full audit.",
      ],
      visitedFlows: [],
      auth: {
        required: true,
        attempted: false,
        success: false,
        message:
          isPublicAudit
            ? "Public website/ecommerce audits should use direct page fetch, screenshots, or extension evidence instead of manual browser login."
            : "Manual browser login requires a live authenticated session. Complete login and save a session, then re-run the audit.",
      },
      debug: {
        ...providerDiagnostics,
        provider: provider.name,
        actualBrowserProvider: "none",
        manualLoginSelected: true,
        browserbaseSessionCreated: false,
        browserbaseSessionId: "",
        browserbaseSessionReplayUrl: "",
        browserbaseContextLoaded: false,
        browserbaseContextSaved: false,
        guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsAttempted: 0,
        guidedStepsCompleted: 0,
        guidedStepsSkippedReason: "Manual browser login mode selected.",
      },
    } satisfies EvidenceBundle;
  }

  if (requiresLogin && !canAttemptLogin) {
    const message = "Login required but credentials are missing.";
    return {
      pages: [],
      screenshotDataUrl: null,
      screenshots: [],
      warnings: [message],
      visitedFlows: [],
      auth: {
        required: true,
        attempted: false,
        success: false,
        message,
      },
      debug: {
        ...providerDiagnostics,
        actualBrowserProvider: "none",
        browserbaseSessionCreated: false,
        browserbaseSessionId: "",
        browserbaseSessionReplayUrl: "",
        browserbaseContextLoaded: false,
        browserbaseContextSaved: false,
        guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
        guidedStepsAttempted: 0,
        guidedStepsCompleted: 0,
        guidedStepsSkippedReason: "Login credentials were missing.",
      },
    } satisfies EvidenceBundle;
  }

  if (!shouldUseBrowser && !requiresLogin) {
    const fetched = await collectEvidenceViaFetch(input);
    return mergeEvidenceBundles(
      {
        ...fetched,
        visitedFlows: [],
        debug: {
          ...providerDiagnostics,
          actualBrowserProvider: "none",
          browserbaseSessionCreated: false,
          browserbaseSessionId: "",
          browserbaseSessionReplayUrl: "",
          browserbaseContextLoaded: false,
          browserbaseContextSaved: false,
          guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsAttempted: 0,
          guidedStepsCompleted: 0,
          guidedStepsSkippedReason: invalidInternalRoutesOnly
            ? "Internal routes only mode was selected without any routes, so the audit fell back to public-page fetch."
            : hasGuidedSteps ? "Guided steps require browser mode." : "",
          internalRoutesReceived: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
          internalRoutesAttempted: 0,
          internalRoutesCompleted: 0,
          loginAttempted: false,
          accessModeResolved: normalizedAccessMode,
          internalRoutesMissingFallback: invalidInternalRoutesOnly,
          evidenceSource: "public_fetch",
        },
      } satisfies EvidenceBundle,
      manualEvidence,
    );
  }

  try {
    const browserResult = await provider.runWithPage(
      { domain: productDomain(input.productUrl), storageState: savedAuthState?.state ?? null },
      async (page, context, sessionMeta) => {
        const explorer = createExplorer(browserInput);
        await explorer.run(context);
        const result = explorer.getResult();
        if (result.auth?.success) {
          await saveContextAuthState(provider, input.productUrl, context).catch(() => {});
        } else if (input.accessMode === "use_saved_session" && result.auth?.required && !result.auth.success) {
          result.auth.message =
            "Saved authenticated session appears expired. Please login again and refresh the saved session.";
          result.debug = {
            ...(result.debug || {}),
            auth_session_expired: true,
          };
        }
        result.debug = {
          ...providerDiagnostics,
          ...(result.debug || {}),
          provider: provider.name,
          requestedBrowserProvider: providerDiagnostics.requestedBrowserProvider,
          actualBrowserProvider: provider.name,
          browserProviderFallbackReason:
            provider.name === "browserbase" ? "" : providerDiagnostics.browserProviderFallbackReason,
          browserbaseSessionCreated: Boolean(sessionMeta.sessionId),
          browserSessionId: sessionMeta.sessionId || "",
          browserbaseSessionId: sessionMeta.sessionId || "",
          sessionReplayUrl: provider.getSessionReplayUrl(sessionMeta),
          browserbaseSessionReplayUrl: provider.getSessionReplayUrl(sessionMeta),
          savedSessionFound: canUseSavedSession,
          browserbaseContextLoaded: Boolean(savedAuthState?.state),
          browserbaseContextSaved: Boolean(result.auth?.success),
          finalUrl: page.url(),
          loginAttempted: Boolean(result.auth?.attempted),
          guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsAttempted: Array.isArray((result.debug || {}).guidedStepResults)
            ? ((result.debug || {}).guidedStepResults as unknown[]).length
            : 0,
          guidedStepsCompleted: Array.isArray((result.debug || {}).guidedStepResults)
          ? ((result.debug || {}).guidedStepResults as Record<string, unknown>[]).filter((item) => item.success === true).length
          : 0,
        guidedStepsSkippedReason:
          Array.isArray(input.guidedCaptureSteps) &&
          input.guidedCaptureSteps.length > 0 &&
          !Array.isArray((result.debug || {}).guidedStepResults)
            ? "Guided steps were received but not executed."
            : "",
        internalRoutesReceived: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
        internalRoutesAttempted: Array.isArray((result.debug || {}).internalRouteResults)
          ? ((result.debug || {}).internalRouteResults as unknown[]).length
          : 0,
        internalRoutesCompleted: Array.isArray((result.debug || {}).internalRouteResults)
          ? ((result.debug || {}).internalRouteResults as Record<string, unknown>[]).filter((item) => item.success === true).length
          : 0,
      };
      result.screenshots = result.screenshots.map((shot) => ({
        ...shot,
        source:
          shot.source ||
          (provider.name === "browserbase" ? "browserbase" : "local_playwright"),
        sessionReplayUrl: sessionMeta.replayUrl || sessionMeta.liveUrl || "",
      }));
        return result;
      },
    );

    const merged = mergeEvidenceBundles(browserResult, manualEvidence);
    const mergedDebug: Record<string, unknown> = {
      ...(merged.debug || {}),
      uploadedScreenshotsReceived:
        Array.isArray(input.uploadedScreenshots) ? input.uploadedScreenshots.length : 0,
      uploadedScreenshotsStored: uploadedScreenshotEvidence?.screenshots.length ?? 0,
      uploadedScreenshotsConvertedToEvidence: uploadedScreenshotEvidence?.pages.length ?? 0,
      uploadedScreenshotsUsedForQuestions: uploadedScreenshotEvidence?.pages.length ?? 0,
      uploadedVideoReceived: input.uploadedVideo?.url ? 1 : 0,
      uploadedVideoStored: uploadedVideoEvidence?.screenshots.length ?? 0,
      uploadedVideoConvertedToEvidence: uploadedVideoEvidence?.pages.length ?? 0,
      uploadedVideoUsedForQuestions: uploadedVideoEvidence?.pages.length ?? 0,
      uploadedScreenshotErrors: [],
      evidenceItemsCount: (merged.pages?.length ?? 0) + (merged.screenshots?.length ?? 0),
      browserFallbackAttempted: input.accessMode === "browser_extension_capture",
    };
    if (
      Array.isArray(input.guidedCaptureSteps) &&
      input.guidedCaptureSteps.length > 0 &&
      Number(mergedDebug["guidedStepsAttempted"] || 0) === 0
    ) {
      merged.warnings.push("Guided steps were received but not executed.");
      mergedDebug["guidedStepsSkippedReason"] = "Guided steps were received but not executed.";
    }
    merged.debug = mergedDebug;
    return merged;
  } catch (error) {
    console.error("Browser evidence collection failed:", error);
    const merged = mergeEvidenceBundles(
      {
        pages: [],
        screenshotDataUrl: manualEvidence?.screenshotDataUrl || null,
        screenshots: [],
        warnings: [`Browser evidence collection failed: ${getErrorMessage(error)}`],
        visitedFlows: [],
        auth: {
          required: requiresLogin,
          attempted: false,
          success: false,
          message: getErrorMessage(error),
        },
        debug: {
          ...providerDiagnostics,
          actualBrowserProvider: "none",
          browserProviderFallbackReason:
            getErrorMessage(error),
          browserbaseSessionCreated: false,
          browserbaseSessionId: "",
          browserbaseSessionReplayUrl: "",
          browserbaseContextLoaded: false,
          browserbaseContextSaved: false,
          guidedStepsReceived: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsParsed: Array.isArray(input.guidedCaptureSteps) ? input.guidedCaptureSteps.length : 0,
          guidedStepsAttempted: 0,
          guidedStepsCompleted: 0,
          guidedStepsSkippedReason:
            Array.isArray(input.guidedCaptureSteps) && input.guidedCaptureSteps.length > 0
              ? "Browser session failed before guided steps could run."
              : "",
          internalRoutesReceived: Array.isArray(input.internalRoutes) ? input.internalRoutes.length : 0,
          internalRoutesAttempted: 0,
          internalRoutesCompleted: 0,
          uploadedScreenshotsReceived:
            Array.isArray(input.uploadedScreenshots) ? input.uploadedScreenshots.length : 0,
          uploadedScreenshotsStored: uploadedScreenshotEvidence?.screenshots.length ?? 0,
          uploadedScreenshotsConvertedToEvidence: uploadedScreenshotEvidence?.pages.length ?? 0,
          uploadedScreenshotsUsedForQuestions: uploadedScreenshotEvidence?.pages.length ?? 0,
          uploadedVideoReceived: input.uploadedVideo?.url ? 1 : 0,
          uploadedVideoStored: uploadedVideoEvidence?.screenshots.length ?? 0,
          uploadedVideoConvertedToEvidence: uploadedVideoEvidence?.pages.length ?? 0,
          uploadedVideoUsedForQuestions: uploadedVideoEvidence?.pages.length ?? 0,
          uploadedScreenshotErrors: [],
          evidenceItemsCount:
            (uploadedScreenshotEvidence?.pages.length ?? 0) +
            (uploadedScreenshotEvidence?.screenshots.length ?? 0) +
            (uploadedVideoEvidence?.pages.length ?? 0) +
            (uploadedVideoEvidence?.screenshots.length ?? 0),
          loginAttempted: false,
        },
      } satisfies EvidenceBundle,
      manualEvidence,
    );
    return merged;
  }
}
