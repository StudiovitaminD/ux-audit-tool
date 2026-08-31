import { QUESTION_BANK } from "@/lib/question-bank";
import { bucketPillarFromName, type AnyRecord } from "@/lib/report-model";
import { scoreQuestions } from "../../shared/ux-audit-scoring";

function asRecord(value: unknown): AnyRecord | null {
  return value && typeof value === "object" ? (value as AnyRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const PILLAR_MAP: Record<string, string> = {
  "Visual Feedback": "Accessibility",
  "Color & Contrast": "Accessibility",
  "Typography & Readability": "Accessibility",
  "Keyboard Navigation": "Accessibility",
  "Screen Reader Support": "Accessibility",
  "Navigation & Findability": "Impact",
  "Consistency & UI Patterns": "Impact",
  "Content (Impact)": "Impact",
  "Performance": "Impact",
  "Visual Consistency": "Delight",
  "Motion & Microinteractions": "Delight",
  "Content (Delight)": "Delight",
  "Brand Expression": "Delight",
  "Icons & Imagery": "Delight",
};

const CONTENT_IMPACT_QUESTION_IDS = new Set(
  (QUESTION_BANK["Content (Impact)"] ?? []).map((question) => asString(question.id)),
);
const CONTENT_DELIGHT_QUESTION_IDS = new Set(
  (QUESTION_BANK["Content (Delight)"] ?? []).map((question) => asString(question.id)),
);

function getHealth(score: number) {
  if (score >= 80) return { label: "Good", risk: "Low Risk", priority: "P3" };
  if (score <= 50) return { label: "Critical", risk: "Critical", priority: "P1" };
  return { label: "Average", risk: "Moderate", priority: "P2" };
}

function lookupQuestionOptions(bucketName: string, questionId: string) {
  const direct = QUESTION_BANK[bucketName] ?? [];
  const exact = direct.find((item) => item.id === questionId);
  if (exact?.options?.length) return exact.options;

  for (const items of Object.values(QUESTION_BANK)) {
    const found = items.find((item) => item.id === questionId);
    if (found?.options?.length) return found.options;
  }

  return [];
}

function buildFinding(question: AnyRecord, bucketName: string, severity: "Critical" | "High" | "Moderate") {
  return {
    question_id: asString(question?.id),
    question: asString(question?.question),
    mark: asNumber(question?.mark) ?? 3,
    evidence: asString(question?.evidence),
    observation: asString(question?.observation),
    recommendation: asString(question?.recommendation),
    effort: asString(question?.effort),
    impact: asString(question?.impact),
    confidence: asNumber(question?.confidence) ?? 0,
    severity,
    bucket: bucketName,
  };
}

function isLegacyGenericContentBucket(bucket: AnyRecord) {
  const bucketName = asString(bucket.bucket_name) || asString(bucket.section) || asString(bucket.bucket);
  const normalized = bucketName.toLowerCase();
  return normalized === "content" || normalized === "content & ux writing";
}

function splitLegacyContentBucket(bucket: AnyRecord) {
  if (!isLegacyGenericContentBucket(bucket)) return [bucket];

  const questions = asArray(bucket.questions)
    .map((item) => asRecord(item) ?? {})
    .filter((item) => Boolean(asString(item.id)));
  const impactQuestions: AnyRecord[] = [];
  const delightQuestions: AnyRecord[] = [];
  const unassignedQuestions: AnyRecord[] = [];

  for (const question of questions) {
    const questionId = asString(question.id);
    if (CONTENT_IMPACT_QUESTION_IDS.has(questionId)) {
      impactQuestions.push(question);
    } else if (CONTENT_DELIGHT_QUESTION_IDS.has(questionId)) {
      delightQuestions.push(question);
    } else {
      unassignedQuestions.push(question);
    }
  }

  const baseBucket = {
    ...bucket,
    bucket_name: "",
    section: "",
    bucket: "",
  };

  const splitBuckets: AnyRecord[] = [];
  if (impactQuestions.length || (!delightQuestions.length && unassignedQuestions.length)) {
    splitBuckets.push({
      ...baseBucket,
      bucket_name: "Content (Impact)",
      section: "Content (Impact)",
      pillar: "Impact",
      questions: [...impactQuestions, ...(!delightQuestions.length ? unassignedQuestions : [])],
    });
  }
  if (delightQuestions.length || (impactQuestions.length === 0 && unassignedQuestions.length)) {
    splitBuckets.push({
      ...baseBucket,
      bucket_name: "Content (Delight)",
      section: "Content (Delight)",
      pillar: "Delight",
      questions: [...delightQuestions, ...(impactQuestions.length ? unassignedQuestions : [])],
    });
  }

  if (splitBuckets.length === 1 && unassignedQuestions.length) {
    splitBuckets[0].questions = [...(splitBuckets[0].questions as AnyRecord[]), ...unassignedQuestions];
  } else if (splitBuckets.length === 2 && unassignedQuestions.length) {
    splitBuckets[0].questions = [...(splitBuckets[0].questions as AnyRecord[]), ...unassignedQuestions];
  }

  return splitBuckets.length ? splitBuckets : [bucket];
}

function isLimitedCoverageMode(report: AnyRecord) {
  const mode = asString(report.audit_mode);
  return (
    mode === "Limited Coverage Report" ||
    mode === "Limited Coverage Audit" ||
    asNumber(report.overall_score) === null
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

function uniqueList(items: string[], limit = 10) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const text = asString(item);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeInsightText(value: string) {
  return asString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPlaceholderText(value: unknown) {
  const text = asString(value).trim().toLowerCase();
  if (!text) return true;
  return /cannot be answered reliably|could not be scored|required screen or interaction was not captured|required evidence was not captured|not available|not captured/i.test(
    text,
  );
}

function questionOptions(bucketName: string, questionId: string) {
  const direct = QUESTION_BANK[bucketName] ?? [];
  const exact = direct.find((item) => item.id === questionId);
  if (exact?.options?.length) return exact.options;

  for (const items of Object.values(QUESTION_BANK)) {
    const found = items.find((item) => item.id === questionId);
    if (found?.options?.length) return found.options;
  }

  return [];
}

function bestQuestionText(bucketName: string, question: AnyRecord | null | undefined) {
  const rec = asRecord(question) ?? {};
  const selectedText = asString(rec.selected_option_text).replace(/^\s*\d+\.\s*/, "").trim();
  if (selectedText) return selectedText;

  const selectedMark = asNumber(rec.selected_option ?? rec.mark);
  const selectedState = asString(rec.selected_option_state || rec.answer_state);
  const option = questionOptions(bucketName, asString(rec.id)).find((item) => {
    if (selectedState && item.state === selectedState) return true;
    return item.mark === selectedMark;
  });
  if (option?.text) return option.text.trim();

  const observation = asString(rec.observation);
  if (observation && !isPlaceholderText(observation)) return observation;

  const recommendation = asString(rec.recommendation);
  if (recommendation && !isPlaceholderText(recommendation)) return recommendation;

  return asString(rec.evidence) || asString(rec.question);
}

function bestWorkingText(bucketName: string, question: AnyRecord | null | undefined) {
  const rec = asRecord(question) ?? {};
  const selectedText = asString(rec.selected_option_text).replace(/^\s*\d+\.\s*/, "").trim();
  if (selectedText && !isPlaceholderText(selectedText)) return selectedText;

  const selectedMark = asNumber(rec.selected_option ?? rec.mark);
  const selectedState = asString(rec.selected_option_state || rec.answer_state);
  const option = questionOptions(bucketName, asString(rec.id)).find((item) => {
    if (selectedState && item.state === selectedState) return true;
    return item.mark === selectedMark;
  });
  if (option?.text) return option.text.trim();

  return "";
}

function deriveQuestionInsights(bucketResults: AnyRecord[]) {
  const questions = bucketResults.flatMap((bucket) => {
    const bucketName = asString(bucket.bucket_name);
    return asArray(bucket.questions)
      .map((item) => asRecord(item))
      .filter((question): question is AnyRecord => Boolean(question))
      .map((question) => ({
        bucketName,
        mark: asNumber(question.mark ?? question.selected_option),
        answerStatus: asString(question.answer_status),
        answerState: asString(question.answer_state ?? question.selected_option_state),
        observation: bestQuestionText(bucketName, question),
        working: bestWorkingText(bucketName, question),
        recommendation: asString(question.recommendation) || bestQuestionText(bucketName, question),
        impact: asString(question.impact),
        effort: asString(question.effort),
      }))
      .filter((question) => question.mark !== null || Boolean(question.observation || question.recommendation));
  });

  const topProblems = uniqueList(
    questions
      .filter((question) => question.mark !== null && question.mark <= 0.5)
      .sort((left, right) => {
        if ((left.mark ?? 99) !== (right.mark ?? 99)) return (left.mark ?? 99) - (right.mark ?? 99);
        return impactRank(right.impact) - impactRank(left.impact);
      })
      .map((question) => `${question.bucketName}: ${question.observation}`),
    10,
  );

  const problemKeys = new Set(topProblems.map((item) => normalizeInsightText(item)));

  return {
    topProblems,
    whatsWorking: uniqueList(
      questions
        .filter((question) => (question.mark ?? 0) >= 1)
        .sort((left, right) => (right.mark ?? 0) - (left.mark ?? 0))
        .map((question) => `${question.bucketName}: ${question.working}`),
      10,
    ).filter((item) => !problemKeys.has(normalizeInsightText(item))),
    firstPriority: uniqueList(
      questions
        .filter((question) => question.mark !== null && question.mark <= 0.5)
        .sort((left, right) => {
          if (impactRank(left.impact) !== impactRank(right.impact)) {
            return impactRank(right.impact) - impactRank(left.impact);
          }
          if (effortRank(left.effort) !== effortRank(right.effort)) {
            return effortRank(left.effort) - effortRank(right.effort);
          }
          return (left.mark ?? 99) - (right.mark ?? 99);
        })
        .map((question) => `${question.bucketName}: ${question.recommendation || question.observation}`),
      10,
    ),
    quickWins: uniqueList(
      questions
        .filter((question) => question.mark !== null && question.mark > 0 && question.mark < 1)
        .filter((question) => effortRank(question.effort) <= 2 && impactRank(question.impact) >= 2)
        .sort((left, right) => {
          if (effortRank(left.effort) !== effortRank(right.effort)) {
            return effortRank(left.effort) - effortRank(right.effort);
          }
          return impactRank(right.impact) - impactRank(left.impact);
        })
        .map((question) => `${question.bucketName}: ${question.recommendation || question.observation}`),
      10,
    ),
  };
}

function deriveExecutiveSummary(report: AnyRecord, bucketResults: AnyRecord[], findings: AnyRecord[], improvements: AnyRecord[]) {
  const limitedCoverage = isLimitedCoverageMode(report);
  if (limitedCoverage) {
    return {
      ...(asRecord(report.executive_summary) ?? {}),
      one_line_verdict:
        "UX score was not calculated because the required product screens were not captured.",
      strongest_area: "Not scored",
      main_issue: "Capture coverage insufficient",
      top_problems: [],
      top_3_problems: [],
      first_priority: [
        "Capture an authenticated dashboard, navigation/context selectors, and at least three internal product screens before scoring.",
      ],
      quick_wins: [],
      top_3_quick_wins: [],
      whats_working: [],
      what_works:
        "The audit stopped before reliable scoring because the evidence set was incomplete.",
      first_priority_recommendation:
        "Re-run the audit with guided capture steps, internal routes, or labeled authenticated screenshots.",
    };
  }

  const strongest = [...bucketResults].sort(
    (left, right) => (asNumber(right.score) ?? 0) - (asNumber(left.score) ?? 0),
  )[0];
  const weakest = [...bucketResults].sort(
    (left, right) => (asNumber(left.score) ?? 0) - (asNumber(right.score) ?? 0),
  )[0];

  const strongestText = strongest ? asString(strongest.bucket_name) : "";
  const weakestText = weakest ? asString(weakest.bucket_name) : "";
  const questionInsights = deriveQuestionInsights(bucketResults);

  const topProblems = findings
    .map((item) => {
      const severity = asString(item.severity);
      const question = asString(item.question);
      const bucket = asString(item.bucket);
      return question ? `${bucket}: ${question}${severity ? ` (${severity})` : ""}` : "";
    })
    .filter(Boolean);

  const quickWins = improvements
    .slice(0, 5)
    .map((item) => asString(item.recommendation) || asString(item.question))
    .filter(Boolean);

  const whatsWorking = [...bucketResults]
    .sort((left, right) => (asNumber(right.score) ?? 0) - (asNumber(left.score) ?? 0))
    .slice(0, 4)
    .map((bucket) => {
      const topImprovement = asRecord(asArray(bucket.improvements)[0]);
      const topFinding = asRecord(asArray(bucket.findings)[0]);
      return `${asString(bucket.bucket_name)}: ${
        asString(topImprovement?.recommendation) ||
        asString(topFinding?.observation) ||
        asString(bucket.health)
      }`;
    });

  return {
    ...(asRecord(report.executive_summary) ?? {}),
    one_line_verdict:
      `This audit shows ${strongestText || "the strongest area"} as the clearest current strength, while ${weakestText || "the weakest area"} needs the fastest UX attention.`,
    strongest_area: strongestText || questionInsights.whatsWorking[0] || "",
    main_issue: weakestText || questionInsights.topProblems[0] || "",
    top_problems: questionInsights.topProblems.length ? questionInsights.topProblems : topProblems,
    top_3_problems: (questionInsights.topProblems.length ? questionInsights.topProblems : topProblems).slice(0, 3),
    first_priority: questionInsights.firstPriority.length ? questionInsights.firstPriority : topProblems.slice(0, 5),
    quick_wins: questionInsights.quickWins.length ? questionInsights.quickWins : quickWins,
    top_3_quick_wins: (questionInsights.quickWins.length ? questionInsights.quickWins : quickWins).slice(0, 3),
    whats_working: questionInsights.whatsWorking.length ? questionInsights.whatsWorking : whatsWorking,
  };
}

function deriveSectionNarrative(bucketResults: AnyRecord[]) {
  const byPillar = (pillar: string) =>
    bucketResults.filter((bucket) => asString(bucket.pillar).toLowerCase() === pillar.toLowerCase());

  const narrativeFor = (pillar: string) => {
    const buckets = byPillar(pillar);
    if (!buckets.length) return "";
    const questionInsights = deriveQuestionInsights(buckets);
    const bucketNames = uniqueList(buckets.map((bucket) => asString(bucket.bucket_name)), 6);
    return [
      `${pillar} covers ${bucketNames.join(", ")}.`,
      questionInsights.whatsWorking.length
        ? `What is working: ${questionInsights.whatsWorking.slice(0, 3).join("\n")}`
        : "",
      questionInsights.topProblems.length
        ? `Main issues: ${questionInsights.topProblems.slice(0, 4).join("\n")}`
        : "",
      questionInsights.firstPriority.length
        ? `What to fix next: ${questionInsights.firstPriority.slice(0, 3).join("\n")}`
        : "",
    ].filter(Boolean).join("\n");
  };

  return {
    delight_narrative: narrativeFor("Delight"),
    impact_narrative: narrativeFor("Impact"),
    accessibility_narrative: narrativeFor("Accessibility"),
  };
}

export function recalculateEditedReport(reportInput: unknown): AnyRecord {
  const report = { ...(asRecord(reportInput) ?? {}) };
  const rawBuckets = asArray(report.bucket_results)
    .map((item) => asRecord(item) ?? {})
    .flatMap((bucket) => splitLegacyContentBucket(bucket));

  const bucketResults = rawBuckets.map((bucket) => {
    const bucketName =
      asString(bucket.bucket_name) || asString(bucket.section) || asString(bucket.bucket) || "Bucket";
    const pillar = asString(bucket.pillar) || PILLAR_MAP[bucketName] || "Impact";

    const questions = asArray(bucket.questions).map((item) => {
      const question = { ...(asRecord(item) ?? {}) };
      const answerStatus = asString(question.answer_status);
      const answerState = asString(question.answer_state || question.selected_option_state);
      const isScoringUnavailable = answerStatus === "scoring_unavailable";
      const isInsufficient =
        answerStatus === "insufficient_evidence" ||
        (asArray(question.missing_evidence).length > 0 &&
          asNumber(question.selected_option) === null &&
          asNumber(question.mark) === null) ||
        (asNumber(question.selected_option) === null &&
          asNumber(question.mark) === null &&
          !answerState &&
          !asString(question.recommendation) &&
          !asString(question.effort) &&
          !asString(question.impact));
      if (isScoringUnavailable) {
        return {
          ...question,
          id: asString(question.id),
          answer_status: "scoring_unavailable",
          selected_option: null,
          selected_option_text: "",
          mark: null,
          answer_state: "not_tested",
        };
      }
      if (isInsufficient) {
        return {
          ...question,
          id: asString(question.id),
          answer_status: "insufficient_evidence",
          selected_option: null,
          selected_option_text: "",
          mark: null,
          answer_state: "not_tested",
        };
      }
      const options = lookupQuestionOptions(bucketName, asString(question.id));
      const normalizedState = answerState || options.find((option) => option.score === asNumber(question.mark ?? question.selected_option))?.state || "not_tested";
      const selected = asNumber(question.mark ?? question.selected_option);
      const optionText =
        options.find((option) => option.state === normalizedState)?.text ||
        options.find((option) => option.mark === selected)?.text ||
        "";
      return {
        ...question,
        id: asString(question.id),
        selected_option: selected,
        selected_option_state: normalizedState,
        selected_option_text: optionText,
        mark: selected,
        answer_status: "answered",
        answer_state: normalizedState,
      };
    });

    const scoringUnavailable = asString(bucket.bucket_status) === "scoring_unavailable";
    const scoring = scoreQuestions(questions);
    const score = scoring.score;
    const enoughEvidence = !scoringUnavailable && score !== null;
    const totalMarks = score !== null ? scoring.total_marks : null;
    const maxMarks = score !== null ? scoring.max_marks : null;
    const health = score === null ? null : getHealth(score);

    const findings = questions
      .filter((question) => asString(question.answer_state) === "fail" || asString(question.answer_state) === "partial")
      .map((question) =>
        buildFinding(
          question,
          bucketName,
          asString(question.answer_state) === "fail" ? "Critical" : "High",
        ),
      );

    const improvements = questions
      .filter((question) => asString(question.answer_state) === "not_tested" || asString(question.answer_state) === "n_a")
      .map((question) => buildFinding(question, bucketName, "Moderate"));

    return {
      ...bucket,
      bucket_name: bucketName,
      pillar,
      questions,
      total_marks: enoughEvidence ? totalMarks : null,
      max_marks: enoughEvidence ? maxMarks : null,
      score,
      bucket_status: enoughEvidence
        ? "scored"
        : scoringUnavailable
          ? "scoring_unavailable"
          : "not_tested",
      health: health ? health.label : "Not scored",
      risk: health ? health.risk : scoringUnavailable ? "Scoring unavailable" : "Evidence missing",
      priority: health ? health.priority : asString(bucket.priority) || "P0",
      findings,
      improvements,
    };
  });

  const insufficientBuckets = bucketResults.filter(
    (bucket) => asString(bucket.bucket_status) === "insufficient_evidence",
  );
  const scoringUnavailableBuckets = bucketResults.filter(
    (bucket) => asString(bucket.bucket_status) === "scoring_unavailable",
  );
  const scoredBuckets = bucketResults.filter(
    (bucket) => asString(bucket.bucket_status) === "scored",
  );
  const totalQuestions = bucketResults.reduce(
    (sum, bucket) => sum + asArray(bucket.questions).length,
    0,
  );
  const scoreableQuestions = bucketResults.reduce(
    (sum, bucket) =>
      sum +
      asArray(bucket.questions).filter(
        (question) =>
          asString((asRecord(question) ?? {}).answer_status) === "answered" &&
          asNumber((asRecord(question) ?? {}).mark) !== null,
      ).length,
    0,
  );
  const limitedCoverage =
    insufficientBuckets.length > 0 ||
    (scoringUnavailableBuckets.length === 0 && scoredBuckets.length === 0) ||
    (totalQuestions > 0 && scoreableQuestions / totalQuestions < 0.6);
  const overallScore = !limitedCoverage && bucketResults.length
    ? Math.round(
        scoredBuckets.reduce((sum, bucket) => sum + (asNumber(bucket.score) ?? 0), 0) / scoredBuckets.length,
      )
    : null;
  const overall = overallScore === null ? null : getHealth(overallScore);
  const hasScoringFailure = scoringUnavailableBuckets.length > 0;

  const findings = bucketResults.flatMap((bucket) => asArray(bucket.findings).map((item) => asRecord(item) ?? {}));
  const improvements = bucketResults.flatMap((bucket) =>
    asArray(bucket.improvements).map((item) => asRecord(item) ?? {}),
  );

  const scorecard = bucketResults.map((bucket) => ({
    section: asString(bucket.bucket_name),
    score: asNumber(bucket.score) !== null ? `${asNumber(bucket.score)}/100` : "Not scored",
    health: asString(bucket.health),
    risk_level: asString(bucket.risk),
    risk: asString(bucket.risk),
    priority: asString(bucket.priority),
    pillar: bucketPillarFromName(asString(bucket.bucket_name), bucket.pillar),
  }));

  const pillarScores = Object.fromEntries(
    ["Delight", "Impact", "Accessibility"].map((pillar) => {
      const relevant = bucketResults.filter((bucket) => asString(bucket.pillar) === pillar);
      const relevantScored = relevant.filter(
        (bucket) => asString(bucket.bucket_status) === "scored",
      );
      const pillarScore = relevant.length
        ? relevantScored.length
        ? Math.round(
            relevantScored.reduce((sum, bucket) => sum + (asNumber(bucket.score) ?? 0), 0) / relevantScored.length,
          )
        : null
        : null;
      return [pillar, { score: pillarScore, evaluated: relevantScored.length > 0 }];
    }),
  );

  const quickWinsTable = improvements.map((item) => ({
    finding: asString(item.question),
    bucket: asString(item.bucket),
    recommendation: asString(item.recommendation) || asString(item.observation) || asString(item.question),
    effort: asString(item.effort) || "Medium",
    estimated_time:
      asString(item.estimated_time) ||
      (asString(item.effort).toLowerCase() === "small"
        ? "1–3 days"
        : asString(item.effort).toLowerCase() === "large"
          ? "2–6 weeks"
          : "1–2 weeks"),
  }));

  const roadmap = {
    week_1_2: quickWinsTable
      .filter((item) => asString(item.effort).toLowerCase() === "small")
      .map((item) => asString(item.recommendation))
      .filter(Boolean)
      .slice(0, 6),
    month_1: quickWinsTable
      .filter((item) => asString(item.effort).toLowerCase() === "medium")
      .map((item) => asString(item.recommendation))
      .filter(Boolean)
      .slice(0, 6),
    quarter_1: quickWinsTable
      .filter((item) => asString(item.effort).toLowerCase() === "large")
      .map((item) => asString(item.recommendation))
      .filter(Boolean)
      .slice(0, 6),
  };
  const overflowActions = quickWinsTable
    .map((item) => asString(item.recommendation))
    .filter(
      (item) =>
        Boolean(item) &&
        !roadmap.week_1_2.includes(item) &&
        !roadmap.month_1.includes(item) &&
        !roadmap.quarter_1.includes(item),
    );
  while (roadmap.week_1_2.length < 3 && overflowActions.length) roadmap.week_1_2.push(overflowActions.shift() as string);
  while (roadmap.month_1.length < 3 && overflowActions.length) roadmap.month_1.push(overflowActions.shift() as string);
  while (roadmap.quarter_1.length < 3 && overflowActions.length) roadmap.quarter_1.push(overflowActions.shift() as string);

  const pBuckets = (priority: string) =>
    bucketResults
      .filter((bucket) => asString(bucket.priority) === priority)
      .map((bucket) => asString(bucket.bucket_name))
      .filter(Boolean);

  const nextReport: AnyRecord = {
    ...report,
    overall_score: overallScore,
    overall_health: overall ? overall.label : "Not scored",
    overall_risk: overall
      ? overall.risk
      : hasScoringFailure
        ? "Scoring unavailable"
        : "Capture coverage insufficient",
    audit_mode: limitedCoverage
      ? "Limited Coverage Report"
      : hasScoringFailure
        ? "Provisional UX Audit"
      : asString(report.audit_mode) === "Provisional UX Audit" || asString(report.coverage_status) === "usable_coverage"
        ? "Provisional UX Audit"
        : "Full UX Audit",
    pillar_scores: pillarScores,
    scorecard,
    bucket_results: bucketResults,
    findings_detailed: findings,
    top_5_findings: findings.slice(0, 5),
    all_findings: findings,
    all_improvements: improvements,
    quick_wins_table: quickWinsTable,
    quick_wins: quickWinsTable.map((item) => item.recommendation),
    p1_buckets: pBuckets("P1"),
    p2_buckets: pBuckets("P2"),
    p3_buckets: pBuckets("P3"),
    p4_buckets: pBuckets("P4"),
    questions_scoreable: scoreableQuestions,
    questions_total: totalQuestions,
    section_narrative: deriveSectionNarrative(bucketResults),
    roadmap,
    closing_note:
      "You’ve got a strong starting point — begin with the immediate actions, then build on them with the medium-effort and structural improvements over the next sprint cycle to keep momentum moving in the right direction.",
  };

  nextReport.executive_summary = deriveExecutiveSummary(nextReport, bucketResults, findings, improvements);

  return nextReport;
}

export function updateReportAnswer(
  reportInput: unknown,
  bucketName: string,
  questionId: string,
  selectedOption: number | string,
  userReason?: string,
  userEvidence?: string,
): AnyRecord {
  const report = { ...(asRecord(reportInput) ?? {}) };
  report.bucket_results = asArray(report.bucket_results).map((item) => {
    const bucket = { ...(asRecord(item) ?? {}) };
    const currentBucketName =
      asString(bucket.bucket_name) || asString(bucket.section) || asString(bucket.bucket);
    if (currentBucketName !== bucketName) return bucket;

    bucket.questions = asArray(bucket.questions).map((questionItem) => {
      const question = { ...(asRecord(questionItem) ?? {}) };
      if (asString(question.id) !== questionId) return question;
      const existingReason = asString(question.user_reason);
      const normalizedReason = typeof userReason === "string" ? userReason.trim() : existingReason;
      const existingEvidence = asString(question.user_evidence) || asString(question.evidence);
      const normalizedEvidence =
        typeof userEvidence === "string" ? userEvidence.trim() : existingEvidence;
      const answerState =
        typeof selectedOption === "string"
          ? selectedOption
          : selectedOption === 1
            ? "pass"
            : selectedOption === 0.5
              ? "partial"
              : selectedOption === 0
                ? "fail"
                : "";
      const numericSelected = typeof selectedOption === "number" ? selectedOption : null;
      return {
        ...question,
        answer_status: "answered",
        answer_state: answerState || asString(question.answer_state) || "not_tested",
        selected_option: numericSelected,
        selected_option_state: answerState || asString(question.selected_option_state) || "not_tested",
        mark: numericSelected,
        user_reason: normalizedReason,
        user_evidence: normalizedEvidence,
        observation: normalizedReason || asString(question?.observation),
        evidence: normalizedEvidence || "Manually selected by reviewer from the report editor.",
      };
    });

    return bucket;
  });

  return recalculateEditedReport(report);
}
