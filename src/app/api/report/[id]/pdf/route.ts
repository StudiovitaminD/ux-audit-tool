import chromium from "@sparticuz/chromium";
import { chromium as pwChromium, type Page } from "playwright-core";
import { asRecord, asString } from "@/lib/report-model";
import {
  deleteReportExportOverride,
  storeReportExportOverride,
} from "@/lib/report-export-overrides";
import { loadStoredReport } from "@/lib/report-record";

export const runtime = "nodejs";
export const maxDuration = 300;

const PRINT_VIEWPORT = {
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

async function readReportOverride(req: Request) {
  if (req.method !== "POST") return null;
  try {
    const raw = (await req.json().catch(() => null)) as { report?: unknown } | null;
    if (!raw || raw.report === undefined) return null;
    return raw.report;
  } catch {
    return null;
  }
}

async function generatePdf(req: Request, { params }: { params: { id: string } }) {
  let browser: Awaited<ReturnType<typeof pwChromium.launch>> | null = null;
  let overrideToken: string | null = null;

  try {
    const id = params.id;
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

    const reportOverride = await readReportOverride(req);
    const loaded = reportOverride ? null : await loadStoredReport(id);
    if (!reportOverride && !loaded) return Response.json({ error: "Not found" }, { status: 404 });

    const reportRecord = asRecord(reportOverride ?? loaded?.report) ?? {};
    const filename = `${fileNameFrom(asString(reportRecord.product_name) || asString(reportRecord.productName) || "ux-audit-report")}.pdf`;

    const executablePath = await chromium.executablePath();
    browser = await pwChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });

    const livePage = await browser.newPage({
      viewport: { ...PRINT_VIEWPORT },
      deviceScaleFactor: 2,
    });
    await prepareBrowserPage(livePage);

    const printUrl = new URL(`/report/${encodeURIComponent(id)}/print`, new URL(req.url).origin);
    if (reportOverride) {
      overrideToken = await storeReportExportOverride(reportOverride);
      printUrl.searchParams.set("token", overrideToken);
    }

    await livePage.goto(printUrl.toString(), { waitUntil: "load", timeout: 120_000 });
    await livePage.waitForSelector('[data-report-print-ready="true"]', { timeout: 120_000 });
    await livePage.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
    await livePage.emulateMedia({ media: "print" });
    await livePage.waitForTimeout(250).catch(() => undefined);

    const pdfBuffer = await livePage.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    await livePage.close().catch(() => {});

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
    if (overrideToken) {
      await deleteReportExportOverride(overrideToken);
    }
  }
}

export async function GET(req: Request, ctx: { params: { id: string } }) {
  return generatePdf(req, ctx);
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  return generatePdf(req, ctx);
}
