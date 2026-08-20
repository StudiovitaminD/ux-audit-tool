import chromium from "@sparticuz/chromium";
import { Document as PdfDocument, Image, Page as PdfPage, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { chromium as pwChromium, type Page } from "playwright-core";
import { createElement } from "react";
import { asRecord, asString } from "@/lib/report-model";
import { loadStoredReport } from "@/lib/report-record";

export const runtime = "nodejs";
export const maxDuration = 300;

type CapturedPageImage = {
  src: string;
  widthPx: number;
  heightPx: number;
};

const pdfStyles = StyleSheet.create({
  page: {
    position: "relative",
    backgroundColor: "#ffffff",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
});

const A4_VIEWPORT = {
  width: 794,
  height: 1123,
} as const;

function fileNameFrom(value: string) {
  return value.replace(/[^\w\- ]+/g, "").trim().slice(0, 64) || "ux-audit-report";
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

async function captureReportPage(locator: ReturnType<Page["locator"]>, label: string): Promise<CapturedPageImage> {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  await locator.page().waitForTimeout(250).catch(() => {});

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

function buildPdfDocument(title: string, pages: CapturedPageImage[]) {
  return createElement(
    PdfDocument,
    { title, producer: "react-pdf", creator: "ux-audit-tool" },
    ...pages.map((page, index) =>
      createElement(
        PdfPage,
        {
          key: `page-${index + 1}`,
          size: "A4",
          style: pdfStyles.page,
        },
        createElement(Image, {
          src: page.src,
          style: pdfStyles.image,
        }),
      ),
    ),
  );
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let browser: Awaited<ReturnType<typeof pwChromium.launch>> | null = null;

  try {
    const id = params.id;
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

    const loaded = await loadStoredReport(id);
    if (!loaded) return Response.json({ error: "Not found" }, { status: 404 });

    const reportRecord = asRecord(loaded.report) ?? {};
    const filename = `${fileNameFrom(asString(reportRecord.product_name) || asString(reportRecord.productName) || "ux-audit-report")}.pdf`;

    const executablePath = await chromium.executablePath();
    browser = await pwChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const livePage = await browser.newPage({
      viewport: { ...A4_VIEWPORT },
      deviceScaleFactor: 1,
    });
    await prepareBrowserPage(livePage);

    const printUrl = new URL(`/report/${encodeURIComponent(id)}/print`, new URL(req.url).origin).toString();
    await livePage.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await livePage.waitForSelector('[data-report-print-ready="true"]', { timeout: 120_000 });
    await livePage.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
    await livePage.waitForTimeout(250).catch(() => undefined);

    const reportPages = livePage.locator(".print-page");
    const pageCount = await reportPages.count();
    if (!pageCount) {
      throw new Error("No report pages were rendered");
    }

    const capturedPages: CapturedPageImage[] = [];
    for (let index = 0; index < pageCount; index += 1) {
      const pageLocator = reportPages.nth(index);
      capturedPages.push(await captureReportPage(pageLocator, `report page ${index + 1}`));
    }

    await livePage.close().catch(() => {});

    const pdfBuffer = await renderToBuffer(buildPdfDocument(filename, capturedPages));

    return new Response(new Uint8Array(pdfBuffer), {
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
