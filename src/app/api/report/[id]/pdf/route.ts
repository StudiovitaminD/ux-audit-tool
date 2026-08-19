import chromium from "@sparticuz/chromium";
import { Document as PdfDocument, Image, Page as PdfPage, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { chromium as pwChromium, type Page } from "playwright-core";
import { createElement } from "react";
import { asArray, asNumber, asRecord, asString, stringifyValue } from "@/lib/report-model";
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
    scale: "device",
  });

  return {
    src: `data:image/png;base64,${image.toString("base64")}`,
    widthPx: Math.ceil(box.width),
    heightPx: Math.ceil(box.height),
  };
}

function escapeHtml(value: unknown) {
  return asString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function listItems(value: unknown, limit = 6) {
  const items = asArray(value)
    .map((item) => stringifyValue(item))
    .filter(Boolean);
  if (items.length) return items.slice(0, limit);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
}

function bucketNameFromRow(row: Record<string, unknown>) {
  return (
    asString(row.section) ||
    asString(row.bucket_name) ||
    asString(row.bucket) ||
    asString(row.name) ||
    "Bucket"
  );
}

function scoreFromRow(row: Record<string, unknown>) {
  return asNumber(row.score);
}

function scoreLabel(score: number | null, fallback = "Not scored") {
  return score === null ? fallback : `${score}/100`;
}

function priorityRank(value: unknown) {
  const raw = asString(value).trim().toUpperCase();
  if (raw === "P1") return 1;
  if (raw === "P2") return 2;
  if (raw === "P3") return 3;
  if (raw === "P4") return 4;
  return 99;
}

function buildScoreRows(report: Record<string, unknown>) {
  const source = asArray(report.scorecard).length ? asArray(report.scorecard) : asArray(report.bucket_results);
  return source
    .map((item) => asRecord(item) ?? {})
    .filter((item) => Boolean(bucketNameFromRow(item)))
    .map((item) => {
      const score = scoreFromRow(item);
      const bucketStatus = asString(item.bucket_status).toLowerCase();
      const rawScore = asString(item.score);
      return {
        section: bucketNameFromRow(item),
        score: scoreLabel(
          bucketStatus === "insufficient_evidence" || bucketStatus === "scoring_unavailable"
            ? null
            : score,
          rawScore && rawScore.toLowerCase() !== "not scored" ? rawScore : "Not scored",
        ),
        scoreNumber: score,
        health:
          asString(item.health) ||
          (bucketStatus === "insufficient_evidence" || bucketStatus === "scoring_unavailable"
            ? "Not scored"
            : ""),
        risk:
          asString(item.risk_level) ||
          asString(item.risk) ||
          (bucketStatus === "scoring_unavailable"
            ? "Scoring unavailable"
            : bucketStatus === "insufficient_evidence"
              ? "Evidence missing"
              : ""),
        priority: asString(item.priority) || "P0",
        pillar: asString(item.pillar),
      };
    })
    .sort((left, right) => {
      const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
      if (byPriority !== 0) return byPriority;
      return (left.scoreNumber ?? 999) - (right.scoreNumber ?? 999);
    });
}

function buildSafePrintHtml(report: Record<string, unknown>) {
  const productName =
    asString(report.product_name) ||
    asString(report.productName) ||
    asString(asRecord(report.intake)?.product_name) ||
    "UX Audit Report";
  const productUrl =
    asString(report.product_url) ||
    asString(report.productUrl) ||
    asString(asRecord(report.intake)?.product_url) ||
    "";
  const generatedAt =
    asString(report.generated_at) ||
    asString(report.generatedAt) ||
    new Date().toISOString();
  const overallScore = asNumber(report.overall_score) ?? asNumber(report.overallScore);
  const overallHealth = asString(report.overall_health) || asString(report.overallHealth) || "Not scored";
  const overallRisk = asString(report.overall_risk) || asString(report.overallRisk) || "Not scored";
  const executive = asRecord(report.executive_summary) ?? asRecord(report.executiveSummary) ?? {};
  const roadmap = asRecord(report.roadmap) ?? {};
  const scoreRows = buildScoreRows(report).slice(0, 12);
  const topProblems = listItems(
    executive.top_3_problems ||
      executive.top_problems ||
      executive.main_issue ||
      report.top_3_problems ||
      report.top_problems,
    6,
  );
  const whatsWorking = listItems(
    executive.whats_working || executive.what_works || report.whats_working || report.what_works,
    6,
  );
  const quickWins = listItems(
    executive.top_3_quick_wins || executive.quick_wins || report.quick_wins || report.quick_wins_table,
    6,
  );
  const weekOneTwo = listItems(roadmap.week_1_2 || roadmap.phase_1_fix_now || roadmap.phase_1_sprint_1_2_weeks, 6);
  const monthOne = listItems(roadmap.month_1 || roadmap.phase_2_build_next || roadmap.phase_2_sprint_3_4_weeks, 6);
  const quarterOne = listItems(roadmap.quarter_1 || roadmap.phase_3_optimize_later || roadmap.phase_3_month_2, 6);
  const findings = listItems(
    report.findings_detailed || report.findings || report.all_findings || report.top_5_findings,
    6,
  );

  const scorecardRowsHtml = scoreRows.length
    ? scoreRows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.section)}</td>
              <td class="score">${escapeHtml(row.score)}</td>
              <td>${escapeHtml(row.health || "—")}</td>
              <td>${escapeHtml(row.risk || "—")}</td>
            </tr>`,
        )
        .join("")
    : `
      <tr>
        <td colspan="4" class="empty">No scorecard rows were available.</td>
      </tr>`;

  const listHtml = (items: string[]) =>
    items.length
      ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : `<li class="empty">No items captured.</li>`;

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          :root {
            --page-w: 794px;
            --page-h: 1123px;
            --orange: #fc6d27;
            --orange-soft: #fff1e9;
            --text: #111111;
            --muted: #63666f;
            --border: rgba(17,17,17,0.12);
            --surface: #ffffff;
            --soft: #f6f6f7;
          }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #ece9e3;
            color: var(--text);
            font-family: Arial, Helvetica, sans-serif;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
          }
          body { padding: 24px; }
          .safe-report-stage { width: var(--page-w); margin: 0 auto; }
          .safe-report-page {
            width: var(--page-w);
            height: var(--page-h);
            background: var(--surface);
            overflow: hidden;
            position: relative;
            page-break-after: always;
            box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
          }
          .safe-report-page:last-child { page-break-after: auto; }
          .page-inner {
            width: 100%;
            height: 100%;
            padding: 40px;
            display: flex;
            flex-direction: column;
          }
          .cover {
            background: var(--orange);
            color: #fff;
          }
          .cover .page-inner { justify-content: space-between; }
          .brand {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.02em;
          }
          .title {
            font-size: 54px;
            line-height: 1;
            font-weight: 800;
            max-width: 620px;
            margin: 0;
          }
          .subtitle {
            font-size: 18px;
            line-height: 1.5;
            margin-top: 16px;
            max-width: 600px;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            font-size: 14px;
            line-height: 1.4;
            opacity: 0.95;
            border-top: 1px solid rgba(255,255,255,0.24);
            padding-top: 12px;
          }
          .section-title {
            font-size: 24px;
            font-weight: 800;
            margin: 0 0 16px;
          }
          .muted { color: var(--muted); }
          .metrics {
            display: grid;
            grid-template-columns: 1.1fr 1fr 1fr;
            gap: 16px;
            margin-bottom: 18px;
          }
          .metric {
            background: var(--soft);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 16px;
          }
          .metric-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
            margin-bottom: 8px;
          }
          .metric-value {
            font-size: 28px;
            font-weight: 800;
            line-height: 1;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            min-height: 0;
          }
          .card {
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 16px;
            background: #fff;
          }
          .card h3 {
            margin: 0 0 12px;
            font-size: 16px;
          }
          ul { margin: 0; padding-left: 18px; }
          li { margin: 0 0 8px; line-height: 1.35; }
          .table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
          }
          .table th, .table td {
            text-align: left;
            padding: 10px 10px;
            border-bottom: 1px solid var(--border);
            vertical-align: top;
          }
          .table th {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
          }
          .table td.score {
            font-weight: 700;
            white-space: nowrap;
          }
          .stack {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }
          .pill {
            display: inline-flex;
            align-items: center;
            padding: 6px 10px;
            border-radius: 999px;
            background: var(--orange-soft);
            color: var(--text);
            font-size: 12px;
            font-weight: 700;
          }
          .empty { color: var(--muted); font-style: italic; }
        </style>
      </head>
      <body>
        <div class="safe-report-stage">
          <section class="safe-report-page cover">
            <div class="page-inner">
              <div class="brand">Studio Vitamin D</div>
              <div>
                <h1 class="title">${escapeHtml(productName)}</h1>
                <div class="subtitle">
                  UX audit report generated from captured product evidence and scored bucket data.
                </div>
              </div>
              <div class="meta-row">
                <div>${productUrl ? escapeHtml(productUrl) : "Product URL not provided"}</div>
                <div>${escapeHtml(generatedAt)}</div>
              </div>
            </div>
          </section>

          <section class="safe-report-page">
            <div class="page-inner">
              <h2 class="section-title">Overview</h2>
              <div class="metrics">
                <div class="metric">
                  <div class="metric-label">Overall Score</div>
                  <div class="metric-value">${overallScore === null ? "—/100" : `${overallScore}/100`}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Health</div>
                  <div class="metric-value" style="font-size:22px;">${escapeHtml(overallHealth || "Not scored")}</div>
                </div>
                <div class="metric">
                  <div class="metric-label">Risk</div>
                  <div class="metric-value" style="font-size:22px;">${escapeHtml(overallRisk || "Not scored")}</div>
                </div>
              </div>
              <div class="card" style="flex:1; min-height:0;">
                <h3>Scorecard</h3>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Score</th>
                      <th>Health</th>
                      <th>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${scorecardRowsHtml}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section class="safe-report-page">
            <div class="page-inner">
              <h2 class="section-title">Executive Summary</h2>
              <div class="stack">
                <div class="card">
                  <h3>What is working</h3>
                  <ul>${listHtml(whatsWorking)}</ul>
                </div>
                <div class="card">
                  <h3>Main problems</h3>
                  <ul>${listHtml(topProblems)}</ul>
                </div>
              </div>
              <div style="height:18px;"></div>
              <div class="grid-2">
                <div class="card">
                  <h3>Top quick wins</h3>
                  <ul>${listHtml(quickWins)}</ul>
                </div>
                <div class="card">
                  <h3>Relevant findings</h3>
                  <ul>${listHtml(findings)}</ul>
                </div>
              </div>
            </div>
          </section>

          <section class="safe-report-page">
            <div class="page-inner">
              <h2 class="section-title">Roadmap</h2>
              <div class="grid-2">
                <div class="card">
                  <h3>Week 1-2</h3>
                  <ul>${listHtml(weekOneTwo)}</ul>
                </div>
                <div class="card">
                  <h3>Month 1</h3>
                  <ul>${listHtml(monthOne)}</ul>
                </div>
              </div>
              <div style="height:18px;"></div>
              <div class="card">
                <h3>Quarter 1</h3>
                <ul>${listHtml(quarterOne)}</ul>
              </div>
            </div>
          </section>
        </div>
      </body>
    </html>`;
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

    const reportRecord = asRecord(loaded.report) ?? {};
    const filename = `${fileNameFrom(asString(reportRecord.product_name) || asString(reportRecord.productName) || "ux-audit-report")}.pdf`;

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

    const html = buildSafePrintHtml(reportRecord);

    await livePage.setContent(html, { waitUntil: "load", timeout: 120_000 });
    await livePage.waitForTimeout(500).catch(() => undefined);

    const reportPages = livePage.locator(".safe-report-page");
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
