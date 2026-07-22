export type AnyRecord = Record<string, unknown>;

export type ReportViewModel = {
  reportId: string;
  generatedAt: string;
  productName: string;
  productUrl: string;
  productType: string;
  primaryPlatform: string;
  auditReason: string;
  screenshot: string;
  auditType: string;
  isLimitedCoverage: boolean;
  isScoringUnavailable: boolean;
  hasPartialScoring: boolean;
  overallScore: number | null;
  overallHealth: string;
  overallRisk: string;
  captureCoverage: {
    status: string;
    summary: string;
    loginPageCaptured: boolean;
    authenticatedDashboardCaptured: boolean;
    navigationCaptured: boolean;
    internalProductScreensCaptured: number;
    internalProductScreensTarget: number;
    formsCaptured: boolean;
    tablesCaptured: boolean;
    dropdownCaptured: boolean;
    errorEmptyLoadingCaptured: boolean;
    browserSessionUsed: boolean;
    guidedStepsAttempted: number;
    guidedStepsCompleted: number;
    questionsScoreable: number;
    questionsTotal: number;
    scoreEligible: boolean;
    failedStepReasons: string[];
    whatWasCaptured: string[];
    whatWasMissing: string[];
    suggestedNextSteps: string[];
  };
  pillarScores: Record<string, { score: number | null; evaluated: boolean }>;
  scorecard: AnyRecord[];
  bucketResults: AnyRecord[];
  executiveSummary: AnyRecord;
  sectionNarrative: {
    delight_narrative: string;
    impact_narrative: string;
    accessibility_narrative: string;
  };
  findingsDetailed: AnyRecord[];
  quickWinsTable: AnyRecord[];
  roadmap: {
    week_1_2: string[];
    month_1: string[];
    quarter_1: string[];
  };
  closingNote: string;
  competitorAnalysis: {
    competitors_count: number;
    competitors: AnyRecord[];
    matrix: { columns: string[]; rows: AnyRecord[] };
  };
};

export function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AnyRecord;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+(\.\d+)?/);
    if (match) return Number(match[0]);
  }
  return null;
}

export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyValue(item))
      .filter(Boolean)
      .join(" • ");
  }
  const rec = asRecord(value);
  if (!rec) return "";
  return (
    asString(rec.action) ||
    asString(rec.recommendation) ||
    asString(rec.title) ||
    asString(rec.point) ||
    asString(rec.idea) ||
    asString(rec.text) ||
    asString(rec.label) ||
    asString(rec.observation) ||
    asString(rec.question) ||
    asString(rec.evidence)
  );
}

function stripAuditCodes(text: string): string {
  if (!text) return "";

  return text
    .replace(/\s*\(([A-Z]\d{2}|P\d{2})\)/g, "")
    .replace(/\b([A-Z]\d{2}|P\d{2})\b(?=[,:.)\s]|$)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function sanitizeDisplayText(value: unknown): string {
  const text = asString(value);
  if (!text) return "";

  return stripAuditCodes(
    text
      .replace(/^\d+\s*:\s*/gm, "")
      .replace(/^\s*[-•]\s*/gm, "")
      .replace(/\s*,\s*[-•]\s*/g, " ")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}

function sanitizeStringList(value: unknown): string[] {
  return normalizeStringList(value)
    .map((item) => sanitizeDisplayText(item))
    .filter(Boolean);
}

function sanitizeNarrativeValue(value: unknown): string {
  const list = sanitizeStringList(value);
  if (list.length) return list.join("\n");
  return sanitizeDisplayText(value);
}

function findingKeyForMatch(item: unknown, index: number): string {
  const rec = asRecord(item) ?? {};
  return (
    asString(rec.finding_id) ||
    asString(rec.id) ||
    asString(rec.question_id) ||
    `finding_${index + 1}`
  );
}

function safeJsonParse(value: unknown): unknown {
  if (!value) return null;
  if (typeof value === "object") return value;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeStringList(value: unknown): string[] {
  return normalizeList(value).map(stringifyValue).filter(Boolean);
}

function isNotScoredBucketRow(item: AnyRecord) {
  const bucketStatus = asString(item.bucket_status).toLowerCase();
  const health = asString(item.health).toLowerCase();
  const risk = asString(item.risk_level || item.risk).toLowerCase();
  const scoreText = asString(item.score).toLowerCase();
  const scoreNumber = asNumber(item.score);

  return (
    bucketStatus === "insufficient_evidence" ||
    bucketStatus === "scoring_unavailable" ||
    health === "not scored" ||
    risk === "evidence missing" ||
    risk === "scoring unavailable" ||
    scoreText === "not scored" ||
    scoreNumber === null
  );
}

function topScorecardHighlights(report: AnyRecord, limit: number, mode: "strength" | "risk") {
  const items = asArray(report.scorecard)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => isRealBucket(item))
    .filter((item) => asString(item.score).toLowerCase() !== "not scored" && asNumber(item.score) !== null);

  const sorted = items.sort((left, right) => {
    const leftScore = asNumber(left.score) ?? 0;
    const rightScore = asNumber(right.score) ?? 0;
    return mode === "strength" ? rightScore - leftScore : leftScore - rightScore;
  });

  return sorted.slice(0, limit).map((item) => {
    const section = asString(item.section) || asString(item.bucket_name) || "Section";
    const score = asString(item.score) || `${asNumber(item.score) ?? "—"}/100`;
    const health = asString(item.health);
    const risk = asString(item.risk_level) || asString(item.risk);
    return [section, score, health || risk].filter(Boolean).join(" — ");
  });
}

function uniqueStringList(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function semanticKey(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(home|back|cta|ctas|users?|website|site|page|pages|screen|screens|content|navigation|labels?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSemanticList(values: string[], limit = values.length) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values.map((item) => sanitizeDisplayText(item)).filter(Boolean)) {
    const key = semanticKey(raw) || raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(raw);
    if (output.length >= limit) break;
  }
  return output;
}

function quickWinText(item: unknown): string {
  if (typeof item === "string") return sanitizeDisplayText(item);
  const rec = asRecord(item) ?? {};
  return (
    sanitizeDisplayText(rec.recommendation) ||
    sanitizeDisplayText(rec.finding) ||
    sanitizeDisplayText(rec.observation) ||
    sanitizeDisplayText(rec.question) ||
    sanitizeDisplayText(rec.evidence)
  );
}

function executiveListLooksWeak(items: string[]) {
  if (!items.length) return true;
  return items.every(
    (item) =>
      /not scored|scoring unavailable|\d+\/100/i.test(item) ||
      /^(use|implement|redesign|introduce|rewrite|reduce|revise|restructure|capture|provide|add)\b/i.test(
        item.trim(),
      ),
  );
}

function deriveTopProblemsFromBuckets(report: AnyRecord) {
  return uniqueSemanticList(
    asArray(report.all_findings)
      .map((item) => asRecord(item) ?? {})
      .map((item) => sanitizeDisplayText(item.observation || item.question || item.what_we_found))
      .filter(Boolean),
    6,
  );
}

function deriveWhatsWorkingFromBuckets(report: AnyRecord) {
  const buckets = asArray(report.bucket_results)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => asString(item.bucket_status) === "scored")
    .sort((left, right) => (asNumber(right.score) ?? 0) - (asNumber(left.score) ?? 0))
    .slice(0, 4);

  return uniqueSemanticList(
    buckets.map((bucket) => {
      const bucketName = asString(bucket.bucket_name) || asString(bucket.section) || "Bucket";
      const finding = asRecord(asArray(bucket.findings)[0]) ?? {};
      const improvement = asRecord(asArray(bucket.improvements)[0]) ?? {};
      return (
        sanitizeDisplayText(
          `${bucketName}: ${
            finding.observation ||
            improvement.recommendation ||
            bucket.health
          }`,
        ) || sanitizeDisplayText(bucketName)
      );
    }),
    4,
  );
}

function impactRank(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "high") return 3;
  if (normalized === "med" || normalized === "medium") return 2;
  if (normalized === "low") return 1;
  return 0;
}

function effortRank(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "s") return 1;
  if (normalized === "m") return 2;
  if (normalized === "l") return 3;
  return 9;
}

function questionSummaryText(bucketName: string, question: AnyRecord) {
  const observation =
    sanitizeDisplayText(question.observation) ||
    sanitizeDisplayText(question.evidence) ||
    sanitizeDisplayText(question.question);
  const recommendation =
    sanitizeDisplayText(question.recommendation) ||
    sanitizeDisplayText(question.observation);
  return {
    problem: observation ? `${bucketName}: ${observation}` : "",
    action: recommendation ? `${bucketName}: ${recommendation}` : "",
  };
}

function deriveExecutiveQuestionInsights(report: AnyRecord) {
  const bucketResults = asArray(report.bucket_results)
    .filter(isRealBucket)
    .map((item) => normalizeBucketForScoring(asRecord(item) ?? {}));

  const scoredQuestions = bucketResults.flatMap((bucket) => {
    const bucketName = asString(bucket.bucket_name) || asString(bucket.section) || "Bucket";
    return asArray(bucket.questions)
      .map((question) => asRecord(question) ?? {})
      .map((question) => ({
        bucketName,
        mark: asNumber(question.mark),
        answerStatus: asString(question.answer_status),
        impact: asString(question.impact),
        effort: asString(question.effort),
        confidence: asNumber(question.confidence) ?? 0,
        question,
      }))
      .filter((question) => question.answerStatus === "answered" && question.mark !== null);
  });

  const topProblems = uniqueSemanticList(
    scoredQuestions
      .filter((item) => (item.mark ?? 99) <= 3)
      .sort((left, right) => {
        if ((left.mark ?? 99) !== (right.mark ?? 99)) return (left.mark ?? 99) - (right.mark ?? 99);
        if (impactRank(left.impact) !== impactRank(right.impact)) {
          return impactRank(right.impact) - impactRank(left.impact);
        }
        return (right.confidence ?? 0) - (left.confidence ?? 0);
      })
      .map((item) => questionSummaryText(item.bucketName, item.question).problem)
      .filter(Boolean),
    10,
  );

  const whatsWorking = uniqueSemanticList(
    scoredQuestions
      .filter((item) => (item.mark ?? 0) >= 4)
      .sort((left, right) => {
        if ((left.mark ?? 0) !== (right.mark ?? 0)) return (right.mark ?? 0) - (left.mark ?? 0);
        return (right.confidence ?? 0) - (left.confidence ?? 0);
      })
      .map((item) => questionSummaryText(item.bucketName, item.question).problem)
      .filter(Boolean),
    10,
  );

  const firstPriority = uniqueSemanticList(
    scoredQuestions
      .filter((item) => (item.mark ?? 99) <= 2)
      .sort((left, right) => {
        if (impactRank(left.impact) !== impactRank(right.impact)) {
          return impactRank(right.impact) - impactRank(left.impact);
        }
        if (effortRank(left.effort) !== effortRank(right.effort)) {
          return effortRank(left.effort) - effortRank(right.effort);
        }
        return (left.mark ?? 99) - (right.mark ?? 99);
      })
      .map((item) => questionSummaryText(item.bucketName, item.question).action || questionSummaryText(item.bucketName, item.question).problem)
      .filter(Boolean),
    10,
  );

  const quickWins = uniqueSemanticList(
    scoredQuestions
      .filter((item) => (item.mark ?? 99) <= 3)
      .filter((item) => effortRank(item.effort) <= 2 && impactRank(item.impact) >= 2)
      .sort((left, right) => {
        if (effortRank(left.effort) !== effortRank(right.effort)) {
          return effortRank(left.effort) - effortRank(right.effort);
        }
        if (impactRank(left.impact) !== impactRank(right.impact)) {
          return impactRank(right.impact) - impactRank(left.impact);
        }
        return (left.mark ?? 99) - (right.mark ?? 99);
      })
      .map((item) => questionSummaryText(item.bucketName, item.question).action || questionSummaryText(item.bucketName, item.question).problem)
      .filter(Boolean),
    10,
  );

  return {
    topProblems,
    whatsWorking,
    firstPriority,
    quickWins,
  };
}

function bucketNarrativeSummary(bucket: AnyRecord) {
  const bucketName = asString(bucket.bucket_name) || asString(bucket.section) || "Bucket";
  const finding = asRecord(asArray(bucket.findings)[0]) ?? {};
  const improvement = asRecord(asArray(bucket.improvements)[0]) ?? {};
  const risk = asString(bucket.risk);
  const score = asNumber(bucket.score);
  const insight =
    sanitizeDisplayText(finding.observation || finding.what_we_found || finding.question) ||
    sanitizeDisplayText(improvement.observation || improvement.question) ||
    "";
  const nextStep =
    sanitizeDisplayText(improvement.recommendation || finding.recommendation) || "";

  const parts = [
    insight ? `${bucketName} shows ${insight.charAt(0).toLowerCase()}${insight.slice(1)}` : `${bucketName} needs clearer definition`,
    nextStep ? `Next, ${nextStep.charAt(0).toLowerCase()}${nextStep.slice(1)}` : "",
    risk && score !== null ? `This keeps the bucket at ${score}/100 with ${risk.toLowerCase()} risk.` : "",
  ].filter(Boolean);

  return sanitizeDisplayText(parts.join(" "));
}

function deriveNarrativeBullets(report: AnyRecord, pillarName: string, limit = 4) {
  const buckets = asArray(report.bucket_results)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => asString(item.pillar).toLowerCase() === pillarName.toLowerCase())
    .filter((item) => isRealBucket(item))
    .sort((left, right) => {
      const leftScored = asNumber(left.score);
      const rightScored = asNumber(right.score);
      return (leftScored ?? 999) - (rightScored ?? 999);
    });

  return uniqueSemanticList(
    buckets.map(bucketNarrativeSummary).filter(Boolean),
    limit,
  );
}

function derivePillarNarrativeSummary(report: AnyRecord, pillarName: string) {
  const buckets = asArray(report.bucket_results)
    .filter(isRealBucket)
    .map((item) => normalizeBucketForScoring(asRecord(item) ?? {}))
    .filter((item) => asString(item.pillar).toLowerCase() === pillarName.toLowerCase())
    .filter((item) => asString(item.bucket_status) === "scored");

  if (!buckets.length) return "";

  const questions = buckets.flatMap((bucket) => {
    const bucketName = asString(bucket.bucket_name) || asString(bucket.section) || "Bucket";
    return asArray(bucket.questions)
      .map((question) => asRecord(question) ?? {})
      .map((question) => ({
        bucketName,
        mark: asNumber(question.mark),
        answerStatus: asString(question.answer_status),
        observation:
          sanitizeDisplayText(question.observation) ||
          sanitizeDisplayText(question.evidence) ||
          sanitizeDisplayText(question.question),
        recommendation:
          sanitizeDisplayText(question.recommendation) ||
          sanitizeDisplayText(question.observation),
      }))
      .filter((question) => question.answerStatus === "answered" && question.mark !== null);
  });

  if (!questions.length) return "";

  const strongSignals = uniqueSemanticList(
    questions
      .filter((question) => (question.mark ?? 0) >= 4)
      .sort((left, right) => (right.mark ?? 0) - (left.mark ?? 0))
      .map((question) => `${question.bucketName}: ${question.observation}`)
      .filter(Boolean),
    3,
  );

  const weakSignals = uniqueSemanticList(
    questions
      .filter((question) => (question.mark ?? 99) <= 3)
      .sort((left, right) => (left.mark ?? 99) - (right.mark ?? 99))
      .map((question) => `${question.bucketName}: ${question.observation}`)
      .filter(Boolean),
    4,
  );

  const nextSteps = uniqueSemanticList(
    questions
      .filter((question) => (question.mark ?? 99) <= 3)
      .sort((left, right) => (left.mark ?? 99) - (right.mark ?? 99))
      .map((question) => `${question.bucketName}: ${question.recommendation}`)
      .filter(Boolean),
    3,
  );

  const bucketNames = uniqueSemanticList(
    buckets.map((bucket) => asString(bucket.bucket_name) || asString(bucket.section) || "Bucket"),
    6,
  );

  const summaryParts = [
    `${pillarName} covers ${bucketNames.join(", ")}.`,
    strongSignals.length ? `What is working: ${strongSignals.join(" ")}` : "",
    weakSignals.length ? `Main issues: ${weakSignals.join(" ")}` : "",
    nextSteps.length ? `What to fix next: ${nextSteps.join(" ")}` : "",
  ].filter(Boolean);

  return sanitizeDisplayText(summaryParts.join("\n"));
}

function deriveCompetitorOpportunities(report: AnyRecord) {
  const competitors = normalizeCompetitorAnalysis(
    report.competitor_analysis,
    report.competitors,
    getNestedRecord(report, "intake").competitors,
  ).competitors;

  return competitors.map((competitor) => {
    const name = asString(competitor.name) || asString(competitor.url) || "Competitor";
    return {
      ...competitor,
      strengths: uniqueSemanticList(
        normalizeList(competitor.strengths).map(stringifyValue).filter(Boolean).length
          ? normalizeList(competitor.strengths).map(stringifyValue).filter(Boolean)
          : [
              asString(competitor.positioning) ? `${name} communicates a clearer market position.` : "",
              asString(competitor.primary_cta) ? `${name} gives visitors a more explicit primary action.` : "",
            ].filter(Boolean),
        3,
      ),
      gaps: uniqueSemanticList(
        normalizeList(competitor.gaps).map(stringifyValue).filter(Boolean).length
          ? normalizeList(competitor.gaps).map(stringifyValue).filter(Boolean)
          : [
              `${name} can still improve how it prioritizes its most important message.`,
              `${name} may still overload visitors if multiple sections compete for attention.`,
            ],
        3,
      ),
      steal_this: uniqueSemanticList(
        normalizeList(competitor.steal_this).map(stringifyValue).filter(Boolean).length
          ? normalizeList(competitor.steal_this).map(stringifyValue).filter(Boolean)
          : [
              asString(competitor.primary_cta)
                ? `Borrow ${name}'s clearer CTA pattern around "${asString(competitor.primary_cta)}".`
                : `Borrow ${name}'s strongest messaging and path-to-action patterns.`,
            ].filter(Boolean),
        3,
      ),
    };
  });
}

function synthesizeCompetitorInsights(name: string, compareFocus: string) {
  const focus = compareFocus.toLowerCase();
  const strengths: string[] = [];
  const gaps: string[] = [];
  const stealThis: string[] = [];
  let positioning = "";
  let primaryCta = "";

  if (/brand|story|messaging/.test(focus)) {
    strengths.push(`${name} appears to emphasize stronger brand storytelling and message framing.`);
    gaps.push(`${name} may prioritize brand narrative over immediate task clarity or conversion speed.`);
    stealThis.push(`Borrow clearer brand-to-value transitions so key audiences understand the offer faster.`);
    positioning ||= "Brand-led positioning with an emphasis on narrative and credibility.";
  }
  if (/portfolio|product|solution|discovery|structure/.test(focus)) {
    strengths.push(`${name} likely supports discovery with a broader solution or portfolio structure.`);
    gaps.push(`${name} may require tighter prioritization if too many options compete for attention.`);
    stealThis.push(`Adopt the strongest portfolio grouping and solution-path cues to improve discovery.`);
    positioning ||= "Portfolio-led positioning focused on helping visitors explore solutions.";
  }
  if (/sustainability|innovation|proof|trust/.test(focus)) {
    strengths.push(`${name} likely uses proof themes such as innovation, sustainability, or trust signals to support credibility.`);
    gaps.push(`${name} may still need clearer linkage between proof points and customer decision-making.`);
    stealThis.push(`Use proof blocks that connect credibility claims directly to customer outcomes.`);
    positioning ||= "Credibility-led positioning anchored in proof and trust signals.";
  }
  if (/journey|pathway|lead|cta|engagement/.test(focus)) {
    strengths.push(`${name} appears more intentional about audience journeys and conversion pathways.`);
    gaps.push(`${name} may still lose clarity if conversion paths are not segmented by audience intent.`);
    stealThis.push(`Introduce audience-specific CTAs and pathing to shorten the route to action.`);
    primaryCta ||= "Likely uses a journey or contact-oriented CTA pattern.";
  }
  if (/industrial|b2b|business/.test(focus)) {
    positioning ||= "B2B positioning oriented around industrial or business solution relevance.";
  }

  return {
    positioning,
    primaryCta,
    strengths: uniqueStringList(strengths).slice(0, 3),
    gaps: uniqueStringList(gaps).slice(0, 3),
    stealThis: uniqueStringList(stealThis).slice(0, 3),
  };
}

function synthesizeCompetitorInsightsFromSnapshot(rec: AnyRecord) {
  const name = asString(rec.name) || "This competitor";
  const title = asString(rec.title);
  const positioning =
    asString(rec.positioning) ||
    uniqueStringList([
      title,
      ...normalizeStringList(rec.brand_messages),
      ...normalizeStringList(rec.h1),
      ...normalizeStringList(rec.h2),
    ])[0] ||
    "";
  const primaryCta =
    asString(asRecord(asArray(rec.primary_ctas)[0])?.text) ||
    asString(asRecord(asArray(rec.top_nav_links)[0])?.text) ||
    "";

  const strengths = uniqueStringList([
    ...normalizeStringList(rec.brand_messages).map((item) => `${name} makes its offer explicit through: ${item}`),
    ...normalizeStringList(rec.proof_points).map((item) => `${name} supports credibility with proof such as ${item}`),
    ...normalizeStringList(rec.service_signals).map((item) => `${name} gives visitors clearer solution-path cues around ${item}`),
    ...normalizeStringList(rec.content_highlights).map((item) => `${name} surfaces important content themes like ${item}`),
  ]).slice(0, 3);

  const gaps = uniqueStringList([
    positioning ? `${name} still needs tighter prioritization so the most important message is instantly obvious.` : "",
    primaryCta ? `${name}'s CTA pattern can still be improved by tailoring routes more clearly to audience intent.` : "",
    normalizeStringList(rec.h2).length > 4
      ? `${name} presents multiple competing sections, which may dilute the main path to action.`
      : "",
  ].filter(Boolean)).slice(0, 3);

  const stealThis = uniqueStringList([
    primaryCta ? `Borrow ${name}'s clearer CTA language pattern: ${primaryCta}.` : "",
    positioning ? `Use a stronger headline/value framing approach similar to ${name}'s positioning.` : "",
    normalizeStringList(rec.proof_points)[0]
      ? `Add proof blocks similar to ${name}'s trust signals around ${normalizeStringList(rec.proof_points)[0]}.`
      : "",
  ].filter(Boolean)).slice(0, 3);

  return {
    positioning,
    primaryCta,
    strengths,
    gaps,
    stealThis,
  };
}

function reportQuickWins(report: AnyRecord, rawExecutiveSummary: AnyRecord) {
  if (asNumber(report.overall_score) === null) return [];
  const executiveQuickWins = sanitizeStringList(rawExecutiveSummary.quick_wins);
  if (executiveQuickWins.length) return uniqueStringList(executiveQuickWins);

  const topQuickWins = sanitizeStringList(rawExecutiveSummary.top_3_quick_wins);
  if (topQuickWins.length) return uniqueStringList(topQuickWins);

  const rootQuickWins = asArray(report.quick_wins).map(quickWinText).filter(Boolean);
  if (rootQuickWins.length) return uniqueStringList(rootQuickWins);

  const tableQuickWins = asArray(report.quick_wins_table).map(quickWinText).filter(Boolean);
  if (tableQuickWins.length) return uniqueStringList(tableQuickWins);

  return uniqueStringList(asArray(report.all_improvements).map(quickWinText).filter(Boolean));
}

function competitorKey(value: unknown): string {
  return asString(value).toLowerCase().replace(/^url:/, "").trim();
}

function appendUnique(existing: unknown, additions: string[]) {
  const values = normalizeStringList(existing);
  for (const addition of additions) {
    if (!values.includes(addition)) values.push(addition);
  }
  return values;
}

function noteFieldForPage(page: AnyRecord): string {
  const id = asString(page.id).toLowerCase();
  const title = asString(page.title).toLowerCase();
  const marker = `${id} ${title}`;
  if (marker.includes("visual")) return "visual_notes";
  if (marker.includes("motion") || marker.includes("interaction")) return "motion_notes";
  if (marker.includes("content") || marker.includes("clarity")) return "content_notes";
  if (marker.includes("access")) return "accessibility_notes";
  return "";
}

function extractScreenshotFromRecord(rec: AnyRecord): string {
  const direct =
    asString(rec.screenshot) ||
    asString(rec.screenshot_url) ||
    asString(rec.screenshotUrl) ||
    asString(asRecord(rec.screenshots)?.desktop) ||
    asString(asRecord(rec.screenshots)?.mobile) ||
    asString(rec.thumbnail) ||
    asString(rec.thumbnail_url) ||
    asString(rec.thumbnailUrl);
  if (direct) return direct;

  const artifacts = asRecord(rec.artifacts) ?? {};
  const screenshots = asArray(artifacts.screenshots);
  for (const shot of screenshots) {
    const shotRec = asRecord(shot);
    const value =
      asString(shotRec?.dataUrl) ||
      asString(shotRec?.data_url) ||
      asString(shotRec?.url) ||
      asString(shotRec?.image);
    if (value) return value;
  }
  return "";
}

function extractFindingScreenshot(rec: AnyRecord): string {
  const direct =
    asString(rec.screenshot) ||
    asString(rec.screenshot_url) ||
    asString(rec.screenshotUrl) ||
    asString(rec.image) ||
    asString(rec.image_url) ||
    asString(rec.imageUrl) ||
    asString(rec.crop) ||
    asString(rec.crop_url);
  if (direct) return direct;

  const artifacts = asRecord(rec.artifacts) ?? {};
  const screenshots = asArray(rec.screenshots).concat(asArray(artifacts.screenshots));
  for (const shot of screenshots) {
    const shotRec = asRecord(shot);
    const value =
      asString(shotRec?.dataUrl) ||
      asString(shotRec?.data_url) ||
      asString(shotRec?.url) ||
      asString(shotRec?.image);
    if (value) return value;
  }

  const evidenceRec = asRecord(rec.evidence);
  if (evidenceRec) return extractFindingScreenshot(evidenceRec);
  return "";
}

function parseCompetitorsText(value: unknown): AnyRecord[] {
  const text = asString(value);
  if (!text) return [];

  const entries = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const urlMatch = line.match(/https?:\/\/[^\s)]+/i);
      const url = urlMatch?.[0] ?? "";
      const compareMatch = line.match(/\(Compare:\s*([^)]+)\)/i);
      const compare_focus = compareMatch?.[1]?.trim() ?? "";
      const namePart = url
        ? line.slice(0, line.indexOf(url)).replace(/[—–-]\s*$/, "").trim()
        : line;
      const name = namePart.replace(/^[•*-]\s*/, "").trim();
      if (!name && !url) return null;
      return {
        id: url ? `url:${url}` : `name:${name || index + 1}`,
        name,
        url,
        compare_focus,
      } satisfies AnyRecord;
    });

  return entries.reduce<AnyRecord[]>((acc, item) => {
    if (item) acc.push(item);
    return acc;
  }, []);
}

function normalizeCompetitor(raw: unknown): AnyRecord | null {
  const parsed = safeJsonParse(raw);
  const rec = asRecord(parsed);
  if (!rec) return null;

  const signals = asRecord(rec.signals) ?? {};
  const name = asString(rec.name);
  const url = asString(rec.url);
  if (!name && !url) return null;

  const compareFocus = asString(rec.compare_focus);
  const positioning = asString(rec.positioning) || asString(signals.positioning);
  const primaryCta = asString(rec.primary_cta) || asString(signals.primary_cta);
  const strengths = normalizeList(rec.strengths);
  const gaps = normalizeList(rec.gaps);
  const stealThis = normalizeList(rec.steal_this);
  const inferred = synthesizeCompetitorInsights(name || url || "This competitor", compareFocus);
  const snapshotInferred = synthesizeCompetitorInsightsFromSnapshot(rec);
  const mergedPositioning = positioning || snapshotInferred.positioning || inferred.positioning;
  const mergedPrimaryCta = primaryCta || snapshotInferred.primaryCta || inferred.primaryCta;
  const mergedStrengths = strengths.length
    ? strengths
    : snapshotInferred.strengths.length
      ? snapshotInferred.strengths
      : inferred.strengths;
  const mergedGaps = gaps.length
    ? gaps
    : snapshotInferred.gaps.length
      ? snapshotInferred.gaps
      : inferred.gaps;
  const mergedStealThis = stealThis.length
    ? stealThis
    : snapshotInferred.stealThis.length
      ? snapshotInferred.stealThis
      : inferred.stealThis;

  return {
    id: asString(rec.id) || (url ? `url:${url}` : `name:${name}`),
    name,
    url,
    compare_focus: compareFocus,
    title: asString(rec.title),
    meta_description: asString(rec.meta_description),
    positioning: mergedPositioning,
    primary_cta: mergedPrimaryCta,
    screenshot: extractScreenshotFromRecord(rec),
    signals: {
      positioning: mergedPositioning,
      primary_cta: mergedPrimaryCta,
      nav: normalizeList(signals.nav).map(stringifyValue).filter(Boolean),
      proof: normalizeList(signals.proof).map(stringifyValue).filter(Boolean),
    },
    strengths: mergedStrengths,
    gaps: mergedGaps,
    steal_this: mergedStealThis,
    visual_notes: normalizeList(rec.visual_notes),
    motion_notes: normalizeList(rec.motion_notes),
    content_notes: normalizeList(rec.content_notes),
    accessibility_notes: normalizeList(rec.accessibility_notes),
  };
}

export function normalizeCompetitorAnalysis(...sources: unknown[]) {
  const collected: AnyRecord[] = [];
  const seen = new Set<string>();
  const notesByCompetitor = new Map<string, AnyRecord>();

  function addCompetitor(value: unknown) {
    const competitor = normalizeCompetitor(value);
    if (!competitor) return;
    const key = asString(competitor.url) || asString(competitor.name);
    const dedupeKey = key.toLowerCase();
    if (dedupeKey && seen.has(dedupeKey)) return;
    if (dedupeKey) seen.add(dedupeKey);
    collected.push(competitor);
  }

  function addCompetitorNotes(name: string, field: string, notes: string[]) {
    const key = competitorKey(name);
    if (!key || !field || !notes.length) return;
    const existing = notesByCompetitor.get(key) ?? {};
    existing[field] = appendUnique(existing[field], notes);
    notesByCompetitor.set(key, existing);
  }

  function collectNotesFromPages(value: unknown) {
    const rec = asRecord(value);
    if (!rec) return;

    for (const page of asArray(rec.pages)) {
      const pageRecord = asRecord(page);
      if (!pageRecord) continue;
      const field = noteFieldForPage(pageRecord);
      if (!field) continue;

      for (const item of asArray(pageRecord.items)) {
        const itemRecord = asRecord(item);
        const competitor = asString(itemRecord?.competitor);
        const notes = normalizeStringList(itemRecord?.notes);
        addCompetitorNotes(competitor, field, notes);
      }
    }
  }

  for (const source of sources) {
    const parsed = safeJsonParse(source);
    const rec = asRecord(parsed);
    if (!rec) {
      if (Array.isArray(parsed)) parsed.forEach(addCompetitor);
      else parseCompetitorsText(source).forEach(addCompetitor);
      continue;
    }

    const analysis = asRecord(rec.competitor_analysis) ?? asRecord(rec.competitorAnalysis);
    const report = asRecord(rec.competitor_analysis_report);
    const container = analysis ?? report ?? rec;
    collectNotesFromPages(report ?? rec);
    collectNotesFromPages(container);

    const competitors = asArray(container.competitors);
    if (competitors.length) competitors.forEach(addCompetitor);
    else addCompetitor(container);
  }

  for (const competitor of collected) {
    const names = [asString(competitor.name), asString(competitor.url), asString(competitor.id)];
    const matchingNotes = names
      .map((name) => notesByCompetitor.get(competitorKey(name)))
      .find(Boolean);
    if (!matchingNotes) continue;

    for (const field of [
      "visual_notes",
      "motion_notes",
      "content_notes",
      "accessibility_notes",
    ]) {
      competitor[field] = appendUnique(competitor[field], normalizeStringList(matchingNotes[field]));
    }
  }

  const columns = collected.map((competitor) => asString(competitor.name) || asString(competitor.url));
  const rows = [
    {
      key: "positioning",
      label: "Positioning",
      get: (c: AnyRecord) => asString(asRecord(c.signals)?.positioning),
    },
    {
      key: "primary_cta",
      label: "Primary CTA",
      get: (c: AnyRecord) => asString(asRecord(c.signals)?.primary_cta),
    },
    {
      key: "nav",
      label: "Navigation / IA",
      get: (c: AnyRecord) => normalizeList(asRecord(c.signals)?.nav).map(stringifyValue).join(", "),
    },
    {
      key: "proof",
      label: "Proof / Trust",
      get: (c: AnyRecord) => normalizeList(asRecord(c.signals)?.proof).map(stringifyValue).join(" • "),
    },
    {
      key: "strengths",
      label: "Strengths",
      get: (c: AnyRecord) => normalizeList(c.strengths).map(stringifyValue).join(" • "),
    },
    {
      key: "gaps",
      label: "Gaps",
      get: (c: AnyRecord) => normalizeList(c.gaps).map(stringifyValue).join(" • "),
    },
    {
      key: "steal_this",
      label: "Steal This",
      get: (c: AnyRecord) => normalizeList(c.steal_this).map(stringifyValue).join(" • "),
    },
    {
      key: "visual_notes",
      label: "Visual",
      get: (c: AnyRecord) => normalizeList(c.visual_notes).map(stringifyValue).join(" • "),
    },
    {
      key: "motion_notes",
      label: "Motion",
      get: (c: AnyRecord) => normalizeList(c.motion_notes).map(stringifyValue).join(" • "),
    },
    {
      key: "content_notes",
      label: "Content",
      get: (c: AnyRecord) => normalizeList(c.content_notes).map(stringifyValue).join(" • "),
    },
    {
      key: "accessibility_notes",
      label: "Accessibility",
      get: (c: AnyRecord) => normalizeList(c.accessibility_notes).map(stringifyValue).join(" • "),
    },
  ].map((row) => ({
    key: row.key,
    label: row.label,
    values: Object.fromEntries(
      collected.map((competitor) => {
        const name = asString(competitor.name) || asString(competitor.url);
        return [name, row.get(competitor) || "—"];
      }),
    ),
  }));

  return {
    competitors_count: collected.length,
    competitors: collected,
    matrix: { columns, rows },
  };
}

function getNestedRecord(report: AnyRecord, key: string) {
  return asRecord(safeJsonParse(report[key])) ?? {};
}

function isRealBucket(item: unknown) {
  const rec = asRecord(item) ?? {};
  const name = asString(rec.section || rec.bucket_name || rec.bucket || rec.name).toLowerCase();
  if (!name) return true;
  return !name.includes("unknown bucket");
}

function normalizeBucketForScoring(item: AnyRecord) {
  const questions = asArray(item.questions).map((question) => asRecord(question) ?? {});
  const totalQuestions = questions.length;
  const scoreableQuestions = questions.filter((question) => {
    return asString(question.answer_status) === "answered" && asNumber(question.mark) !== null;
  }).length;
  const derivedMarks = questions
    .map((question) => asNumber(question.mark))
    .filter((mark): mark is number => mark !== null);
  const bucketStatus = asString(item.bucket_status);
  const isScoringUnavailable = bucketStatus === "scoring_unavailable";
  const derivedScore =
    derivedMarks.length > 0
      ? Math.round(
          (derivedMarks.reduce((sum, mark) => sum + mark, 0) / (derivedMarks.length * 5)) * 100,
        )
      : null;
  const shouldBeUnscored =
    bucketStatus === "insufficient_evidence" ||
    isScoringUnavailable ||
    scoreableQuestions === 0;

  if (!shouldBeUnscored) {
    return {
      ...item,
      total_marks:
        asNumber(item.total_marks) !== null
          ? asNumber(item.total_marks)
          : derivedMarks.reduce((sum, mark) => sum + mark, 0),
      max_marks:
        asNumber(item.max_marks) !== null ? asNumber(item.max_marks) : derivedMarks.length * 5,
      score: asNumber(item.score) !== null ? asNumber(item.score) : derivedScore,
      bucket_status: "scored",
      health:
        asString(item.health) || "Scored",
      risk:
        asString(item.risk) || "",
      __totalQuestions: totalQuestions,
      __scoreableQuestions: scoreableQuestions,
    } as AnyRecord;
  }

  return {
    ...item,
    total_marks: null,
    max_marks: null,
    score: null,
    bucket_status: isScoringUnavailable ? "scoring_unavailable" : "insufficient_evidence",
    health: "Not scored",
    risk: isScoringUnavailable ? "Scoring unavailable" : "Evidence missing",
    priority: asString(item.priority) || "P0",
    __totalQuestions: totalQuestions,
    __scoreableQuestions: scoreableQuestions,
  } as AnyRecord;
}

function deriveQuestionScoringStats(report: AnyRecord) {
  const bucketResults = asArray(report.bucket_results)
    .filter(isRealBucket)
    .map((item) => normalizeBucketForScoring(asRecord(item) ?? {}));
  const derivedQuestionsTotal = bucketResults.reduce(
    (sum, bucket) => sum + (asNumber(bucket.__totalQuestions) ?? asArray(bucket.questions).length),
    0,
  );
  const derivedQuestionsScoreable = bucketResults.reduce(
    (sum, bucket) => sum + (asNumber(bucket.__scoreableQuestions) ?? 0),
    0,
  );
  const derivedScoredBuckets = bucketResults.filter((bucket) => {
    const status = asString(bucket.bucket_status);
    if (status === "scored") return true;
    return asNumber(bucket.score) !== null;
  }).length;
  const hasScoringFailure = bucketResults.some(
    (bucket) => asString(bucket.bucket_status) === "scoring_unavailable",
  );
  const coverageStatus = asString(report.coverage_status);
  const hasCoverageShortfall = [
    "limited_coverage",
    "insufficient_coverage",
    "failed_login",
  ].includes(coverageStatus);
  const storedQuestionsTotal = asNumber(report.questions_total);
  const storedQuestionsScoreable = asNumber(report.questions_scoreable);
  const questionsTotal =
    storedQuestionsTotal !== null && storedQuestionsTotal > 0
      ? storedQuestionsTotal
      : derivedQuestionsTotal;
  const questionsScoreable =
    storedQuestionsScoreable !== null && storedQuestionsScoreable > 0
      ? storedQuestionsScoreable
      : derivedQuestionsScoreable;
  const storedScoreEligible =
    typeof report.ux_score_eligible === "boolean" ? report.ux_score_eligible : null;
  const derivedScoreEligible =
    !hasCoverageShortfall &&
    !hasScoringFailure &&
    questionsScoreable > 0 &&
    derivedScoredBuckets > 0;
  const effectiveScoreEligible =
    storedScoreEligible === true
      ? true
      : storedScoreEligible === false && !derivedScoreEligible
        ? false
        : derivedScoreEligible;

  return {
    bucketResults,
    questionsTotal,
    questionsScoreable,
    hasScoringFailure,
    scoreEligible: effectiveScoreEligible,
  };
}

function normalizedQuickWin(item: unknown): AnyRecord {
  const rec = asRecord(item) ?? {};
  const title =
    sanitizeDisplayText(
      rec.title ||
        rec.finding ||
        rec.recommendation ||
        rec.action ||
        rec.question ||
        rec.observation ||
        rec.evidence,
    ) || "Recommendation";
  const severity = asString(rec.severity).toLowerCase();
  return {
    ...rec,
    finding: sanitizeDisplayText(rec.finding) || sanitizeDisplayText(rec.question) || asString(rec.bucket) || title,
    recommendation:
      sanitizeDisplayText(rec.recommendation) ||
      sanitizeDisplayText(rec.action) ||
      sanitizeDisplayText(rec.observation) ||
      sanitizeDisplayText(rec.evidence) ||
      title,
    effort:
      asString(rec.effort) ||
      (severity === "critical" ? "High" : severity === "high" ? "Medium" : ""),
    estimated_time:
      asString(rec.estimated_time) ||
      asString(rec.time_estimate) ||
      (severity === "critical"
        ? "1–2 weeks"
        : severity === "high"
          ? "2–4 weeks"
          : ""),
    acceptance_criteria:
      asString(rec.acceptance_criteria) || asString(rec.success_metric),
  };
}

function looksLikeCloudinaryAsset(item: unknown) {
  const rec = asRecord(item) ?? {};
  return Boolean(
    asString(rec.asset_id) ||
      asString(rec.public_id) ||
      asString(rec.secure_url) ||
      asString(rec.resource_type) === "image",
  );
}

function hasMeaningfulFindingContent(item: unknown) {
  const rec = asRecord(item) ?? {};
  return Boolean(
    asString(rec.what_we_found) ||
      asString(rec.why_it_matters) ||
      asString(rec.recommendation) ||
      asString(rec.question) ||
      asString(rec.title) ||
      asString(rec.observation) ||
      asString(rec.evidence) ||
      asString(rec.impact),
  );
}

function normalizedFinding(item: unknown, index: number): AnyRecord {
  const rec = asRecord(item) ?? {};
  const recommendation = sanitizeDisplayText(rec.recommendation);
  return {
    ...rec,
    id:
      asString(rec.id) ||
      asString(rec.finding_id) ||
      asString(rec.question_id) ||
      `F${index + 1}`,
    rank: asNumber(rec.rank) ?? index + 1,
    what_we_found:
      sanitizeDisplayText(rec.what_we_found) ||
      sanitizeDisplayText(rec.observation) ||
      sanitizeDisplayText(rec.what) ||
      sanitizeDisplayText(rec.question) ||
      sanitizeDisplayText(rec.evidence) ||
      sanitizeDisplayText(rec.title),
    why_it_matters:
      sanitizeDisplayText(rec.why_it_matters) ||
      sanitizeDisplayText(rec.impact) ||
      sanitizeDisplayText(rec.evidence) ||
      asString(rec.severity),
    recommendation: recommendation || sanitizeDisplayText(rec.action) || sanitizeDisplayText(rec.fix) || sanitizeDisplayText(rec.title),
    screenshot: extractFindingScreenshot(rec),
    acceptance_criteria: sanitizeStringList(rec.acceptance_criteria),
  };
}

function genericNarrativeForPillar(report: AnyRecord, pillarName: string) {
  const relatedBuckets = asArray(report.bucket_results)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => asString(item.pillar).toLowerCase() === pillarName.toLowerCase())
    .filter((item) => asString(item.bucket_status) === "scored");

  if (!relatedBuckets.length) return "";

  const bucketSummary = relatedBuckets
    .map((bucket) => asString(bucket.bucket_name) || asString(bucket.section) || "Bucket")
    .filter(Boolean)
    .join(", ");

  const firstRecommendation = relatedBuckets
    .flatMap((bucket) => asArray(bucket.improvements))
    .map((item) => asRecord(item) ?? {})
    .map((item) => asString(item.recommendation) || asString(item.observation) || asString(item.question))
    .find(Boolean);

  return firstRecommendation
    ? `${pillarName} review covers ${bucketSummary}. Priority focus: ${firstRecommendation}.`
    : `${pillarName} review covers ${bucketSummary}.`;
}

function narrativeFromBuckets(report: AnyRecord, pillarName: string) {
  const relatedBuckets = asArray(report.bucket_results)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => asString(item.pillar).toLowerCase() === pillarName.toLowerCase())
    .filter((item) => asString(item.bucket_status) === "scored");

  if (!relatedBuckets.length) return "";

  const insights = relatedBuckets.flatMap((bucket) => {
    const bucketName = asString(bucket.bucket_name) || asString(bucket.section) || "Bucket";
    const findings = asArray(bucket.findings).map((item) => asRecord(item) ?? {});
    const improvements = asArray(bucket.improvements).map((item) => asRecord(item) ?? {});
    const topFinding = findings[0];
    const topImprovement = improvements[0];

    return [
      topFinding
        ? `${bucketName}: ${asString(topFinding.observation) || asString(topFinding.question)}`
        : "",
      topImprovement
        ? `Next step for ${bucketName}: ${asString(topImprovement.recommendation) || asString(topImprovement.observation) || asString(topImprovement.question)}`
        : "",
    ].filter(Boolean);
  });

  return insights.slice(0, 4).join("\n");
}

function narrativeLooksWeak(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return true;
  return /scored\s+\d+\/100|not scored|\(\d+\/100/i.test(text);
}

function roadmapActions(value: unknown): string[] {
  const rec = asRecord(value);
  const items = rec ? rec.items : value;
  return normalizeList(items).map(stringifyValue).filter(Boolean);
}

function roadmapPhaseActions(value: unknown): string[] {
  const rec = asRecord(value) ?? {};
  const direct = roadmapActions(value);
  if (direct.length) return direct;

  const merged = [
    ...normalizeStringList(rec.items),
    ...normalizeStringList(rec.actions),
    ...normalizeStringList(rec.tasks),
  ];
  return uniqueStringList(merged);
}

function roadmapStageFromEffort(value: unknown) {
  const effort = asString(value).trim().toLowerCase();
  if (!effort) return "month_1";
  if (["small", "s", "low"].includes(effort)) return "week_1_2";
  if (["large", "l", "high"].includes(effort)) return "quarter_1";
  return "month_1";
}

function deriveRoadmapFromQuickWins(items: unknown[]) {
  const roadmap = {
    week_1_2: [] as string[],
    month_1: [] as string[],
    quarter_1: [] as string[],
  };

  for (const item of items) {
    const rec = normalizedQuickWin(item);
    const action =
      sanitizeDisplayText(rec.recommendation) ||
      sanitizeDisplayText(rec.finding) ||
      sanitizeDisplayText(rec.title);
    if (!action) continue;
    const stage = roadmapStageFromEffort(rec.effort);
    roadmap[stage].push(action);
  }

  roadmap.week_1_2 = uniqueStringList(roadmap.week_1_2).slice(0, 6);
  roadmap.month_1 = uniqueStringList(roadmap.month_1).slice(0, 6);
  roadmap.quarter_1 = uniqueStringList(roadmap.quarter_1).slice(0, 6);

  const overflow = uniqueStringList(
    items
      .map((item) => {
        const rec = normalizedQuickWin(item);
        return (
          sanitizeDisplayText(rec.recommendation) ||
          sanitizeDisplayText(rec.finding) ||
          sanitizeDisplayText(rec.title)
        );
      })
      .filter(Boolean),
  ).filter(
    (action) =>
      !roadmap.week_1_2.includes(action) &&
      !roadmap.month_1.includes(action) &&
      !roadmap.quarter_1.includes(action),
  );

  while (roadmap.week_1_2.length < 3 && overflow.length) roadmap.week_1_2.push(overflow.shift() as string);
  while (roadmap.month_1.length < 3 && overflow.length) roadmap.month_1.push(overflow.shift() as string);
  while (roadmap.quarter_1.length < 3 && overflow.length) roadmap.quarter_1.push(overflow.shift() as string);

  roadmap.week_1_2 = uniqueSemanticList(roadmap.week_1_2, 6);
  roadmap.month_1 = uniqueSemanticList(roadmap.month_1, 6);
  roadmap.quarter_1 = uniqueSemanticList(roadmap.quarter_1, 6);

  return roadmap;
}

function getScreenshot(report: AnyRecord, intake: AnyRecord): string {
  const direct =
    asString(report.screenshot) ||
    asString(report.screenshot_url) ||
    asString(report.screenshotUrl) ||
    asString(intake.screenshot) ||
    asString(intake.screenshot_url);
  if (direct) return direct;

  const artifacts = asRecord(report.artifacts) ?? asRecord(intake.artifacts) ?? {};
  const screenshots = asArray(artifacts.screenshots);
  for (const shot of screenshots) {
    const rec = asRecord(shot);
    const value =
      asString(rec?.dataUrl) ||
      asString(rec?.data_url) ||
      asString(rec?.url) ||
      asString(rec?.image);
    if (value) return value;
  }
  return "";
}

function buildCaptureCoverage(report: AnyRecord) {
  const derivedScoring = deriveQuestionScoringStats(report);
  const evidence = getNestedRecord(report, "evidence");
  const coverage = getNestedRecord(evidence, "coverage");
  const evidenceSummary = getNestedRecord(coverage, "evidenceSummary");
  const debug = getNestedRecord(evidence, "debug");
  const screenshots = asArray(evidence.screenshots).map((item) => asRecord(item) ?? {});
  const pages = asArray(evidence.pages).map((item) => asRecord(item) ?? {});
  const guidedStepResults = asArray(debug.guidedStepResults).map((item) => asRecord(item) ?? {});
  const internalRouteResults = asArray(debug.internalRouteResults).map((item) => asRecord(item) ?? {});
  const allStepResults = guidedStepResults.concat(internalRouteResults);
  const failedStepReasons = uniqueStringList(
    allStepResults
      .filter((item) => item.success === false)
      .map((item) => asString(item.reason) || `${asString(item.stepName)} failed`)
      .filter(Boolean),
  );
  const warnings = uniqueStringList(asArray(evidence.warnings).map((item) => stringifyValue(item)).filter(Boolean));
  const missing = uniqueStringList(asArray(coverage.missing).map((item) => stringifyValue(item)).filter(Boolean));
  const loginPageCaptured =
    screenshots.some((shot) => /login/i.test(asString(shot.label) + " " + asString(shot.screenType) + " " + asString(shot.screenName))) ||
    pages.some((page) => /login|sign in|authenticate/i.test(asString(page.label) + " " + asString(page.title)));
  const authenticatedDashboardCaptured =
    Boolean(evidenceSummary.dashboardCaptured) ||
    pages.some((page) => /dashboard|home|overview|workspace/i.test(asString(page.label) + " " + asString(page.title)));
  const navigationCaptured = Boolean(evidenceSummary.navigationCaptured);
  const internalProductScreensCaptured = Math.max(0, asNumber(evidenceSummary.internalScreensCaptured) ?? 0);
  const formsCaptured = Boolean(evidenceSummary.formCaptured);
  const tablesCaptured = Boolean(evidenceSummary.tableOrGridCaptured);
  const dropdownCaptured = Boolean(evidenceSummary.dropdownOrContextCaptured);
  const errorEmptyLoadingCaptured =
    screenshots.some(
      (shot) =>
        shot.hasErrorState === true ||
        shot.hasEmptyState === true ||
        /error|empty|loading|alert|validation/i.test(
          [asString(shot.label), asString(shot.screenType), asString(shot.visibleTextSummary)].join(" "),
        ),
    ) ||
    pages.some((page) =>
      /error|empty|loading|alert|validation/i.test(
        [asString(page.label), asString(page.title), asString(page.textSnippet)].join(" "),
      ),
    );
  const browserSessionUsed =
    /browserbase/i.test(asString(debug.provider)) ||
    screenshots.some((shot) => asString(shot.source) === "browserbase") ||
    Boolean(debug.savedSessionFound);
  const guidedStepsAttempted =
    asNumber(debug.guidedStepsCount) ??
    guidedStepResults.length ??
    0;
  const guidedStepsCompleted = guidedStepResults.filter((item) => item.success === true).length;
  const whatWasCaptured = uniqueStringList(
    [
      loginPageCaptured ? "Login page" : "",
      authenticatedDashboardCaptured ? "Authenticated dashboard/home" : "",
      navigationCaptured ? "Navigation / context selectors" : "",
      internalProductScreensCaptured > 0 ? `${internalProductScreensCaptured} internal product screen(s)` : "",
      formsCaptured ? "Forms / inputs" : "",
      tablesCaptured ? "Tables / data grids" : "",
      dropdownCaptured ? "Dropdown / context selector state" : "",
      errorEmptyLoadingCaptured ? "Error / empty / loading state" : "",
    ].filter(Boolean),
  );
  const whatWasMissing = uniqueStringList(
    [
      ...missing,
      !loginPageCaptured ? "Login page was not captured." : "",
      !authenticatedDashboardCaptured ? "Authenticated dashboard was not captured." : "",
      !navigationCaptured ? "Navigation / context selectors were not captured." : "",
      internalProductScreensCaptured < 3 ? "At least 3 internal product screens were not captured." : "",
      !formsCaptured ? "Form or input state was not captured." : "",
      !tablesCaptured ? "Table or data grid was not captured." : "",
      !dropdownCaptured ? "Dropdown or context selector state was not captured." : "",
      !errorEmptyLoadingCaptured ? "Error, empty, or loading state was not captured." : "",
    ].filter(Boolean),
  );
  const suggestedNextSteps = uniqueStringList(
    [
      "Re-run the audit with guided capture steps that open post-login modules and internal screens.",
      "Provide internal routes or a recorded authenticated journey for the product.",
      "Upload labeled authenticated screenshots if automated exploration is unreliable.",
      "Capture at least one table, one form/input state, one dropdown/context selector state, and one error/empty/loading state.",
      warnings[0] ? `Review warning: ${warnings[0]}` : "",
    ].filter(Boolean),
  );

  return {
    status: asString(coverage.status) || asString(report.coverage_status) || "unknown",
    summary:
      asString(coverage.summary) ||
      (() => {
        if (asNumber(report.overall_score) !== null) return "";
        const coverageStatus = asString(coverage.status) || asString(report.coverage_status);
        const scoreEligible = derivedScoring.scoreEligible;
        if (!scoreEligible && ["full_coverage", "usable_coverage"].includes(coverageStatus)) {
          return "UX score was not calculated because scoring could not be completed from the captured evidence.";
        }
        return "UX score was not calculated because the required product screens were not captured.";
      })(),
    loginPageCaptured,
    authenticatedDashboardCaptured,
    navigationCaptured,
    internalProductScreensCaptured,
    internalProductScreensTarget: 3,
    formsCaptured,
    tablesCaptured,
    dropdownCaptured,
    errorEmptyLoadingCaptured,
    browserSessionUsed,
    guidedStepsAttempted,
    guidedStepsCompleted,
    questionsScoreable: derivedScoring.questionsScoreable,
    questionsTotal: derivedScoring.questionsTotal,
    scoreEligible: derivedScoring.scoreEligible,
    failedStepReasons: failedStepReasons.length ? failedStepReasons : warnings,
    whatWasCaptured,
    whatWasMissing,
    suggestedNextSteps,
  };
}

export function buildReportViewModel(input: unknown): ReportViewModel {
  const report = asRecord(input) ?? {};
  const derivedScoring = deriveQuestionScoringStats(report);
  const captureCoverage = buildCaptureCoverage(report);
  const intake = getNestedRecord(report, "intake");
  const rawExecutiveSummary = getNestedRecord(report, "executive_summary");
  const sectionNarrative = getNestedRecord(report, "section_narrative");
  const legacyNarrative = getNestedRecord(report, "narrative");
  const rawRoadmap = getNestedRecord(report, "roadmap");
  const competitorAnalysis = normalizeCompetitorAnalysis(
    report.competitor_analysis,
    report.competitorAnalysis,
    report.competitor_analysis_report,
    report.competitors,
    intake.competitors,
  );

  const productName =
    asString(report.product_name) || asString(intake.product_name) || "UX Audit Report";
  const productUrl = asString(report.product_url) || asString(intake.product_url);
  const auditReason =
    asString(report.known_problem) ||
    asString(intake.known_problem) ||
    asString(intake.reason) ||
    asString(intake.constraints);
  const topStrengths =
    uniqueStringList(
      sanitizeStringList(rawExecutiveSummary.top_strengths).length
        ? sanitizeStringList(rawExecutiveSummary.top_strengths)
        : sanitizeStringList(rawExecutiveSummary.top_3_quick_wins).length
          ? sanitizeStringList(rawExecutiveSummary.top_3_quick_wins)
          : deriveWhatsWorkingFromBuckets(report),
    );
  const topRisks =
    uniqueStringList(
      sanitizeStringList(rawExecutiveSummary.top_risks).length
        ? sanitizeStringList(rawExecutiveSummary.top_risks)
        : sanitizeStringList(rawExecutiveSummary.top_3_problems).length
          ? sanitizeStringList(rawExecutiveSummary.top_3_problems)
          : deriveTopProblemsFromBuckets(report).concat(topScorecardHighlights(report, 3, "risk")),
    );
  const quickWinItems = reportQuickWins(report, rawExecutiveSummary);
  const storedAuditType = asString(report.audit_mode) || "Full UX Audit";
  const rawCoverageStatus = asString(report.coverage_status);
  const effectiveCoverageStatus =
    asString(captureCoverage.status) || rawCoverageStatus || "unknown";
  const scoreEligible = derivedScoring.scoreEligible;
  const storedScorecard = asArray(report.scorecard)
    .filter(isRealBucket)
    .map((item) => asRecord(item) ?? {});
  const derivedScorecard = derivedScoring.bucketResults.map((bucket) => ({
    section:
      asString(bucket.section) ||
      asString(bucket.bucket_name) ||
      asString(bucket.bucket) ||
      "Bucket",
    score: asNumber(bucket.score) !== null ? `${asNumber(bucket.score)}/100` : "Not scored",
    health: asString(bucket.health) || "Not scored",
    risk:
      asString(bucket.risk) ||
      (asString(bucket.bucket_status) === "scoring_unavailable"
        ? "Scoring unavailable"
        : asString(bucket.bucket_status) === "insufficient_evidence"
          ? "Evidence missing"
          : ""),
    priority: asString(bucket.priority) || "P0",
    pillar: asString(bucket.pillar) || "Impact",
  }));
  const hasCoverageShortfall = [
    "limited_coverage",
    "insufficient_coverage",
    "failed_login",
    "capture_pipeline_not_executed",
  ].includes(effectiveCoverageStatus);
  const scoredBucketCount = derivedScoring.bucketResults.filter((bucket) => {
    const status = asString(bucket.bucket_status);
    return status === "scored" || asNumber(bucket.score) !== null;
  }).length;
  const hasPartialScoring = scoredBucketCount > 0;
  const isLimitedCoverage = hasCoverageShortfall && !hasPartialScoring;
  const isScoringUnavailable =
    (!isLimitedCoverage || hasPartialScoring) &&
    !scoreEligible &&
    asNumber(report.overall_score) === null &&
    (derivedScoring.hasScoringFailure ||
      ["full_coverage", "usable_coverage"].includes(effectiveCoverageStatus));
  const auditType = isLimitedCoverage
    ? "Limited Coverage Report"
    : isScoringUnavailable || hasPartialScoring
      ? "Provisional UX Audit"
      : storedAuditType === "Limited Coverage Report" || storedAuditType === "Limited Coverage Audit"
        ? effectiveCoverageStatus === "usable_coverage"
          ? "Provisional UX Audit"
          : "Full UX Audit"
        : storedAuditType;
  const shouldUseDerivedScorecard =
    derivedScorecard.length > 0 &&
    (isLimitedCoverage ||
      isScoringUnavailable ||
      !scoreEligible ||
      storedScorecard.some((item) => {
        const section =
          asString(item.section) || asString(item.bucket_name) || asString(item.bucket);
        const matchingBucket = derivedScoring.bucketResults.find((bucket) => {
          const bucketName =
            asString(bucket.section) || asString(bucket.bucket_name) || asString(bucket.bucket);
          return bucketName && section && bucketName === section;
        });
        if (!matchingBucket) return false;
        const storedLooksNotScored = isNotScoredBucketRow(item);
        const derivedLooksNotScored =
          asString(matchingBucket.bucket_status) === "insufficient_evidence" ||
          asString(matchingBucket.bucket_status) === "scoring_unavailable" ||
          asNumber(matchingBucket.score) === null;
        return storedLooksNotScored !== derivedLooksNotScored;
      }));
  const pillarSummary = asRecord(rawExecutiveSummary.pillar_summary) ?? {};
  const delightSummary = asRecord(pillarSummary.Delight) ?? {};
  const impactSummary = asRecord(pillarSummary.Impact) ?? {};
  const accessibilitySummary = asRecord(pillarSummary.Accessibility) ?? {};
  const primaryPriority = asRecord(asArray(rawExecutiveSummary.top_3_priorities)[0]) ?? {};
  const fallbackTopProblems = deriveTopProblemsFromBuckets(report);
  const fallbackWhatsWorking = deriveWhatsWorkingFromBuckets(report);
  const questionInsights = deriveExecutiveQuestionInsights(report);
  const verdictRisk = topRisks[0] || "";
  const verdictStrength = topStrengths[0] || "";
  const firstUrgentIssue = questionInsights.firstPriority[0] || questionInsights.topProblems[0] || verdictRisk;
  const strongestValidated = questionInsights.whatsWorking[0] || verdictStrength;
  const generatedVerdictParts = isLimitedCoverage
    ? [
        "UX score was not calculated because the required product screens were not captured.",
        captureCoverage.summary,
      ].filter(Boolean)
    : isScoringUnavailable
      ? hasPartialScoring
        ? [
            "Partial scoring completed, but some buckets could not be scored from the captured evidence.",
            verdictStrength ? `Strongest scored area: ${verdictStrength}.` : "",
            verdictRisk ? `Largest remaining issue: ${verdictRisk}.` : "",
          ].filter(Boolean)
        : [
            "UX score was not calculated because scoring could not be completed from the captured evidence.",
            captureCoverage.summary,
          ].filter(Boolean)
      : [
          `${productName} scores ${asString(report.overall_score) || "—"}/100 and currently delivers uneven UX quality.`,
          strongestValidated ? `What works best today: ${strongestValidated}.` : "",
          firstUrgentIssue ? `What needs attention first: ${firstUrgentIssue}.` : "",
        ].filter(Boolean);
  const executiveSummary = {
    ...rawExecutiveSummary,
    one_line_verdict:
      sanitizeDisplayText(rawExecutiveSummary.one_line_verdict) ||
      sanitizeDisplayText(rawExecutiveSummary.headline) ||
      generatedVerdictParts.join(" "),
    strongest_area:
      isLimitedCoverage || (isScoringUnavailable && !hasPartialScoring)
        ? "Not scored"
        : sanitizeDisplayText(rawExecutiveSummary.strongest_area) ||
          sanitizeDisplayText(questionInsights.whatsWorking[0]) ||
          sanitizeDisplayText(topStrengths[0]) ||
          "",
    main_issue:
      isLimitedCoverage
        ? "Capture coverage insufficient"
        : isScoringUnavailable
          ? hasPartialScoring
            ? sanitizeDisplayText(rawExecutiveSummary.main_issue) ||
              sanitizeDisplayText(questionInsights.topProblems[0]) ||
              sanitizeDisplayText(topRisks[0]) ||
              "Some buckets remain unscored"
            : "Scoring unavailable"
        : sanitizeDisplayText(rawExecutiveSummary.main_issue) ||
          sanitizeDisplayText(questionInsights.topProblems[0]) ||
          sanitizeDisplayText(topRisks[0]) ||
          "",
    what_works:
      isLimitedCoverage
        ? "The audit stopped before reliable scoring because the captured evidence set was incomplete."
        : isScoringUnavailable
          ? hasPartialScoring
            ? sanitizeDisplayText(rawExecutiveSummary.what_works) ||
              sanitizeStringList(rawExecutiveSummary.whats_working).join(" ") ||
              topStrengths.join(" ")
            : "Evidence capture completed, but the scoring model did not return a usable bucket evaluation."
        : sanitizeDisplayText(rawExecutiveSummary.what_works) ||
          sanitizeStringList(rawExecutiveSummary.whats_working).join(" ") ||
          topStrengths.join(" "),
    whats_working:
      isLimitedCoverage || (isScoringUnavailable && !hasPartialScoring)
        ? []
        : questionInsights.whatsWorking.length
          ? questionInsights.whatsWorking
          : sanitizeStringList(rawExecutiveSummary.whats_working).length
          ? executiveListLooksWeak(sanitizeStringList(rawExecutiveSummary.whats_working))
            ? fallbackWhatsWorking
            : sanitizeStringList(rawExecutiveSummary.whats_working)
          : topStrengths,
    top_3_problems:
      isLimitedCoverage
        ? []
        : questionInsights.topProblems.length
          ? questionInsights.topProblems.slice(0, 3)
          : sanitizeStringList(rawExecutiveSummary.top_3_problems).length
          ? executiveListLooksWeak(sanitizeStringList(rawExecutiveSummary.top_3_problems))
            ? fallbackTopProblems.slice(0, 3)
            : sanitizeStringList(rawExecutiveSummary.top_3_problems)
          : sanitizeStringList(rawExecutiveSummary.top_problems).length
            ? executiveListLooksWeak(sanitizeStringList(rawExecutiveSummary.top_problems))
              ? fallbackTopProblems.slice(0, 3)
              : sanitizeStringList(rawExecutiveSummary.top_problems)
            : topRisks,
    top_problems:
      isLimitedCoverage
        ? []
        : questionInsights.topProblems.length
          ? questionInsights.topProblems
          : sanitizeStringList(rawExecutiveSummary.top_problems).length
          ? executiveListLooksWeak(sanitizeStringList(rawExecutiveSummary.top_problems))
            ? fallbackTopProblems
            : sanitizeStringList(rawExecutiveSummary.top_problems)
          : topRisks,
    top_3_quick_wins:
      isLimitedCoverage
        ? []
        : questionInsights.quickWins.length
          ? questionInsights.quickWins.slice(0, 3)
          : sanitizeStringList(rawExecutiveSummary.top_3_quick_wins).length
          ? uniqueSemanticList(sanitizeStringList(rawExecutiveSummary.top_3_quick_wins), 3)
          : sanitizeStringList(rawExecutiveSummary.quick_wins).length
            ? uniqueSemanticList(sanitizeStringList(rawExecutiveSummary.quick_wins), 3)
            : quickWinItems.slice(0, 3),
    quick_wins: isLimitedCoverage
      ? []
      : questionInsights.quickWins.length
        ? questionInsights.quickWins
        : uniqueSemanticList(quickWinItems, 8),
    first_priority_recommendation:
      isLimitedCoverage
        ? "Re-run with manual browser login, a recorded journey, internal routes, or labeled authenticated screenshots."
        : isScoringUnavailable && !hasPartialScoring
          ? sanitizeDisplayText(rawExecutiveSummary.first_priority_recommendation) ||
            sanitizeStringList(rawExecutiveSummary.first_priority)[0] ||
            "Re-run the unanswered buckets or add more evidence before using this report for prioritization."
          : questionInsights.firstPriority[0] ||
            sanitizeDisplayText(rawExecutiveSummary.first_priority_recommendation) ||
            sanitizeStringList(rawExecutiveSummary.first_priority)[0] ||
            sanitizeDisplayText(rawExecutiveSummary.primary_recommendation) ||
            [sanitizeDisplayText(primaryPriority.title), sanitizeDisplayText(primaryPriority.why)].filter(Boolean).join(" — "),
    first_priority:
      isLimitedCoverage
        ? captureCoverage.suggestedNextSteps
        : questionInsights.firstPriority.length
          ? questionInsights.firstPriority
          : sanitizeStringList(rawExecutiveSummary.first_priority).length
          ? uniqueSemanticList(sanitizeStringList(rawExecutiveSummary.first_priority), 5)
          : sanitizeDisplayText(rawExecutiveSummary.first_priority_recommendation)
            ? [sanitizeDisplayText(rawExecutiveSummary.first_priority_recommendation)]
            : [],
  };
  const weekOneTwo = sanitizeStringList(rawRoadmap.week_1_2).length
    ? sanitizeStringList(rawRoadmap.week_1_2)
    : roadmapPhaseActions(rawRoadmap.phase_1_fix_now).length
      ? sanitizeStringList(roadmapPhaseActions(rawRoadmap.phase_1_fix_now))
      : sanitizeStringList(roadmapPhaseActions(rawRoadmap.phase_1_sprint_1_2_weeks));
  const monthOne = sanitizeStringList(rawRoadmap.month_1).length
    ? sanitizeStringList(rawRoadmap.month_1)
    : roadmapPhaseActions(rawRoadmap.phase_2_build_next).length
      ? sanitizeStringList(roadmapPhaseActions(rawRoadmap.phase_2_build_next))
      : sanitizeStringList(roadmapPhaseActions(rawRoadmap.phase_2_sprint_3_4_weeks));
  const quarterOne = sanitizeStringList(rawRoadmap.quarter_1).length
    ? sanitizeStringList(rawRoadmap.quarter_1)
    : roadmapPhaseActions(rawRoadmap.phase_3_optimize_later).length
      ? sanitizeStringList(roadmapPhaseActions(rawRoadmap.phase_3_optimize_later))
      : sanitizeStringList(roadmapPhaseActions(rawRoadmap.phase_3_month_2));
  const combinedImpactNarrative = [
    sectionNarrative.navigation_findability,
    sectionNarrative.input_errors_validation,
    sectionNarrative.feedback_system_states,
    sectionNarrative.consistency_ui_patterns,
    sectionNarrative.product_optimisation,
  ]
    .map((value) => asString(value))
    .filter(Boolean)
    .join("\n\n");
  const derivedDelightNarrative =
    sanitizeDisplayText(derivePillarNarrativeSummary(report, "Delight")) ||
    sanitizeDisplayText(narrativeFromBuckets(report, "Delight")) ||
    sanitizeDisplayText(genericNarrativeForPillar(report, "Delight"));
  const derivedImpactNarrative =
    sanitizeDisplayText(derivePillarNarrativeSummary(report, "Impact")) ||
    sanitizeDisplayText(narrativeFromBuckets(report, "Impact")) ||
    sanitizeDisplayText(genericNarrativeForPillar(report, "Impact"));
  const derivedAccessibilityNarrative =
    sanitizeDisplayText(derivePillarNarrativeSummary(report, "Accessibility")) ||
    sanitizeDisplayText(narrativeFromBuckets(report, "Accessibility")) ||
    sanitizeDisplayText(genericNarrativeForPillar(report, "Accessibility"));

  const fallbackDelightNarrative = deriveNarrativeBullets(report, "Delight");
  const fallbackImpactNarrative = deriveNarrativeBullets(report, "Impact");
  const fallbackAccessibilityNarrative = deriveNarrativeBullets(report, "Accessibility");

  const rawFindingsDetailed = asArray(report.findings_detailed);
  const bucketDerivedFindings = derivedScoring.bucketResults.flatMap((bucket) =>
    asArray(asRecord(bucket)?.findings),
  );
  const bucketDerivedImprovements = derivedScoring.bucketResults.flatMap((bucket) =>
    asArray(asRecord(bucket)?.improvements),
  );
  const screenshotOnlyFindings =
    rawFindingsDetailed.length > 0 &&
    rawFindingsDetailed.every((item) => !hasMeaningfulFindingContent(item) && looksLikeCloudinaryAsset(item));
  const fallbackFindings =
    asArray(report.all_findings).length
      ? asArray(report.all_findings)
      : asArray(report.top_5_findings).length
        ? asArray(report.top_5_findings)
        : asArray(report.findings).length
          ? asArray(report.findings)
          : bucketDerivedFindings;
  const fallbackFindingsByKey = new Map(
    fallbackFindings.map((item, index) => [findingKeyForMatch(item, index), asRecord(item) ?? {}]),
  );

  const mergedFindingsSource = screenshotOnlyFindings
    ? fallbackFindings.map((item, index) => {
        const screenshotMeta = asRecord(rawFindingsDetailed[index]) ?? {};
        const finding = asRecord(item) ?? {};
        return {
          ...finding,
          screenshot_url:
            asString(finding.screenshot_url) ||
            asString(screenshotMeta.screenshot_url) ||
            asString(screenshotMeta.secure_url) ||
            asString(screenshotMeta.url),
          screenshot:
            asString(finding.screenshot) ||
            asString(screenshotMeta.screenshot_url) ||
            asString(screenshotMeta.secure_url) ||
            asString(screenshotMeta.url),
        };
      })
    : rawFindingsDetailed.length
    ? rawFindingsDetailed.map((item, index) => {
        const fallback = asRecord(fallbackFindings[index]) ?? {};
        const current = asRecord(item) ?? {};
        const fallbackByKey = fallbackFindingsByKey.get(findingKeyForMatch(current, index)) ?? {};
        if (hasMeaningfulFindingContent(item)) {
          return {
            ...fallbackByKey,
            ...fallback,
            ...current,
            screenshot_url:
              asString(current.screenshot_url) ||
              asString(current.secure_url) ||
              asString(current.url) ||
              asString(fallbackByKey.screenshot_url) ||
              asString(fallbackByKey.screenshot) ||
              asString(fallback.screenshot_url) ||
              asString(fallback.screenshot),
            screenshot:
              asString(current.screenshot) ||
              asString(current.screenshot_url) ||
              asString(current.secure_url) ||
              asString(current.url) ||
              asString(fallbackByKey.screenshot) ||
              asString(fallbackByKey.screenshot_url) ||
              asString(fallback.screenshot) ||
              asString(fallback.screenshot_url),
          };
        }
        return { ...fallbackByKey, ...fallback, ...current };
      })
    : fallbackFindings;

  const rawQuickWinsTable = asArray(report.quick_wins_table);
  const rawQuickWins = asArray(report.quick_wins);
  const fallbackQuickWinsSource =
    asArray(report.all_improvements).length
      ? asArray(report.all_improvements)
      : bucketDerivedImprovements.length
        ? bucketDerivedImprovements
      : normalizeStringList(rawExecutiveSummary.top_3_quick_wins).map((item) => ({
          recommendation: item,
          finding: item,
        }));

  const mergedQuickWinsSource = rawQuickWinsTable.length
    ? rawQuickWinsTable
    : rawQuickWins.length
      ? rawQuickWins
      : fallbackQuickWinsSource;
  const fallbackRoadmap = deriveRoadmapFromQuickWins(mergedQuickWinsSource);
  const enrichedCompetitorAnalysis = {
    ...competitorAnalysis,
    competitors: deriveCompetitorOpportunities(report),
  };

  return {
    reportId:
      asString(report.reportId) || asString(report.report_id) || asString(report.rid),
    generatedAt: asString(report.generated_at) || new Date().toISOString(),
    productName,
    productUrl,
    productType: asString(report.product_type) || asString(intake.product_type),
    primaryPlatform:
      asString(report.primary_platform) || asString(intake.primary_platform),
    auditReason,
    screenshot: getScreenshot(report, intake),
    auditType,
    isLimitedCoverage,
    isScoringUnavailable,
    hasPartialScoring,
    overallScore:
      asNumber(report.overall_score) !== null
        ? asNumber(report.overall_score)
        : hasPartialScoring
          ? Math.round(
              derivedScoring.bucketResults
                .filter((bucket) => asNumber(bucket.score) !== null)
                .reduce((sum, bucket, _, arr) => sum + (asNumber(bucket.score) ?? 0) / Math.max(1, arr.length), 0),
            )
          : null,
    overallHealth: isLimitedCoverage
      ? "Not scored"
      : isScoringUnavailable
        ? hasPartialScoring
          ? asString(report.overall_health) || "Provisional"
          : "Scoring unavailable"
        : asString(report.overall_health),
    overallRisk: isLimitedCoverage
      ? "Capture coverage insufficient"
      : isScoringUnavailable
        ? hasPartialScoring
          ? asString(report.overall_risk) || "Partial coverage"
          : "Scoring unavailable"
        : asString(report.overall_risk),
    captureCoverage,
    pillarScores:
      isLimitedCoverage || (isScoringUnavailable && !hasPartialScoring)
        ? {
            Delight: { score: null, evaluated: false },
            Impact: { score: null, evaluated: false },
            Accessibility: { score: null, evaluated: false },
          }
        : Object.fromEntries(
            Object.entries(getNestedRecord(report, "pillar_scores")).map(([key, value]) => {
              const rec = asRecord(value) ?? {};
              return [
                key,
                {
                  score: asNumber(rec.score),
                  evaluated: Boolean(rec.evaluated ?? true),
                },
              ];
            }),
          ),
    scorecard:
      shouldUseDerivedScorecard || !storedScorecard.length ? derivedScorecard : storedScorecard,
    bucketResults: derivedScoring.bucketResults,
    executiveSummary,
    sectionNarrative: {
      delight_narrative:
        (!narrativeLooksWeak(sanitizeDisplayText(derivePillarNarrativeSummary(report, "Delight")))
          ? sanitizeDisplayText(derivePillarNarrativeSummary(report, "Delight"))
          : "") ||
        (!narrativeLooksWeak(sanitizeNarrativeValue(sectionNarrative.delight_narrative))
          ? sanitizeNarrativeValue(sectionNarrative.delight_narrative)
          : "") ||
        sanitizeNarrativeValue(delightSummary.note) ||
        sanitizeNarrativeValue(delightSummary.assessment) ||
        sanitizeNarrativeValue(sectionNarrative.visual_hierarchy_layout) ||
        sanitizeNarrativeValue(legacyNarrative.delight_narrative) ||
        (fallbackDelightNarrative.length ? fallbackDelightNarrative.join("\n") : "") ||
        derivedDelightNarrative,
      impact_narrative:
        (!narrativeLooksWeak(sanitizeDisplayText(derivePillarNarrativeSummary(report, "Impact")))
          ? sanitizeDisplayText(derivePillarNarrativeSummary(report, "Impact"))
          : "") ||
        (!narrativeLooksWeak(sanitizeNarrativeValue(sectionNarrative.impact_narrative))
          ? sanitizeNarrativeValue(sectionNarrative.impact_narrative)
          : "") ||
        sanitizeNarrativeValue(impactSummary.note) ||
        sanitizeNarrativeValue(impactSummary.assessment) ||
        sanitizeNarrativeValue(legacyNarrative.overall_assessment) ||
        sanitizeNarrativeValue(combinedImpactNarrative) ||
        (fallbackImpactNarrative.length ? fallbackImpactNarrative.join("\n") : "") ||
        derivedImpactNarrative,
      accessibility_narrative:
        (!narrativeLooksWeak(sanitizeDisplayText(derivePillarNarrativeSummary(report, "Accessibility")))
          ? sanitizeDisplayText(derivePillarNarrativeSummary(report, "Accessibility"))
          : "") ||
        (!narrativeLooksWeak(sanitizeNarrativeValue(sectionNarrative.accessibility_narrative))
          ? sanitizeNarrativeValue(sectionNarrative.accessibility_narrative)
          : "") ||
        sanitizeNarrativeValue(accessibilitySummary.note) ||
        sanitizeNarrativeValue(accessibilitySummary.assessment) ||
        sanitizeNarrativeValue(sectionNarrative.accessibility_inclusivity) ||
        (fallbackAccessibilityNarrative.length ? fallbackAccessibilityNarrative.join("\n") : "") ||
        derivedAccessibilityNarrative,
    },
    findingsDetailed:
      isLimitedCoverage || (isScoringUnavailable && !hasPartialScoring)
        ? []
        : mergedFindingsSource.map(normalizedFinding),
    quickWinsTable:
      isLimitedCoverage || (isScoringUnavailable && !hasPartialScoring)
        ? []
        : uniqueSemanticList(
            mergedQuickWinsSource.map((item) => {
              const rec = normalizedQuickWin(item);
              return `${asString(rec.finding)}|||${asString(rec.recommendation)}|||${asString(rec.effort)}|||${asString(rec.estimated_time)}|||${asString(rec.bucket)}|||${asString(rec.impact)}`;
            }),
          ).map((value) => {
            const [finding, recommendation, effort, estimated_time, bucket, impact] = value.split("|||");
            return { finding, recommendation, effort, estimated_time, bucket, impact };
          }),
    roadmap: {
      week_1_2:
        isLimitedCoverage || isScoringUnavailable
          ? hasPartialScoring
            ? weekOneTwo.length
              ? weekOneTwo
              : fallbackRoadmap.week_1_2
            : captureCoverage.suggestedNextSteps.slice(0, 3)
          : weekOneTwo.length
            ? weekOneTwo
            : fallbackRoadmap.week_1_2,
      month_1:
        isLimitedCoverage
          ? []
          : isScoringUnavailable
            ? hasPartialScoring
              ? monthOne.length
                ? monthOne
                : fallbackRoadmap.month_1
              : []
            : monthOne.length
              ? monthOne
              : fallbackRoadmap.month_1,
      quarter_1:
        isLimitedCoverage
          ? []
          : isScoringUnavailable
            ? hasPartialScoring
              ? quarterOne.length
                ? quarterOne
                : fallbackRoadmap.quarter_1
              : []
            : quarterOne.length
              ? quarterOne
              : fallbackRoadmap.quarter_1,
    },
    closingNote:
      (isLimitedCoverage
        ? "This is a Limited Coverage Report. Capture the missing authenticated product screens, then re-run the audit before using scores or priorities."
        : isScoringUnavailable
          ? hasPartialScoring
            ? "This report contains usable scored sections, but some buckets remain unscored. Use the filled findings and roadmap as directional guidance, then re-run the missing buckets to finalize the scorecard."
            : "Evidence capture completed, but scoring did not finish successfully. Re-run the audit or switch models before using scores or priorities."
          : "") ||
      sanitizeDisplayText(asString(report.closing_note)) ||
      sanitizeDisplayText(asString(rawExecutiveSummary.overall_assessment)) ||
      `This audit reflects the captured evidence for ${productName}. Prioritize the clearest high-impact fixes first, then use the roadmap to sequence broader structural improvements.`,
    competitorAnalysis: enrichedCompetitorAnalysis,
  };
}
