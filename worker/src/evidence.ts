import chromium from "@sparticuz/chromium";
import { chromium as pwChromium, type Browser } from "playwright-core";
import type { EvidenceBundle, EvidencePage, Intake } from "./types.js";
import type { WorkerEnv } from "./env.js";
import { getStorage } from "./firebase.js";

function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function safeText(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function truncate(text: string, max = 1800) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function toAbsUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

async function withBrowser<T>(fn: (browser: Browser) => Promise<T>) {
  const executablePath = await chromium.executablePath();
  const browser = await pwChromium.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function uploadScreenshot(env: WorkerEnv, reportId: string, name: string, buf: Buffer) {
  const storage = getStorage(env);
  const bucket = storage.bucket();
  const path = `ux_audits/${reportId}/screenshots/${name}`;
  const file = bucket.file(path);
  await file.save(buf, { contentType: "image/png", resumable: false });
  // Signed URL for 7 days (fine for report generation); you can later make it public or proxy via Next.js.
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

export async function collectEvidence(env: WorkerEnv, reportId: string, intake: Intake) {
  const warnings: string[] = [];

  const startUrl = intake.product_url;
  const flowUrls: string[] = [];
  for (const f of intake.audit_flows || []) {
    const m = String(f).match(/https?:\/\/[^\s)]+/g);
    if (m?.length) flowUrls.push(...m);
  }

  const maxPagesRaw = Number(env.EVIDENCE_MAX_PAGES || 6);
  const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(2, Math.min(10, maxPagesRaw)) : 6;

  return withBrowser(async (browser) => {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
    });

    const pages: EvidencePage[] = [];
    const targets = uniq([startUrl, ...flowUrls]).slice(0, maxPages);

    // Nav crawl: grab up to (maxPages - targets.length) same-origin links from top nav on homepage.
    const remaining = Math.max(0, maxPages - targets.length);
    if (remaining > 0) {
      try {
        const p = await context.newPage();
        await p.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await p.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const extra = await p.evaluate(() => {
          const navLike = Array.from(
            document.querySelectorAll(
              "nav a[href], header a[href], [role='navigation'] a[href]",
            ),
          ) as HTMLAnchorElement[];
          return navLike
            .map((a) => ({ text: (a.textContent || "").trim(), href: a.getAttribute("href") || "" }))
            .filter((x) => x.text && x.href)
            .slice(0, 24);
        });
        await p.close().catch(() => {});
        const origin = new URL(startUrl).origin;
        const abs = extra
          .map((l: any) => toAbsUrl(startUrl, String(l.href || "")))
          .filter((u) => u && u.startsWith(origin));
        for (const u of abs) {
          if (targets.includes(u)) continue;
          if (targets.length >= maxPages) break;
          targets.push(u);
        }
      } catch (e) {
        warnings.push(`Nav crawl failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const url = targets[i]!;
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(800);
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.waitForTimeout(200);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
        await page.waitForTimeout(300);
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.waitForTimeout(250);

        const data = await page.evaluate(() => {
          const title = document.title || "";
          const metaDescription =
            document.querySelector("meta[name='description']")?.getAttribute("content") || "";
          const take = (sel: string, max: number) =>
            Array.from(document.querySelectorAll(sel))
              .map((n) => (n.textContent || "").trim())
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

          const ctaLike = Array.from(
            document.querySelectorAll(
              "a[href], button, [role='button'], input[type='submit'], input[type='button']",
            ),
          ) as HTMLElement[];
          const primaryCtas = ctaLike
            .map((el) => {
              const tag = el.tagName.toLowerCase();
              const text =
                (el.textContent || (el as HTMLInputElement).value || "").trim();
              const href =
                tag === "a" ? (el as HTMLAnchorElement).getAttribute("href") || "" : "";
              return { text, href, tag };
            })
            .filter((x) => x.text && x.text.length <= 40)
            .filter((x) => {
              const t = x.text.toLowerCase();
              return (
                t.includes("contact") ||
                t.includes("talk") ||
                t.includes("book") ||
                t.includes("get started") ||
                t.includes("start") ||
                t.includes("pricing") ||
                t.includes("request")
              );
            })
            .slice(0, 10);

          const mainText =
            (document.querySelector("main")?.textContent ||
              document.body?.textContent ||
              "") + "";

          return { title, metaDescription, h1: take("h1", 6), h2: take("h2", 10), h3: take("h3", 10), topNavLinks, primaryCtas, mainText };
        });

        const desktopBuf = await page.screenshot({ fullPage: false });
        const desktopUrl = await uploadScreenshot(env, reportId, `page_${i + 1}_desktop.png`, desktopBuf);

        // Mobile viewport screenshot
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(250);
        const mobileBuf = await page.screenshot({ fullPage: false });
        const mobileUrl = await uploadScreenshot(env, reportId, `page_${i + 1}_mobile.png`, mobileBuf);

        const entry: EvidencePage = {
          url,
          title: safeText(data.title),
          metaDescription: safeText(data.metaDescription),
          h1: (data.h1 || []).map(safeText).filter(Boolean),
          h2: (data.h2 || []).map(safeText).filter(Boolean),
          h3: (data.h3 || []).map(safeText).filter(Boolean),
          topNavLinks: (data.topNavLinks || [])
            .map((l: any) => ({ text: safeText(l.text), href: safeText(l.href) }))
            .filter((l) => l.text && l.href)
            .slice(0, 12),
          primaryCtas: (data.primaryCtas || [])
            .map((l: any) => ({ text: safeText(l.text), href: safeText(l.href) }))
            .filter((l) => l.text)
            .slice(0, 10),
          textSnippet: truncate(String(data.mainText || "")),
          screenshots: { desktop: desktopUrl, mobile: mobileUrl },
        };
        pages.push(entry);
      } catch (e) {
        warnings.push(`Failed to capture ${url}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }

    await context.close();
    return { pages, warnings } satisfies EvidenceBundle;
  });
}
