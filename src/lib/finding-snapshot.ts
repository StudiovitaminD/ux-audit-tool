import chromium from "@sparticuz/chromium";
import { chromium as pwChromium, type Page } from "playwright-core";

export type FindingSnapshotInput = {
  reportId?: string;
  product_url: string;
  finding_id?: string;
  bucket?: string;
  title?: string;
  what_we_found?: string;
  why_it_matters?: string;
  recommendation?: string;
};

export type FindingSnapshotResult = {
  screenshot: string;
  screenshot_url: string;
  page_url: string;
  page_title: string;
  warning?: string;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function buildCandidateUrls(input: FindingSnapshotInput) {
  const rawUrl = safeText(input.product_url);
  if (!rawUrl) return [];

  let root: URL;
  try {
    root = new URL(rawUrl);
  } catch {
    return [];
  }

  const sourceText = [
    safeText(input.bucket),
    safeText(input.title),
    safeText(input.what_we_found),
    safeText(input.why_it_matters),
    safeText(input.recommendation),
  ]
    .join(" ")
    .toLowerCase();

  const candidates = [root.toString()];

  const addPath = (path: string) => {
    try {
      candidates.push(new URL(path, root).toString());
    } catch {}
  };

  if (
    includesAny(sourceText, [
      "form",
      "submit",
      "validation",
      "field",
      "contact",
      "lead",
      "input",
      "error",
      "placeholder",
      "label",
    ])
  ) {
    addPath("/contact");
    addPath("/contact-us");
    addPath("/lets-talk");
    addPath("/letstalk");
    addPath("/start-a-project");
    addPath("/book-a-call");
  }

  if (includesAny(sourceText, ["case stud", "portfolio", "work"])) {
    addPath("/work");
    addPath("/case-studies");
    addPath("/portfolio");
  }

  if (includesAny(sourceText, ["service", "pricing", "offer", "capabilit"])) {
    addPath("/services");
    addPath("/pricing");
  }

  if (includesAny(sourceText, ["blog", "content", "insight", "article"])) {
    addPath("/blog");
    addPath("/insights");
  }

  return Array.from(new Set(candidates)).slice(0, 3);
}

async function withBrowser<T>(
  fn: (browser: Awaited<ReturnType<typeof pwChromium.launch>>) => Promise<T>,
) {
  const executablePath = await chromium.executablePath();
  const browser = await Promise.race([
    pwChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    }),
    timeoutAfter(10_000, "Timed out launching browser for finding screenshot"),
  ]);

  try {
    return await Promise.race([
      fn(browser),
      timeoutAfter(38_000, "Timed out capturing finding screenshot"),
    ]);
  } finally {
    await browser.close();
  }
}

async function preparePage(page: Page) {
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (
      resourceType === "font" ||
      resourceType === "media" ||
      resourceType === "websocket"
    ) {
      return route.abort();
    }
    return route.continue();
  });

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      html {
        scroll-behavior: auto !important;
      }
    `,
  }).catch(() => {});
}

async function captureFindingImage(page: Page) {
  return page.screenshot({
    fullPage: false,
    type: "jpeg",
    quality: 70,
    timeout: 4000,
  });
}

async function captureFromPage(page: Page, input: FindingSnapshotInput) {
  const sourceText = [
    safeText(input.bucket),
    safeText(input.title),
    safeText(input.what_we_found),
    safeText(input.why_it_matters),
    safeText(input.recommendation),
  ]
    .join(" ")
    .toLowerCase();

  if (
    includesAny(sourceText, [
      "form",
      "submit",
      "validation",
      "field",
      "contact",
      "input",
      "error",
      "placeholder",
      "label",
    ])
  ) {
    const formTarget = page.locator("form").first();
    if ((await formTarget.count().catch(() => 0)) > 0) {
      await formTarget.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(250).catch(() => {});
      try {
        return await formTarget.screenshot({
          type: "jpeg",
          quality: 70,
          timeout: 4000,
        });
      } catch {}
    }
  }

  return captureFindingImage(page);
}

export function makeFallbackFindingSnapshot(
  pageUrl: string,
  warning: string,
): FindingSnapshotResult {
  return {
    screenshot: "",
    screenshot_url: "",
    page_url: pageUrl,
    page_title: "",
    warning,
  };
}

export async function captureFindingSnapshot(
  input: FindingSnapshotInput,
): Promise<FindingSnapshotResult> {
  const candidates = buildCandidateUrls(input);
  const initialUrl = safeText(input.product_url);

  if (!candidates.length) {
    return makeFallbackFindingSnapshot(
      initialUrl,
      "Missing or invalid product_url for finding screenshot capture",
    );
  }

  return withBrowser(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    });

    const page = await context.newPage();
    let lastError = "Failed to capture screenshot";

    try {
      await preparePage(page);

      for (const candidateUrl of candidates) {
        try {
          await page.goto(candidateUrl, {
            waitUntil: "domcontentloaded",
            timeout: 10_000,
          });
          await page.waitForLoadState("networkidle", { timeout: 2_500 }).catch(() => {});
          await page.waitForTimeout(500).catch(() => {});
          await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
          const image = await captureFromPage(page, input);
          const dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;

          return {
            screenshot: dataUrl,
            screenshot_url: dataUrl,
            page_url: page.url(),
            page_title: safeText(await page.title().catch(() => "")),
          };
        } catch (error) {
          lastError =
            error instanceof Error ? error.message : "Failed to capture screenshot";
        }
      }

      return makeFallbackFindingSnapshot(candidates[0] || initialUrl, lastError);
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
    }
  }).catch((error) =>
    makeFallbackFindingSnapshot(
      candidates[0] || initialUrl,
      error instanceof Error ? error.message : "Failed to capture screenshot",
    ),
  );
}
