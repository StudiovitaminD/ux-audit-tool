import { asArray, asRecord, asString, buildReportViewModel, type AnyRecord } from "@/lib/report-model";
import { loadStoredReport } from "@/lib/report-record";
import { QUESTION_BANK } from "@/lib/question-bank";

export const runtime = "nodejs";
export const maxDuration = 300;

type PptxSlideLike = {
  background?: { color: string };
  addText: (text: string, opts: Record<string, unknown>) => void;
  addShape: (shape: string, opts: Record<string, unknown>) => void;
};

type PptxLike = {
  layout: string;
  author: string;
  subject?: string;
  title?: string;
  company?: string;
  ShapeType: Record<string, string>;
  addSlide: () => PptxSlideLike;
  write: (out: string) => Promise<unknown>;
};

const BG = "F7F3EA";
const CARD = "FFFFFF";
const TEXT = "202026";
const MUTED = "676774";
const LINE = "202026";
const SOFT_LINE = "DDD6CA";
const ACCENT = "10B981";
const WARNING = "B45309";

const page = {
  x: 0.55,
  y: 0.45,
  w: 12.25,
  h: 6.75,
};

function truncate(value: unknown, max = 220) {
  const text = asString(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatGeneratedDate(value: unknown) {
  const text = asString(value);
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function resolveExportReport(req: Request, id: string) {
  if (req.method === "POST") {
    const raw = (await req.json().catch(() => null)) as { report?: unknown } | null;
    const postedReport = asRecord(raw?.report);
    if (postedReport) {
      return postedReport;
    }
  }

  const loaded = await loadStoredReport(id);
  if (!loaded) return null;
  return asRecord(loaded.report);
}

function list(value: unknown, limit = 8) {
  if (Array.isArray(value)) return value.map((item) => truncate(item, 260)).filter(Boolean).slice(0, limit);
  if (typeof value === "string") {
    return value
      .split(/\n|•/)
      .map((item) => truncate(item, 260))
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
}

function recordText(item: unknown) {
  if (typeof item === "string") return truncate(item, 260);
  const rec = asRecord(item) ?? {};
  return (
    truncate(rec.recommendation, 260) ||
    truncate(rec.finding, 260) ||
    truncate(rec.what_we_found, 260) ||
    truncate(rec.observation, 260) ||
    truncate(rec.question, 260) ||
    truncate(rec.evidence, 260)
  );
}

function chunk<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function addHeader(slide: PptxSlideLike, title: string, subtitle?: string) {
  slide.background = { color: BG };
  slide.addText(title, {
    x: page.x,
    y: 0.35,
    w: page.w,
    h: 0.35,
    color: TEXT,
    fontFace: "Aptos Display",
    fontSize: 19,
    bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: page.x,
      y: 0.76,
      w: page.w,
      h: 0.26,
      color: MUTED,
      fontFace: "Aptos",
      fontSize: 9.5,
    });
  }
}

function addFooter(slide: PptxSlideLike, reportId: string) {
  slide.addText(`UX Audit Report • ${reportId}`, {
    x: page.x,
    y: 7.05,
    w: page.w,
    h: 0.24,
    color: MUTED,
    fontFace: "Aptos",
    fontSize: 8.5,
    align: "right",
  });
}

function addCard(
  slide: PptxSlideLike,
  pptx: PptxLike,
  args: { x: number; y: number; w: number; h: number; title?: string; text?: string; fill?: string; line?: string },
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: args.x,
    y: args.y,
    w: args.w,
    h: args.h,
    rectRadius: 0.09,
    fill: { color: args.fill ?? CARD },
    line: { color: args.line ?? LINE, width: 1 },
  });
  if (args.title) {
    slide.addText(args.title, {
      x: args.x + 0.18,
      y: args.y + 0.14,
      w: args.w - 0.36,
      h: 0.22,
      color: TEXT,
      fontFace: "Aptos",
      fontSize: 9.5,
      bold: true,
    });
  }
  if (args.text) {
    slide.addText(args.text, {
      x: args.x + 0.18,
      y: args.y + (args.title ? 0.46 : 0.18),
      w: args.w - 0.36,
      h: args.h - (args.title ? 0.58 : 0.3),
      color: MUTED,
      fontFace: "Aptos",
      fontSize: 9,
      valign: "top",
      breakLine: false,
      fit: "shrink",
    });
  }
}

function addMetricCard(
  slide: PptxSlideLike,
  pptx: PptxLike,
  args: { x: number; y: number; w: number; label: string; value: string; color?: string },
) {
  addCard(slide, pptx, { x: args.x, y: args.y, w: args.w, h: 0.95, line: SOFT_LINE });
  slide.addText(args.label, {
    x: args.x + 0.18,
    y: args.y + 0.15,
    w: args.w - 0.36,
    h: 0.2,
    color: MUTED,
    fontFace: "Aptos",
    fontSize: 8.5,
  });
  slide.addText(args.value || "—", {
    x: args.x + 0.18,
    y: args.y + 0.4,
    w: args.w - 0.36,
    h: 0.35,
    color: args.color ?? TEXT,
    fontFace: "Aptos Display",
    fontSize: 19,
    bold: true,
    fit: "shrink",
  });
}

function addPill(
  slide: PptxSlideLike,
  pptx: PptxLike,
  args: {
    x: number;
    y: number;
    w: number;
    text: string;
    fill?: string;
    line?: string;
    color?: string;
    align?: "left" | "center" | "right";
  },
) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x: args.x,
    y: args.y,
    w: args.w,
    h: 0.28,
    rectRadius: 0.12,
    fill: { color: args.fill ?? "F6F8FA" },
    line: { color: args.line ?? SOFT_LINE, width: 0.6 },
  });
  slide.addText(args.text, {
    x: args.x + 0.08,
    y: args.y + 0.055,
    w: args.w - 0.16,
    h: 0.16,
    color: args.color ?? MUTED,
    fontFace: "Aptos",
    fontSize: 7.6,
    bold: true,
    align: args.align ?? "center",
    fit: "shrink",
  });
}

function addSectionSlide(
  pptx: PptxLike,
  reportId: string,
  title: string,
  subtitle: string | undefined,
  render: (slide: PptxSlideLike) => void,
) {
  const slide = pptx.addSlide();
  addHeader(slide, title, subtitle);
  render(slide);
  addFooter(slide, reportId);
}

function quickWinRows(report: AnyRecord, executiveSummary: AnyRecord) {
  const executive = list(executiveSummary.quick_wins, 10);
  if (executive.length) return executive;

  const quickWinsTable = asArray(report.quick_wins_table).map(recordText).filter(Boolean);
  if (quickWinsTable.length) return quickWinsTable.slice(0, 10);

  return asArray(report.quick_wins).map(recordText).filter(Boolean).slice(0, 10);
}

function narrativePoints(value: unknown, limit = 8) {
  const text = asString(value);
  if (!text) return [];

  const normalized = text
    .replace(/\s+(What is working:|Main issues:|What to fix next:)/g, "\n$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  return normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      if (
        item.startsWith("What is working:") ||
        item.startsWith("Main issues:") ||
        item.startsWith("What to fix next:")
      ) {
        return item
          .split(/(?<=\.)\s+(?=[A-Z][a-z]+(?:\s*&\s*[A-Z][a-z]+)?\s*:)/g)
          .map((part) => part.trim())
          .filter(Boolean);
      }
      return [item];
    })
    .slice(0, limit);
}

function lookupQuestionOptions(bucketName: string, questionId: string) {
  const byBucket = QUESTION_BANK[bucketName] || [];
  const exact = byBucket.find((item) => item.id === questionId);
  if (exact?.options?.length) return exact.options;

  for (const questions of Object.values(QUESTION_BANK)) {
    const found = questions.find((item) => item.id === questionId);
    if (found?.options?.length) return found.options;
  }

  return [];
}

function withoutCompetitorMedia(competitor: AnyRecord): AnyRecord {
  const sanitized = { ...competitor };
  delete sanitized.screenshot;
  delete sanitized.screenshot_url;
  delete sanitized.screenshotUrl;
  delete sanitized.image;
  delete sanitized.image_url;
  delete sanitized.imageUrl;
  delete sanitized.media;
  return sanitized;
}

function addTableRows(
  slide: PptxSlideLike,
  pptx: PptxLike,
  args: {
    x: number;
    y: number;
    w: number;
    rowH: number;
    headers: string[];
    rows: string[][];
    colW: number[];
  },
) {
  const headerText = args.headers.join("   ");
  slide.addText(headerText, {
    x: args.x,
    y: args.y,
    w: args.w,
    h: 0.25,
    color: TEXT,
    fontFace: "Aptos",
    fontSize: 8.2,
    bold: true,
    fit: "shrink",
  });

  args.rows.forEach((row, rowIndex) => {
    const y = args.y + 0.35 + rowIndex * args.rowH;
    slide.addShape(pptx.ShapeType.roundRect, {
      x: args.x - 0.06,
      y: y - 0.05,
      w: args.w + 0.12,
      h: args.rowH - 0.08,
      rectRadius: 0.03,
      fill: { color: rowIndex % 2 ? "FAF8F2" : CARD },
      line: { color: SOFT_LINE, width: 0.5 },
    });
    let x = args.x;
    row.forEach((cell, cellIndex) => {
      slide.addText(cell || "—", {
        x,
        y,
        w: args.colW[cellIndex] ?? 1,
        h: args.rowH - 0.15,
        color: MUTED,
        fontFace: "Aptos",
        fontSize: 7.3,
        valign: "top",
        fit: "shrink",
      });
      x += args.colW[cellIndex] ?? 1;
    });
  });
}

function overviewScoreRows(vm: ReturnType<typeof buildReportViewModel>) {
  const rows = [...(vm.scorecard.length ? vm.scorecard : vm.bucketResults)];
  return rows.sort((left, right) => {
    const leftPriority = asString(left.priority).toUpperCase();
    const rightPriority = asString(right.priority).toUpperCase();
    const priorityOrder = ["P1", "P2", "P3", "P4"];
    const leftRank = priorityOrder.indexOf(leftPriority);
    const rightRank = priorityOrder.indexOf(rightPriority);
    if (leftRank !== rightRank) {
      return (leftRank === -1 ? 99 : leftRank) - (rightRank === -1 ? 99 : rightRank);
    }

    const leftScore = Number(asString(left.score).replace(/[^\d.]/g, ""));
    const rightScore = Number(asString(right.score).replace(/[^\d.]/g, ""));
    if (!Number.isNaN(leftScore) && !Number.isNaN(rightScore) && leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    return asString(left.section || left.bucket_name || left.bucket || left.name).localeCompare(
      asString(right.section || right.bucket_name || right.bucket || right.name),
    );
  });
}

async function buildPptxResponse(req: Request, id: string) {
  try {
    const reportRecord = await resolveExportReport(req, id);
    if (!reportRecord) return Response.json({ error: "Missing report" }, { status: 500 });

    const mod = (await import("pptxgenjs")) as unknown as { default?: unknown };
    const PptxGenCtor = (mod.default ?? mod) as unknown as new () => PptxLike;
    const pptx = new PptxGenCtor();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "UX Audit Tool";
    pptx.company = "UX Audit Tool";
    pptx.subject = "UX Audit Report";
    pptx.title = `${asString(reportRecord.product_name) || "UX Audit"} Report`;

    const vm = buildReportViewModel({ ...reportRecord, reportId: id });
    const subtitle = [vm.productName, vm.productUrl].filter(Boolean).join(" — ");
    const findings = vm.findingsDetailed.filter((finding) => {
      const severity = asString(finding.severity).toLowerCase();
      return severity === "critical" || severity === "high";
    });
    const bucketAnswerSections = vm.bucketResults.filter(
      (bucket) => Array.isArray(bucket.questions) && bucket.questions.length,
    );
    const executiveSummary = asRecord(vm.executiveSummary) ?? {};

    addSectionSlide(pptx, id, "Overview", subtitle, (slide) => {
      addCard(slide, pptx, {
        x: 0.65,
        y: 1.1,
        w: 11.75,
        h: 1.85,
        title: vm.auditType === "Limited Coverage Report" ? "Evidence Coverage Report Details" : "UX Audit Report Details",
        text: [
          `Product type: ${vm.productType || vm.auditType || "—"}`,
          `URL: ${vm.productUrl || "—"}`,
          `Time: ${formatGeneratedDate(vm.generatedAt)}`,
          `Reason: ${truncate(vm.auditReason || "—", 240)}`,
        ].join("\n"),
        line: LINE,
      });

      addCard(slide, pptx, {
        x: 0.65,
        y: 3.15,
        w: 11.75,
        h: 1.15,
        title: "Overall Score",
        line: LINE,
      });
      slide.addText(vm.overallScore === null ? "—/100" : `${vm.overallScore}/100`, {
        x: 0.9,
        y: 3.64,
        w: 1.5,
        h: 0.35,
        color: TEXT,
        fontFace: "Aptos Display",
        fontSize: 24,
        bold: true,
        fit: "shrink",
      });
      slide.addText(`Experiences: ${vm.overallHealth || "—"}`, {
        x: 1.95,
        y: 3.66,
        w: 2.2,
        h: 0.18,
        color: TEXT,
        fontFace: "Aptos",
        fontSize: 9.5,
        bold: true,
      });
      slide.addText("Business Metrics", {
        x: 1.95,
        y: 3.87,
        w: 1.6,
        h: 0.16,
        color: TEXT,
        fontFace: "Aptos",
        fontSize: 8.5,
        bold: true,
      });
      slide.addText("Conversion Rate • Drop-off Rate • Task Completion Rate • Customer Satisfaction", {
        x: 1.95,
        y: 4.01,
        w: 4.7,
        h: 0.25,
        color: MUTED,
        fontFace: "Aptos",
        fontSize: 7.7,
      });
      if (vm.isLimitedCoverage || vm.isScoringUnavailable) {
        addCard(slide, pptx, {
          x: 5.2,
          y: 3.42,
          w: 7.0,
          h: 0.55,
          text: vm.isLimitedCoverage
            ? "UX score was not calculated because the required product screens were not captured."
            : "UX score was not calculated because scoring could not be completed from the captured evidence.",
          fill: "FFF7ED",
          line: "FED7AA",
        });
      }

      Object.entries(vm.pillarScores).forEach(([name, value], index) => {
        addCard(slide, pptx, {
          x: 0.65 + index * 3.95,
          y: 4.55,
          w: 3.55,
          h: 0.9,
          title: `${name} Score`,
          text: value.score === null ? "—/100" : `${value.score}/100`,
          line: LINE,
        });
      });

      const scorecard = overviewScoreRows(vm).slice(0, 8).map((item) => {
        const row = asRecord(item) ?? {};
        return [
          truncate(row.section || row.bucket_name || row.bucket || row.name, 48),
          asString(row.priority) || "—",
          asString(row.score) || "—",
          asString(row.health) || "—",
          asString(row.risk_level || row.risk) || "—",
        ];
      });
      addCard(slide, pptx, {
        x: 0.65,
        y: 5.65,
        w: 11.75,
        h: 1.1,
        title: "Score Card",
        line: LINE,
      });
      addTableRows(slide, pptx, {
        x: 0.9,
        y: 6.0,
        w: 11.15,
        rowH: 0.26,
        headers: ["Bucket", "Priority", "Score", "Health", "Risk"],
        colW: [4.0, 1.05, 1.05, 1.65, 1.7],
        rows: scorecard,
      });
    });

    addSectionSlide(pptx, id, "Summary", subtitle, (slide) => {
      const narratives = [
        ["Delight", vm.sectionNarrative.delight_narrative],
        ["Impact", vm.sectionNarrative.impact_narrative],
        ["Accessibility", vm.sectionNarrative.accessibility_narrative],
      ];
      narratives.forEach(([title, text], index) => {
        addCard(slide, pptx, {
          x: 0.65 + index * 4.05,
          y: 1.25,
          w: 3.75,
          h: 5.2,
          title,
          text: narrativePoints(text, 8).map((item) => `• ${item}`).join("\n"),
          line: SOFT_LINE,
        });
      });
    });

    const pptCompetitors = vm.competitorAnalysis.competitors
      .slice(0, 3)
      .map((competitor) => withoutCompetitorMedia(competitor));

    addSectionSlide(pptx, id, "Competitor Analysis", subtitle, (slide) => {
      const competitors = pptCompetitors;
      if (!competitors.length) {
        addCard(slide, pptx, {
          x: 0.65,
          y: 1.25,
          w: 11.75,
          h: 5.2,
          title: "Competitors",
          text: "No competitor analysis captured.",
          line: SOFT_LINE,
        });
        return;
      }

      addTableRows(slide, pptx, {
        x: 0.75,
        y: 1.35,
        w: 11.45,
        rowH: 1.5,
        headers: ["Competitor", "Positioning", "Primary CTA"],
        colW: [2.1, 6.05, 2.4],
        rows: competitors.map((competitor, index) => {
          const signals = asRecord(competitor.signals) ?? {};
          return [
            `${asString(competitor.name) || `Competitor ${index + 1}`}\n${truncate(competitor.url, 45)}`,
            truncate(competitor.positioning || signals.positioning, 260),
            truncate(competitor.primary_cta || signals.primary_cta, 90),
          ];
        }),
      });
    });

    pptCompetitors.forEach((competitor, index) => {
      addSectionSlide(pptx, id, `Competitor Detail — ${asString(competitor.name) || index + 1}`, subtitle, (slide) => {
        const signals = asRecord(competitor.signals) ?? {};
        const strengths = asArray(competitor.strengths).map(recordText).filter(Boolean).slice(0, 5);
        const gaps = asArray(competitor.gaps).map(recordText).filter(Boolean).slice(0, 5);
        const stealThis = asArray(competitor.steal_this).map(recordText).filter(Boolean).slice(0, 5);
        addCard(slide, pptx, {
          x: 0.65,
          y: 1.25,
          w: 3.75,
          h: 5.2,
          title: asString(competitor.name) || `Competitor ${index + 1}`,
          text: [
            truncate(competitor.url, 70),
            "",
            `Positioning: ${truncate(signals.positioning, 160) || "—"}`,
          ].join("\n"),
          line: SOFT_LINE,
        });
        addCard(slide, pptx, {
          x: 4.7,
          y: 1.25,
          w: 3.75,
          h: 5.2,
          title: "Strengths / Gaps",
          text: ["Strengths:", ...strengths.map((item) => `• ${item}`), "", "Gaps:", ...gaps.map((item) => `• ${item}`)].join("\n"),
          line: SOFT_LINE,
        });
        addCard(slide, pptx, {
          x: 8.65,
          y: 1.25,
          w: 3.75,
          h: 5.2,
          title: "Steal This",
          text: stealThis.map((item) => `• ${item}`).join("\n"),
          line: SOFT_LINE,
        });
      });
    });

    bucketAnswerSections.forEach((bucket) => {
      const bucketRec = asRecord(bucket) ?? {};
      const questions = asArray(bucketRec.questions);
      chunk(questions, 3).forEach((questionChunk, questionPageIndex) => {
        addSectionSlide(
          pptx,
          id,
          "AI Bucket Answers",
          `${asString(bucketRec.bucket_name) || asString(bucketRec.section) || "Bucket"} • ${questionPageIndex + 1}`,
          (slide) => {
            const scoreLine = [
              asString(bucketRec.pillar),
              asString(bucketRec.priority),
              asString(bucketRec.score) ? `${asString(bucketRec.score)}/100` : "",
            ].filter(Boolean).join(" • ");
            addCard(slide, pptx, {
              x: 0.65,
              y: 1.15,
              w: 11.75,
              h: 0.62,
              title: asString(bucketRec.bucket_name) || asString(bucketRec.section) || "Bucket",
              text: scoreLine,
              line: SOFT_LINE,
            });
            questionChunk.forEach((question, questionIndex) => {
              const q = asRecord(question) ?? {};
              const bucketName =
                asString(bucketRec.bucket_name) || asString(bucketRec.section) || asString(bucketRec.bucket);
              const questionId = asString(q.id);
              const answerStatus = asString(q.answer_status);
              const isInsufficient = answerStatus === "insufficient_evidence";
              const isScoringUnavailable = answerStatus === "scoring_unavailable";
              const isNotScored = isInsufficient || isScoringUnavailable;
              const selectedOption = asString(q.selected_option) || asString(q.mark);
              const selectedMark = asString(q.mark || q.selected_option);
              const answerText =
                lookupQuestionOptions(bucketName, questionId).find(
                  (option) =>
                    String(option.mark) === selectedOption || String(option.mark) === selectedMark,
                )?.text || "";
              const y = 1.95 + questionIndex * 1.58;
              addCard(slide, pptx, {
                x: 0.65,
                y,
                w: 11.75,
                h: 1.42,
                title: `${questionPageIndex * 3 + questionIndex + 1}. ${truncate(q.question, 145)}`,
                text: [
                  isInsufficient
                    ? "Status: Insufficient evidence\nScore: Not scored\nSelected option: None"
                    : isScoringUnavailable
                      ? "Status: Scoring unavailable\nScore: Not scored\nSelected option: None"
                    : answerText
                      ? `Selected answer: ${truncate(answerText, 185)}`
                      : "",
                  !isNotScored && asString(q.evidence)
                    ? `Evidence: ${truncate(q.evidence, 170)}`
                    : "",
                  `Observation: ${truncate(q.observation, 170)}`,
                ].filter(Boolean).join("\n"),
                line: SOFT_LINE,
              });
              addPill(slide, pptx, {
                x: 0.92,
                y: y + 0.42,
                w: 6.6,
                text: isInsufficient
                  ? "Status: Insufficient evidence"
                  : isScoringUnavailable
                    ? "Status: Scoring unavailable"
                  : answerText
                  ? `Selected answer: ${answerText}`
                  : `Answer: ${asString(q.selected_option) || asString(q.mark) || "—"}`,
                fill: "FFF7ED",
                line: "FED7AA",
                color: "9A3412",
                align: "left",
              });
              addPill(slide, pptx, {
                x: 7.72,
                y: y + 0.42,
                w: 1.05,
                text: `Score: ${isInsufficient ? "—" : asString(q.mark) || "—"}`,
                fill: "F6F8FA",
                line: SOFT_LINE,
              });
            });
          },
        );
      });
    });

    chunk(findings, 2).forEach((findingChunk, index) => {
      addSectionSlide(pptx, id, "Critical Findings", `${subtitle}${findings.length > 4 ? ` • ${index + 1}` : ""}`, (slide) => {
        findingChunk.forEach((finding, findingIndex) => {
          const criteria = asArray(finding.acceptance_criteria).map(recordText).filter(Boolean).slice(0, 4);
          addCard(slide, pptx, {
            x: 0.65,
            y: 1.25 + findingIndex * 2.65,
            w: 11.75,
            h: 2.4,
            title: `${index * 2 + findingIndex + 1}. ${asString(finding.bucket)} — ${asString(finding.severity)}`,
            text: [
              `What we found: ${truncate(finding.what_we_found || finding.question, 300)}`,
              `Why it matters: ${truncate(finding.why_it_matters || finding.observation, 300)}`,
              `Recommendation: ${truncate(finding.recommendation, 300)}`,
              criteria.length ? `Acceptance criteria: ${criteria.map((item) => `• ${item}`).join(" ")}` : "",
            ].join("\n"),
            line: LINE,
          });
        });
      });
    });

    const quickWinsTable = vm.quickWinsTable;
    chunk(quickWinsTable, 5).forEach((rows, pageIndex) => {
      addSectionSlide(pptx, id, "Quick Wins Table", `${subtitle}${quickWinsTable.length > 5 ? ` • ${pageIndex + 1}` : ""}`, (slide) => {
        addTableRows(slide, pptx, {
          x: 0.75,
          y: 1.25,
          w: 11.45,
          rowH: 0.9,
          headers: ["Finding", "Recommendation", "ETA"],
          colW: [4.0, 6.0, 1.45],
          rows: rows.map((item) => [
            truncate(item.finding, 165),
            truncate(item.recommendation, 230),
            truncate(item.estimated_time, 50),
          ]),
        });
      });
    });

    addSectionSlide(pptx, id, "Quick Wins & Roadmap", subtitle, (slide) => {
      addCard(slide, pptx, {
        x: 0.65,
        y: 1.25,
        w: 11.75,
        h: 2.2,
        title: "Quick Wins Table",
        text: quickWinRows(reportRecord, executiveSummary).slice(0, 6).map((item) => `• ${item}`).join("\n"),
        line: SOFT_LINE,
      });
      addCard(slide, pptx, {
        x: 0.65,
        y: 3.7,
        w: 3.7,
        h: 1.55,
        title: "Week 1–2",
        text: vm.roadmap.week_1_2.slice(0, 4).map((item) => `• ${truncate(item, 140)}`).join("\n"),
        line: SOFT_LINE,
      });
      addCard(slide, pptx, {
        x: 4.68,
        y: 3.7,
        w: 3.7,
        h: 1.55,
        title: "Month 1",
        text: vm.roadmap.month_1.slice(0, 4).map((item) => `• ${truncate(item, 140)}`).join("\n"),
        line: SOFT_LINE,
      });
      addCard(slide, pptx, {
        x: 8.7,
        y: 3.7,
        w: 3.7,
        h: 1.6,
        title: "Quarter 1",
        text: vm.roadmap.quarter_1.slice(0, 4).map((item) => `• ${truncate(item, 140)}`).join("\n"),
        line: SOFT_LINE,
      });
      if (vm.closingNote) {
        addCard(slide, pptx, {
          x: 0.65,
          y: 5.45,
          w: 11.75,
          h: 1.0,
          title: "Closing note",
          text: truncate(vm.closingNote, 320),
          line: SOFT_LINE,
        });
      }
      addCard(slide, pptx, {
        x: 0.65,
        y: 6.5,
        w: 11.75,
        h: 0.95,
        title: "Disclaimer",
        text:
          "This report is based on an expert review using a structured UX Audit Framework. It provides an indicative assessment of the user experience with an estimated 70% accuracy level and is intended to guide design decisions.",
        line: SOFT_LINE,
      });
    });

    const buf = (await pptx.write("nodebuffer")) as unknown as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="ux-audit-report-${id}.pptx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PPTX export failed";
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  return buildPptxResponse(_req, id);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  return buildPptxResponse(req, id);
}
