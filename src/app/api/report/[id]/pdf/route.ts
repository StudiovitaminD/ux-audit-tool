import chromium from "@sparticuz/chromium";
import { chromium as pwChromium, type Page } from "playwright-core";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createElement } from "react";
import { asString, buildReportViewModel } from "@/lib/report-model";
import { loadStoredReport } from "@/lib/report-record";
import { PrintReport } from "@/components/report/print-report";

export const runtime = "nodejs";
export const maxDuration = 300;

function fileNameFrom(value: string) {
  return value.replace(/[^\w\- ]+/g, "").trim().slice(0, 64) || "ux-audit-report";
}

function baseUrlFrom(req: Request) {
  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host") || url.host;
  const protocol = forwardedProto || url.protocol.replace(/:$/, "");
  return `${protocol}://${host}`;
}

async function getLayoutStylesheetHref(baseUrl: string) {
  const candidates = [
    join(process.cwd(), ".next", "app-build-manifest.json"),
    join(process.cwd(), "workspace", "app", ".next", "app-build-manifest.json"),
  ];

  for (const candidate of candidates) {
    try {
      const manifest = JSON.parse(await readFile(candidate, "utf8")) as {
        pages?: Record<string, string[]>;
      };
      const layoutFiles = manifest.pages?.["/layout"] || [];
      const cssFile = layoutFiles.find((file) => file.startsWith("static/css/"));
      if (cssFile) return `${baseUrl}/_next/${cssFile}`;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

async function prepareBrowserPage(page: Page) {
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType === "media" || resourceType === "websocket") {
      return route.abort();
    }
    return route.continue();
  });
}

async function captureLocator(locator: ReturnType<Page["locator"]>, label: string) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.page().waitForTimeout(350).catch(() => {});

  const box = await locator.boundingBox();
  if (!box || box.width < 40 || box.height < 40) {
    throw new Error(`Unable to measure ${label}`);
  }

  const image = await locator.screenshot({
    type: "png",
    scale: "css",
  });

  return {
    src: `data:image/png;base64,${image.toString("base64")}`,
    widthPx: Math.ceil(box.width),
    heightPx: Math.ceil(box.height),
  };
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  let browser: Awaited<ReturnType<typeof pwChromium.launch>> | null = null;

  try {
    const id = params.id;
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

    const loaded = await loadStoredReport(id);
    if (!loaded) return Response.json({ error: "Not found" }, { status: 404 });

    const vm = buildReportViewModel(loaded.report);
    const filename = `${fileNameFrom(asString(vm.productName) || "ux-audit-report")}.pdf`;
    const { renderToStaticMarkup } = await import("react-dom/server");

    const executablePath = await chromium.executablePath();
    browser = await pwChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const livePage = await browser.newPage({
      viewport: { width: 1440, height: 1800 },
      deviceScaleFactor: 2,
    });

    const stylesheetHref = await getLayoutStylesheetHref(baseUrlFrom(req));
    const reportMarkup = renderToStaticMarkup(createElement(PrintReport, { report: loaded.report }));
    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          ${stylesheetHref ? `<link rel="stylesheet" href="${stylesheetHref}" />` : ""}
          <style>
            *, *::before, *::after { animation: none !important; transition: none !important; }
            html { scroll-behavior: auto !important; }
            body { background: #ffffff !important; padding: 0 !important; margin: 0 !important; }
            header, nav, footer, .nav, .navbar, .navigation, .siteFooter, .skipLink,
            [role="navigation"], [data-report-toolbar], [data-report-pagination],
            [data-report-pagination-controls], .no-print {
              display: none !important;
              visibility: hidden !important;
              opacity: 0 !important;
              width: 0 !important;
              height: 0 !important;
              min-height: 0 !important;
              max-height: 0 !important;
              overflow: hidden !important;
              pointer-events: none !important;
              position: static !important;
            }
            [data-report-live-root] { padding: 24px !important; }
            [data-report-live-canvas] { margin-top: 0 !important; }
            [data-report-live-page], [data-report-live-page] * {
              overflow: visible !important;
              max-height: none !important;
              content-visibility: visible !important;
              contain: none !important;
              animation: none !important;
              transition: none !important;
            }
          </style>
        </head>
        <body>${reportMarkup}</body>
      </html>`;

    await livePage.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await livePage.emulateMedia({ media: "print" }).catch(() => undefined);
    await livePage.waitForTimeout(1500).catch(() => undefined);

    const buffer = await livePage.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await livePage.close().catch(() => {});

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF generation failed";
    return Response.json({ error: `PDF generation failed: ${message}` }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
