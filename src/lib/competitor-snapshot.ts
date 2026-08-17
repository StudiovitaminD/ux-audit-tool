import chromium from "@sparticuz/chromium";
import { chromium as pwChromium, type CDPSession, type Page } from "playwright-core";

export type CompetitorSnapshotInput = {
  name?: string;
  url: string;
  compare_focus?: string;
};

export type CompetitorSnapshotResult = {
  name: string;
  url: string;
  compare_focus: string;
  title: string;
  meta_description: string;
  positioning: string;
  h1: string[];
  h2: string[];
  h3: string[];
  top_nav_links: Array<{ text: string; href: string }>;
  primary_ctas: Array<{ text: string; href: string }>;
  proof_points: string[];
  service_signals: string[];
  content_highlights: string[];
  brand_messages: string[];
  text_snippet: string;
  page_text: string;
  screenshot: string;
  screenshot_url: string;
  warning?: string;
};

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(text: string, max = 1800) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

function timeoutAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

type PageData = {
  title: string;
  metaDescription: string;
  positioning: string;
  h1: string[];
  h2: string[];
  h3: string[];
  topNavLinks: Array<{ text: string; href: string }>;
  primaryCtas: Array<{ text: string; href: string }>;
  proofPoints: string[];
  serviceSignals: string[];
  contentHighlights: string[];
  brandMessages: string[];
  textSnippet: string;
};

function uniqueStrings(values: string[], max = values.length) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values.map(safeText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= max) break;
  }
  return output;
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
    timeoutAfter(12_000, "Timed out launching browser for competitor screenshot"),
  ]);

  try {
    return await Promise.race([
      fn(browser),
      timeoutAfter(42_000, "Timed out capturing competitor screenshot"),
    ]);
  } finally {
    await browser.close();
  }
}

async function captureViaCdp(page: Page) {
  const session: CDPSession = await page.context().newCDPSession(page);
  await session.send("Page.enable");
  const result = await session.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: 70,
    fromSurface: true,
    captureBeyondViewport: false,
  });
  return Buffer.from(result.data, "base64");
}

async function captureScreenshot(page: Page) {
  try {
    return await captureViaCdp(page);
  } catch {
    try {
      return await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 60,
        timeout: 3_500,
      });
    } catch {
      await page.setViewportSize({ width: 1024, height: 576 }).catch(() => {});
      await page.waitForTimeout(250).catch(() => {});
    }
    return page.screenshot({
      fullPage: false,
      type: "jpeg",
      quality: 45,
      timeout: 2_000,
    });
  }
}

export function makeFallbackSnapshot(
  body: CompetitorSnapshotInput,
  warning: string,
  title = "",
): CompetitorSnapshotResult {
  return {
    name: body.name || "",
    url: body.url,
    compare_focus: body.compare_focus || "",
    title,
    meta_description: "",
    positioning: "",
    h1: [],
    h2: [],
    h3: [],
    top_nav_links: [],
    primary_ctas: [],
    proof_points: [],
    service_signals: [],
    content_highlights: [],
    brand_messages: [],
    text_snippet: "",
    page_text: "",
    screenshot: "",
    screenshot_url: "",
    warning,
  };
}

export async function captureCompetitorSnapshot(
  body: CompetitorSnapshotInput,
): Promise<CompetitorSnapshotResult> {
  try {
    const result = await withBrowser(async (browser) => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
      });

      const page = await context.newPage();
      try {
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
        await page.goto(body.url, { waitUntil: "domcontentloaded", timeout: 12_000 });
        await page.waitForTimeout(700);
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.addStyleTag({
          content: `
            *, *::before, *::after { animation: none !important; transition: none !important; }
            html { scroll-behavior: auto !important; }
          `,
        }).catch(() => {});

        const data = await page.evaluate(() => {
          const cleanText = (value: string) => value.replace(/\s+/g, " ").trim();
          const take = (selector: string, max: number) =>
            Array.from(document.querySelectorAll(selector))
              .map((node) => cleanText(node.textContent || ""))
              .filter(Boolean)
              .slice(0, max);

          const uniq = <T,>(items: T[], keyFn: (item: T) => string) => {
            const seen = new Set<string>();
            return items.filter((item) => {
              const key = keyFn(item);
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          };

          const absoluteHref = (href: string) => {
            try {
              return new URL(href, window.location.href).toString();
            } catch {
              return href;
            }
          };

          const navLike = Array.from(
            document.querySelectorAll("nav a[href], header a[href], [role='navigation'] a[href]"),
          ) as HTMLAnchorElement[];

          const allLinks = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
          const ctaMatches = uniq(
            allLinks
            .map((link) => ({
              text: cleanText(link.textContent || ""),
              href: absoluteHref(link.getAttribute("href") || ""),
            }))
            .filter((link) => {
              const text = link.text.toLowerCase();
              return (
                link.text &&
                link.href &&
                (text.includes("contact") ||
                  text.includes("talk") ||
                  text.includes("demo") ||
                  text.includes("get started") ||
                  text.includes("start") ||
                  text.includes("book"))
              );
            })
            .slice(0, 12),
            (link) => `${link.text}|${link.href}`,
          );

          const headingTexts = take("h1, h2, h3", 12);
          const paragraphTexts = take("main p, section p, article p, [role='main'] p", 18);
          const listTexts = take("main li, section li, article li, [role='main'] li", 18);
          const allButtons = Array.from(document.querySelectorAll("button, [role='button']"))
            .map((node) => cleanText(node.textContent || ""))
            .filter(Boolean);

          const positioningCandidates = [
            ...take("main h1", 2),
            ...take("main h2", 2),
            ...take("header h1", 1),
            ...paragraphTexts.slice(0, 4),
          ];

          const keywordRegex =
            /(design|product design|ux|ui|branding|research|strategy|development|engineering|web|app|mobile|creative|video|copywriting|automation|ai|consulting|design systems)/i;
          const serviceSignals = uniq(
            [...headingTexts, ...paragraphTexts, ...listTexts].filter((text) => keywordRegex.test(text)),
            (text) => text.toLowerCase(),
          ).slice(0, 10);

          const proofRegex =
            /(trusted|brands|clients|customers|roi|case stud|testimonial|review|results|improvement|faster|efficient|payback|award|years|projects|delivered|teams)/i;
          const proofPoints = uniq(
            [...headingTexts, ...paragraphTexts, ...listTexts].filter((text) => proofRegex.test(text)),
            (text) => text.toLowerCase(),
          ).slice(0, 10);

          const highlightRegex =
            /(ai|workflow|scale|speed|global|premium|quality|enterprise|speciali[sz]e|platform|creative|product|experience|growth|conversion|launch)/i;
          const contentHighlights = uniq(
            [...headingTexts, ...paragraphTexts].filter((text) => highlightRegex.test(text)),
            (text) => text.toLowerCase(),
          ).slice(0, 10);

          const brandMessages = uniq(
            [...headingTexts, ...paragraphTexts, ...allButtons].filter((text) => text.length >= 20),
            (text) => text.toLowerCase(),
          ).slice(0, 8);

          const mainText =
            (document.querySelector("main")?.textContent || document.body?.textContent || "") + "";

          return {
            title: document.title || "",
            metaDescription:
              document.querySelector("meta[name='description']")?.getAttribute("content") || "",
            positioning: positioningCandidates.find((text) => text.length >= 20) || "",
            h1: take("h1", 6),
            h2: take("h2", 8),
            h3: take("h3", 8),
            topNavLinks: uniq(
              navLike
              .map((link) => ({
                text: cleanText(link.textContent || ""),
                href: absoluteHref(link.getAttribute("href") || ""),
              }))
              .filter((link) => link.text && link.href)
              .slice(0, 12),
              (link) => `${link.text}|${link.href}`,
            ),
            primaryCtas: ctaMatches,
            proofPoints,
            serviceSignals,
            contentHighlights,
            brandMessages,
            mainText,
          };
        });

        const pageData: PageData = {
          title: safeText(data.title),
          metaDescription: safeText(data.metaDescription),
          positioning: safeText(data.positioning),
          h1: uniqueStrings(data.h1 || [], 6),
          h2: uniqueStrings(data.h2 || [], 8),
          h3: uniqueStrings(data.h3 || [], 8),
          topNavLinks: (data.topNavLinks || [])
            .map((link) => ({
              text: safeText(link?.text),
              href: safeText(link?.href),
            }))
            .filter((link) => link.text && link.href),
          primaryCtas: (data.primaryCtas || [])
            .map((link) => ({
              text: safeText(link?.text),
              href: safeText(link?.href),
            }))
            .filter((link) => link.text && link.href),
          proofPoints: uniqueStrings(data.proofPoints || [], 10),
          serviceSignals: uniqueStrings(data.serviceSignals || [], 10),
          contentHighlights: uniqueStrings(data.contentHighlights || [], 10),
          brandMessages: uniqueStrings(data.brandMessages || [], 8),
          textSnippet: truncate(String(data.mainText || "")),
        };

        const pageText = [
          `Title: ${pageData.title}`,
          `Meta description: ${pageData.metaDescription}`,
          `Positioning: ${pageData.positioning}`,
          `H1: ${pageData.h1.join(" | ")}`,
          `H2: ${pageData.h2.join(" | ")}`,
          `H3: ${pageData.h3.join(" | ")}`,
          `Primary CTAs: ${pageData.primaryCtas.map((cta) => cta.text).join(" | ")}`,
          `Top nav: ${pageData.topNavLinks.map((link) => link.text).join(" | ")}`,
          `Proof points: ${pageData.proofPoints.join(" | ")}`,
          `Service signals: ${pageData.serviceSignals.join(" | ")}`,
          `Content highlights: ${pageData.contentHighlights.join(" | ")}`,
          `Brand messages: ${pageData.brandMessages.join(" | ")}`,
          `Text snippet: ${pageData.textSnippet}`,
        ]
          .filter((line) => !line.endsWith(": "))
          .join("\n");

        let dataUrl = "";
        let warning = "";
        try {
          const image = await captureScreenshot(page);
          dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
        } catch (error) {
          warning = error instanceof Error ? error.message : "Failed to capture screenshot";
        }

        return {
          pageData,
          pageText,
          dataUrl,
          warning,
        };
      } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
      }
    });

    return {
      name: body.name || "",
      url: body.url,
      compare_focus: body.compare_focus || "",
      title: result.pageData.title,
      meta_description: result.pageData.metaDescription,
      positioning: result.pageData.positioning,
      h1: result.pageData.h1,
      h2: result.pageData.h2,
      h3: result.pageData.h3,
      top_nav_links: result.pageData.topNavLinks,
      primary_ctas: result.pageData.primaryCtas,
      proof_points: result.pageData.proofPoints,
      service_signals: result.pageData.serviceSignals,
      content_highlights: result.pageData.contentHighlights,
      brand_messages: result.pageData.brandMessages,
      text_snippet: result.pageData.textSnippet,
      page_text: result.pageText,
      screenshot: result.dataUrl,
      screenshot_url: result.dataUrl,
      warning: result.warning || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to capture screenshot";
    return makeFallbackSnapshot(body, message);
  }
}
