import type { EvidenceBundle } from "@/lib/evidence-collector";

export type ExternalToolName = "playwright" | "axe" | "lighthouse" | "screenshot_diff";

export type ExternalToolStatus = {
  name: ExternalToolName;
  status: "ready" | "not_configured" | "not_run" | "failed";
  evidenceCount: number;
  capabilities: string[];
  message?: string;
};

export type ExternalToolPipelineResult = {
  version: "1";
  ranAt: string;
  providers: ExternalToolStatus[];
  evidenceCount: number;
  actionableEvidenceCount: number;
  warnings: string[];
};

type LighthouseSummary = {
  performance?: number;
  accessibility?: number;
  bestPractices?: number;
  seo?: number;
  audits?: Record<string, { score: number | null; numericValue?: number; displayValue?: string }>;
};

const LIGHTHOUSE_SCORING_AUDITS = [
  "largest-contentful-paint",
  "total-blocking-time",
  "uses-optimized-images",
  "uses-responsive-images",
  "unused-javascript",
  "render-blocking-resources",
  "cumulative-layout-shift",
  "color-contrast",
] as const;

const loadRuntimeModule = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<any>;

/**
 * Makes the external evidence contract explicit. Playwright and axe already
 * run in the collector; this layer records their contribution and prevents
 * the scoring model from treating an unconfigured tool as a failed audit.
 */
export function attachExternalToolPipeline(bundle: EvidenceBundle): EvidenceBundle {
  const pages = bundle.pages || [];
  const records = bundle.evidenceRecords || [];
  const deterministicPages = pages.filter((page) => Boolean(page.deterministic));
  const axePages = deterministicPages.filter((page) => Boolean(page.deterministic?.axe?.tested));
  const screenshotCount = (bundle.screenshots || []).filter(
    (screenshot) => screenshot.isValidAuditEvidence !== false,
  ).length;
  const lighthouseConfigured = process.env.LIGHTHOUSE_ENABLED === "true";

  const providers: ExternalToolStatus[] = [
    {
      name: "playwright",
      status: deterministicPages.length ? "ready" : "not_run",
      evidenceCount: deterministicPages.length,
      capabilities: [
        "navigation",
        "responsive_layout",
        "zoom",
        "keyboard_focus",
        "forms",
        "reduced_motion",
        "performance_timing",
      ],
      message: deterministicPages.length
        ? "Browser measurements are available to the question evidence registry."
        : "No browser page measurements were captured.",
    },
    {
      name: "axe",
      status: axePages.length ? "ready" : "not_run",
      evidenceCount: axePages.length,
      capabilities: ["accessibility_rules", "semantic_accessibility"],
      message: axePages.length
        ? "axe results are attached to accessibility evidence."
        : "axe did not run because no browser page was captured.",
    },
    {
      name: "lighthouse",
      status: lighthouseConfigured ? "not_run" : "not_configured",
      evidenceCount: 0,
      capabilities: ["performance", "best_practices", "seo"],
      message: lighthouseConfigured
        ? "Lighthouse is enabled but has not been installed/configured for this deployment."
        : "Set LIGHTHOUSE_ENABLED=true after installing the Lighthouse runner; it is optional and never blocks reports.",
    },
    {
      name: "screenshot_diff",
      status: screenshotCount ? "ready" : "not_run",
      evidenceCount: screenshotCount,
      capabilities: ["visual_state_capture", "responsive_visual_comparison"],
      message: screenshotCount
        ? "Captured screens are available for visual inspection."
        : "No valid screenshots were captured.",
    },
  ];

  const pipeline: ExternalToolPipelineResult = {
    version: "1",
    ranAt: new Date().toISOString(),
    providers,
    evidenceCount: records.length,
    actionableEvidenceCount: records.filter((record) => record.status === "confirmed").length,
    warnings: providers
      .filter((provider) => provider.status === "not_run" || provider.status === "not_configured")
      .map((provider) => `${provider.name}: ${provider.message}`),
  };

  return {
    ...bundle,
    warnings: [...(bundle.warnings || []), ...pipeline.warnings],
    debug: {
      ...(bundle.debug || {}),
      externalToolPipeline: pipeline,
    },
  };
}

/** Runs Lighthouse only when explicitly enabled. A Lighthouse outage must not
 * discard the Playwright/axe evidence that is already sufficient for scoring. */
export async function runExternalToolPipeline(bundle: EvidenceBundle, url: string) {
  const prepared = attachExternalToolPipeline(bundle);
  const pipeline = prepared.debug?.externalToolPipeline as ExternalToolPipelineResult;
  if (process.env.LIGHTHOUSE_ENABLED !== "true") return prepared;

  try {
    const [{ default: lighthouse }, chromeLauncher, chromiumModule] = await Promise.all([
      loadRuntimeModule("lighthouse"),
      loadRuntimeModule("chrome-launcher"),
      loadRuntimeModule("@sparticuz/chromium"),
    ]);
    const chromePath = await chromiumModule.default.executablePath();
    const chrome = await chromeLauncher.launch({
      chromePath: chromePath || undefined,
      chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
    });
    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: "json",
        logLevel: "silent",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      });
      const categories = result?.lhr?.categories;
      const rawAudits = result?.lhr?.audits || {};
      const audits = Object.fromEntries(
        LIGHTHOUSE_SCORING_AUDITS.flatMap((id) => {
          const audit = rawAudits[id];
          if (!audit || (typeof audit.score !== "number" && audit.score !== null)) return [];
          return [[id, {
            score: audit.score,
            ...(typeof audit.numericValue === "number" ? { numericValue: audit.numericValue } : {}),
            ...(typeof audit.displayValue === "string" ? { displayValue: audit.displayValue } : {}),
          }]];
        }),
      );
      const summary: LighthouseSummary = {
        performance: categories?.performance?.score ?? undefined,
        accessibility: categories?.accessibility?.score ?? undefined,
        bestPractices: categories?.["best-practices"]?.score ?? undefined,
        seo: categories?.seo?.score ?? undefined,
        audits,
      };
      const providers = pipeline.providers.map((provider) => provider.name === "lighthouse"
        ? { ...provider, status: "ready" as const, evidenceCount: 1, message: "Lighthouse completed.", summary }
        : provider);
      return {
        ...prepared,
        debug: {
          ...(prepared.debug || {}),
          externalToolPipeline: { ...pipeline, providers },
          lighthouse: summary,
        },
      };
    } finally {
      try {
        chrome.kill();
      } catch {
        // Cleanup failure must not replace the audit result.
      }
    }
  } catch (error) {
    const providers = pipeline.providers.map((provider) => provider.name === "lighthouse"
      ? { ...provider, status: "failed" as const, message: `Lighthouse failed: ${error instanceof Error ? error.message : String(error)}` }
      : provider);
    return {
      ...prepared,
      warnings: [...(prepared.warnings || []), "Lighthouse failed; Playwright and axe evidence were retained."],
      debug: { ...(prepared.debug || {}), externalToolPipeline: { ...pipeline, providers } },
    };
  }
}
