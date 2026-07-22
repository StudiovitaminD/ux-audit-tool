import chromium from "@sparticuz/chromium";
import { chromium as pwChromium, type Page } from "playwright-core";
import { createElement, Fragment } from "react";
import { asString, buildReportViewModel } from "@/lib/report-model";
import { loadStoredReport } from "@/lib/report-record";

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

async function prepareBrowserPage(page: Page) {
  await page.route("**/*", (route) => {
    const resourceType = route.request().resourceType();
    if (resourceType === "media" || resourceType === "websocket") {
      return route.abort();
    }
    return route.continue();
  });
}

async function applyExportStyles(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
      html {
        scroll-behavior: auto !important;
      }
      header,
      nav,
      footer,
      .nav,
      .navbar,
      .navigation,
      .siteFooter,
      .skipLink,
      [role="navigation"],
      [data-report-toolbar],
      [data-report-pagination],
      [data-report-pagination-controls],
      .no-print {
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
      body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      [data-report-live-root] {
        padding: 24px !important;
      }
      [data-report-live-canvas] {
        margin-top: 0 !important;
      }
      [data-report-live-page],
      [data-report-live-page] * {
        overflow: visible !important;
        max-height: none !important;
        content-visibility: visible !important;
        contain: none !important;
        animation: none !important;
        transition: none !important;
      }
    `,
  }).catch(() => {});
}

async function waitForReport(page: Page) {
  await page.waitForSelector("[data-report-live-canvas]", {
    timeout: 120_000,
    state: "visible",
  });
  await page.waitForSelector("[data-report-live-page]", {
    timeout: 120_000,
    state: "visible",
  });
  await page.waitForFunction(
    () => {
      const root = document.querySelector("[data-report-live-canvas]");
      return !!root && Number(root.getAttribute("data-total-pages") || "0") > 0;
    },
    { timeout: 120_000 },
  );
  await page.waitForTimeout(600).catch(() => {});
}

type PageScreenshot = {
  src: string;
  widthPx: number;
  heightPx: number;
};

async function forceVisibleReportContent(page: Page) {
  await applyExportStyles(page);
  await page.evaluate(() => {
    document.querySelectorAll("[data-report-live-page] *").forEach((el) => {
      const node = el as HTMLElement;
      node.style.contentVisibility = "visible";
      node.style.contain = "none";
      node.style.animation = "none";
      node.style.transition = "none";
    });
    window.scrollTo(0, 0);
  }).catch(() => {});
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

async function captureReportPages(page: Page) {
  const pageCount = await page.evaluate(() => {
    const root = document.querySelector("[data-report-live-canvas]");
    return Number(root?.getAttribute("data-total-pages") || "0");
  });

  if (!pageCount || Number.isNaN(pageCount)) {
    throw new Error("Unable to determine report page count");
  }

  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000).catch(() => {});

  const capturedPages: PageScreenshot[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    await page.waitForFunction(
      (expectedPage) => {
        const root = document.querySelector("[data-report-live-canvas]");
        return Number(root?.getAttribute("data-current-page") || "0") === expectedPage;
      },
      index + 1,
      { timeout: 30_000 },
    );

    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(300).catch(() => {});

    await forceVisibleReportContent(page);

    const pageElement = page.locator("[data-report-live-page]").first();
    const pageTitle = await pageElement.getAttribute("data-report-page-title").catch(() => "");
    const shouldCaptureSections = pageTitle === "AI Bucket Answers";

    if (shouldCaptureSections) {
      const sectionCount = await page.locator("[data-report-live-page] [data-report-section]").count();
      for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex += 1) {
        const section = page.locator("[data-report-live-page] [data-report-section]").nth(sectionIndex);
        capturedPages.push(await captureLocator(section, `report section ${sectionIndex + 1}`));

        await page.waitForTimeout(300).catch(() => {});
      }
    } else {
      capturedPages.push(await captureLocator(pageElement, `report page ${index + 1}`));
    }

    if (index < pageCount - 1) {
      const nextPageIndex = index + 1;
      await page.evaluate((pageIdx) => {
        const winAny = window as { __setReportExportPage?: (pageIndex: number) => void };
        winAny.__setReportExportPage?.(pageIdx);
      }, nextPageIndex);
      await page.waitForFunction(
        (expectedPage) => {
          const root = document.querySelector("[data-report-live-canvas]");
          return Number(root?.getAttribute("data-current-page") || "0") === expectedPage;
        },
        nextPageIndex + 1,
        { timeout: 30_000 },
      );
      await page.waitForTimeout(500).catch(() => {});
      await forceVisibleReportContent(page);
    }
  }

  return { capturedPages, pageCount };
}

async function buildPdfBuffer(pages: PageScreenshot[]) {
  const { pdf, Document, Page: PdfPage, Image } = await import("@react-pdf/renderer");

  const pxToPt = (px: number) => px * 0.75;

  const doc = createElement(
    Document,
    null,
    createElement(
      Fragment,
      null,
      ...pages.map((pageData, index) => {
        const pageSize: [number, number] = [pxToPt(pageData.widthPx), pxToPt(pageData.heightPx)];
        return createElement(
          PdfPage,
          {
            key: `report-page-${index + 1}`,
            size: pageSize,
            style: { margin: 0, padding: 0, backgroundColor: "#ffffff" },
          },
          createElement(Image, {
            src: pageData.src,
            style: {
              width: pageSize[0],
              height: pageSize[1],
            },
          }),
        );
      }),
    ),
  );

  const instance = pdf(doc);
  const blob = await instance.toBlob();
  return blob.arrayBuffer();
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

    await prepareBrowserPage(livePage);
    const liveUrl = `${baseUrlFrom(req)}/report?rid=${encodeURIComponent(id)}&export=pdf`;
    await livePage.goto(liveUrl, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    await applyExportStyles(livePage);
    await waitForReport(livePage);
    await forceVisibleReportContent(livePage);

    const { capturedPages } = await captureReportPages(livePage);

    await livePage.close().catch(() => {});

    const buffer = await buildPdfBuffer(capturedPages);

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
