import { getAdminFirestore } from "@/lib/firebase-admin";
import { parseStoredIntake } from "@/lib/intake-storage";
import { loadStoredIntake } from "@/lib/intake-storage.server";
import { bucketPillarFromName, normalizeCompetitorAnalysis } from "@/lib/report-model";

export const runtime = "nodejs";
export const maxDuration = 60;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function unwrapFirstItem(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  const parsed = tryParseJsonString(value);
  if (Array.isArray(parsed)) {
    if (parsed.length === 1) return unwrapFirstItem(parsed[0], depth + 1);
    const firstObject = parsed.find((item) => asRecord(item));
    return firstObject ? unwrapFirstItem(firstObject, depth + 1) : parsed[0] ?? parsed;
  }
  return parsed;
}

function tryParseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));
  if (!looksLikeJson) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function looksLikeReportRecord(value: Record<string, unknown>) {
  return (
    "overall_score" in value ||
    "product_name" in value ||
    "intake" in value ||
    "bucket_results" in value ||
    "scorecard" in value ||
    "executive_summary" in value ||
    "section_narrative" in value
  );
}

function unwrapReportPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  const parsed = tryParseJsonString(value);
  const rec = asRecord(parsed);
  if (!rec) return parsed;
  if (looksLikeReportRecord(rec)) return rec;
  if ("report" in rec) {
    const nested = unwrapReportPayload(rec.report, depth + 1);
    const nestedRec = asRecord(nested);
    if (nestedRec && looksLikeReportRecord(nestedRec)) return nestedRec;
    if (nestedRec) return nestedRec;
  }
  return rec;
}

function findReportId(value: unknown, depth = 0): string {
  if (depth > 6) return "";
  const parsed = tryParseJsonString(value);
  const rec = asRecord(parsed);
  if (!rec) return "";
  const direct =
    (typeof rec.reportId === "string" && rec.reportId) ||
    (typeof rec.rid === "string" && rec.rid) ||
    (typeof rec.report_id === "string" && rec.report_id) ||
    "";
  if (direct) return direct;
  if ("report" in rec) return findReportId(rec.report, depth + 1);
  return "";
}

function safeString(v: unknown) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

function stripUndefined<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue; // drop undefined keys
      out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}

function truncateStorageString(value: string, max = 4000) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function isInlineAsset(value: string) {
  return /^data:(image|video|application)\//i.test(value);
}

function slimStorageValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (isInlineAsset(value)) return "";
    if (key === "page_text" || key === "text_snippet") return truncateStorageString(value, 1200);
    if (key === "evidence" || key === "observation" || key === "why_it_matters") {
      return truncateStorageString(value, 450);
    }
    if (key === "recommendation" || key === "what_we_found") return truncateStorageString(value, 500);
    if (key === "question") return truncateStorageString(value, 260);
    if (key === "closing_note") return truncateStorageString(value, 1200);
    return value.length > 10_000 ? truncateStorageString(value, 10_000) : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => slimStorageValue(item, key));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (
        childKey === "all_findings" ||
        childKey === "all_improvements" ||
        childKey === "top_5_findings" ||
        childKey === "competitor_analysis_report" ||
        childKey === "competitorAnalysis" ||
        childKey === "findings" ||
        childKey === "improvements" ||
        childKey === "raw_html" ||
        childKey === "html" ||
        childKey === "markdown" ||
        childKey === "screenshots"
      ) {
        continue;
      }

      out[childKey] = slimStorageValue(childValue, childKey);
    }
    return out;
  }

  return value;
}

function slimReportForStorage(report: unknown) {
  return fitReportForFirestore(stripUndefined(slimStorageValue(report)) as Record<string, unknown>);
}

function jsonSize(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function compactQuestion(question: unknown) {
  const rec = asRecord(question) ?? {};
  return stripUndefined({
    id: rec.id,
    question: typeof rec.question === "string" ? truncateStorageString(rec.question, 180) : rec.question,
    answer_status: rec.answer_status,
    selected_option: rec.selected_option,
    mark: rec.mark,
    missing_evidence: Array.isArray(rec.missing_evidence)
      ? rec.missing_evidence.slice(0, 6)
      : rec.missing_evidence,
    evidence:
      typeof rec.evidence === "string" ? truncateStorageString(rec.evidence, 240) : rec.evidence,
    observation:
      typeof rec.observation === "string" ? truncateStorageString(rec.observation, 240) : rec.observation,
  });
}

function compactBucket(bucket: unknown) {
  const rec = asRecord(bucket) ?? {};
  return stripUndefined({
    bucket_name: rec.bucket_name,
    section: rec.section,
    pillar: rec.pillar,
    total_marks: rec.total_marks,
    max_marks: rec.max_marks,
    score: rec.score,
    bucket_status: rec.bucket_status,
    health: rec.health,
    risk: rec.risk,
    priority: rec.priority,
    questions: Array.isArray(rec.questions) ? rec.questions.map(compactQuestion) : [],
  });
}

function deriveScorecardFromBuckets(bucketResults: unknown[]) {
  return bucketResults
    .map((item) => asRecord(item) ?? {})
    .filter((bucket) => {
      const name =
        safeString(bucket.bucket_name) || safeString(bucket.section) || safeString(bucket.bucket);
      return Boolean(name);
    })
    .map((bucket) => {
      const score =
        typeof bucket.score === "number" && Number.isFinite(bucket.score) ? bucket.score : null;
      const bucketStatus =
        typeof bucket.bucket_status === "string" ? bucket.bucket_status : undefined;
      const notScored =
        bucketStatus === "insufficient_evidence" ||
        bucketStatus === "scoring_unavailable" ||
        score === null;
      const defaultRisk =
        bucketStatus === "scoring_unavailable" ? "Scoring unavailable" : "Evidence missing";
      return stripUndefined({
        section:
          safeString(bucket.section) ||
          safeString(bucket.bucket_name) ||
          safeString(bucket.bucket) ||
          "Bucket",
        score: notScored ? "Not scored" : `${score}/100`,
        health: notScored ? "Not scored" : safeString(bucket.health) || "Not scored",
        risk:
          notScored
            ? safeString(bucket.risk) || defaultRisk
            : safeString(bucket.risk) || "",
        priority: safeString(bucket.priority) || (notScored ? "P0" : ""),
        pillar: bucketPillarFromName(
          bucket.bucket_name || bucket.section || bucket.bucket,
          safeString(bucket.pillar),
        ),
      });
    });
}

function compactFinding(finding: unknown) {
  const rec = asRecord(finding) ?? {};
  return stripUndefined({
    id: rec.id,
    original_question_id: rec.original_question_id,
    finding_id: rec.finding_id,
    bucket: rec.bucket,
    severity: rec.severity,
    what_we_found:
      typeof rec.what_we_found === "string"
        ? truncateStorageString(rec.what_we_found, 360)
        : rec.what_we_found,
    why_it_matters:
      typeof rec.why_it_matters === "string"
        ? truncateStorageString(rec.why_it_matters, 360)
        : rec.why_it_matters,
    recommendation:
      typeof rec.recommendation === "string"
        ? truncateStorageString(rec.recommendation, 360)
        : rec.recommendation,
    acceptance_criteria: Array.isArray(rec.acceptance_criteria)
      ? rec.acceptance_criteria.slice(0, 3).map((item) =>
          typeof item === "string" ? truncateStorageString(item, 180) : item,
        )
      : [],
    screenshot_url: rec.screenshot_url,
  });
}

function compactCompetitorAnalysis(value: unknown) {
  const rec = asRecord(value);
  if (!rec) return value;
  return stripUndefined({
    competitors_count: rec.competitors_count,
    competitors: Array.isArray(rec.competitors)
      ? rec.competitors.map((competitor) => {
          const item = asRecord(competitor) ?? {};
          return {
            id: item.id,
            name: item.name,
            url: item.url,
            compare_focus:
              typeof item.compare_focus === "string"
                ? truncateStorageString(item.compare_focus, 220)
                : item.compare_focus,
            signals: item.signals,
            strengths: item.strengths,
            gaps: item.gaps,
            steal_this: item.steal_this,
            warning: item.warning,
          };
        })
      : [],
    matrix: rec.matrix,
  });
}

function fitReportForFirestore(report: Record<string, unknown>) {
  const output = { ...report };
  const targetBytes = 850_000;

  delete output.evidence;
  delete output.captureDebug;
  delete output.debug;
  delete output.form_payload;
  delete output.raw_html;
  delete output.html;
  delete output.markdown;

  if (jsonSize(output) <= targetBytes) return output;

  if (Array.isArray(output.bucket_results)) {
    output.bucket_results = output.bucket_results.map(compactBucket);
  }
  if (Array.isArray(output.findings_detailed)) {
    output.findings_detailed = output.findings_detailed.map(compactFinding);
  }
  output.competitor_analysis = compactCompetitorAnalysis(output.competitor_analysis);

  if (jsonSize(output) <= targetBytes) return output;

  if (Array.isArray(output.bucket_results)) {
    output.bucket_results = output.bucket_results.map((bucket) => {
      const rec = asRecord(bucket) ?? {};
      return {
        ...rec,
        questions: Array.isArray(rec.questions) ? rec.questions.slice(0, 6).map(compactQuestion) : [],
      };
    });
  }

  if (jsonSize(output) <= targetBytes) return output;

  if (Array.isArray(output.bucket_results)) {
    output.bucket_results = output.bucket_results.map((bucket) => {
      const rec = asRecord(bucket) ?? {};
      const compactedQuestions = Array.isArray(rec.questions)
        ? rec.questions.slice(0, 3).map(compactQuestion)
        : [];
      return { ...rec, questions: compactedQuestions };
    });
  }

  return output;
}

// n8n returns a "flat" report object; the PPTX + UI expect a canonical shape:
// report.intake + report.bucket_results + report.scorecard + report.narrative.
async function normalizeReport(payload: unknown, existingDoc?: Record<string, unknown> | null) {
  const rec = asRecord(payload) ?? {};
  const [existingIntake, existingReportIntake] = await Promise.all([
    loadStoredIntake(existingDoc ?? null),
    loadStoredIntake(asRecord(existingDoc?.report) ?? null),
  ]);
  const existingReport = asRecord(existingDoc?.report) ?? {};
  const existingIntakeRecord = existingIntake ?? {};
  const existingReportIntakeRecord = existingReportIntake ?? {};
  const existingFormPayload =
    asRecord(existingDoc?.form_payload) ??
    asRecord(existingIntakeRecord.form_payload) ??
    asRecord(existingReport?.form_payload) ??
    asRecord(existingReportIntakeRecord.form_payload) ??
    null;
  const fallbackIntake = {
    ...existingReportIntakeRecord,
    ...existingIntakeRecord,
  };

  // intake: accept nested or build from flat fields
  const intake =
    parseStoredIntake(rec.intake_json) ??
    parseStoredIntake(rec.intake) ??
    ({
      product_name: safeString(rec.product_name || fallbackIntake.product_name),
      product_url: safeString(rec.product_url || fallbackIntake.product_url),
      product_type: safeString(rec.product_type || fallbackIntake.product_type),
      primary_platform: safeString(rec.primary_platform || fallbackIntake.primary_platform),
      audit_goal: rec.audit_goal ?? fallbackIntake.audit_goal ?? [],
      audit_flows: rec.audit_flows ?? fallbackIntake.audit_flows ?? [],
      selected_buckets: rec.selected_buckets ?? fallbackIntake.selected_buckets ?? [],
      competitors: safeString(rec.competitors || fallbackIntake.competitors),
      differentiation: safeString(rec.differentiation || fallbackIntake.differentiation),
      known_problem: safeString(rec.known_problem || fallbackIntake.known_problem),
      success_metric: safeString(rec.success_metric || fallbackIntake.success_metric),
      who_implements: safeString(rec.who_implements || fallbackIntake.who_implements),
      primary_user: safeString(rec.primary_user || fallbackIntake.primary_user),
      primary_user_goal: safeString(rec.primary_user_goal || fallbackIntake.primary_user_goal),
    } as Record<string, unknown>);
  if (existingFormPayload && !("form_payload" in intake)) {
    intake.form_payload = existingFormPayload;
  }

  // bucket results: accept either `bucket_results` or `bucketResults`, otherwise preserve existing
  const bucket_results =
    (Array.isArray(rec.bucket_results) ? rec.bucket_results : null) ??
    (Array.isArray(rec.bucketResults) ? rec.bucketResults : null) ??
    (Array.isArray(existingReport.bucket_results) ? existingReport.bucket_results : null) ??
    (Array.isArray(existingDoc?.bucketResults) ? existingDoc.bucketResults : null) ??
    [];

  // scorecard: accept either `scorecard`, otherwise preserve existing
  const scorecard =
    (Array.isArray(rec.scorecard) ? rec.scorecard : null) ??
    (Array.isArray(bucket_results) && bucket_results.length
      ? deriveScorecardFromBuckets(bucket_results)
      : null) ??
    (Array.isArray(existingReport.scorecard) ? existingReport.scorecard : null) ??
    (Array.isArray(existingDoc?.scorecard) ? existingDoc.scorecard : null) ??
    [];

  // Narrative mapping (best-effort) for PPTX export.
  const exec = asRecord(rec.executive_summary) ?? {};
  const section = asRecord(rec.section_narrative) ?? {};
  const quickWinsTable = Array.isArray(rec.quick_wins_table) ? rec.quick_wins_table : [];
  const findingsDetailed = Array.isArray(rec.findings_detailed) ? rec.findings_detailed : [];

  const narrative = {
    executive_summary: safeString(exec.one_line_verdict || exec.what_works || rec.closing_note),
    overall_assessment: safeString(
      section.impact_narrative || section.delight_narrative || section.accessibility_narrative,
    ),
    top_risks: Array.isArray(exec.top_3_problems) ? exec.top_3_problems : [],
    quick_wins: quickWinsTable.map((q: unknown) => {
      const qrec = asRecord(q) ?? {};
      return { title: safeString(qrec.recommendation || qrec.finding || "") };
    }),
    recommendations: findingsDetailed.slice(0, 10).map((f: unknown, i: number) => {
      const frec = asRecord(f) ?? {};
      return {
        priority: safeString(frec.priority_tier || `P${i + 1}`),
        title: safeString(frec.recommendation || frec.what_we_found || ""),
      };
    }),
    per_bucket_notes: [],
  };

  const competitor_analysis = normalizeCompetitorAnalysis(
    rec.competitor_analysis,
    rec.competitorAnalysis,
    rec.competitor_analysis_report,
    rec,
  );

  return slimReportForStorage({
    ...existingReport,
    ...rec,
    form_payload: asRecord(rec.form_payload) ?? existingFormPayload,
    product_name: safeString(rec.product_name || existingReport.product_name || intake.product_name),
    product_url: safeString(rec.product_url || existingReport.product_url || intake.product_url),
    product_type: safeString(rec.product_type || existingReport.product_type || intake.product_type),
    primary_platform: safeString(
      rec.primary_platform || existingReport.primary_platform || intake.primary_platform,
    ),
    competitors: safeString(rec.competitors || existingReport.competitors || intake.competitors),
    differentiation: safeString(
      rec.differentiation || existingReport.differentiation || intake.differentiation,
    ),
    known_problem: safeString(
      rec.known_problem || existingReport.known_problem || intake.known_problem,
    ),
    success_metric: safeString(
      rec.success_metric || existingReport.success_metric || intake.success_metric,
    ),
    who_implements: safeString(
      rec.who_implements || existingReport.who_implements || intake.who_implements,
    ),
    intake,
    scorecard,
    bucket_results,
    audit_mode: rec.audit_mode ?? existingReport.audit_mode ?? existingDoc?.audit_mode,
    coverage_status: rec.coverage_status ?? existingReport.coverage_status ?? existingDoc?.coverage_status,
    ux_score_eligible:
      rec.ux_score_eligible ?? existingReport.ux_score_eligible ?? existingDoc?.ux_score_eligible,
    questions_scoreable:
      rec.questions_scoreable ?? existingReport.questions_scoreable ?? existingDoc?.questions_scoreable,
    questions_total:
      rec.questions_total ?? existingReport.questions_total ?? existingDoc?.questions_total,
    narrative,
    competitor_analysis,
  });
}

export async function POST(req: Request) {
  try {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (secret) {
      const header = req.headers.get("x-audit-secret") || "";
      if (header !== secret) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsedRaw = unwrapFirstItem(raw);
    const body = asRecord(parsedRaw) ?? {};

    const unwrappedReport = unwrapReportPayload("report" in body ? body.report : body);
    const nestedReport = asRecord(unwrappedReport) ?? null;
    const reportId = findReportId(body) || findReportId(unwrappedReport) || "";
    const error =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : null;
    const reportRaw = nestedReport ?? ("report" in body ? body.report : body); // allow either {reportId, report} or direct report payload

    if (!reportId) {
      return Response.json({ error: "Missing reportId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection("ux_audits").doc(reportId);
    const snap = await ref.get();
    const existingData = snap.exists ? (asRecord(snap.data()) ?? {}) : {};
    const report = await normalizeReport(reportRaw, existingData);
    const now = new Date().toISOString();
    // If the job doc wasn't created via `/api/audit` (e.g. n8n triggered directly),
    // create it on callback so the report page can still render.
    if (!snap.exists) {
      await ref.set(
        {
          createdAt: now,
          status: "processing",
          source: "callback",
        },
        { merge: true },
      );
    }

    // UPDATED: allow n8n to mark the job as error (so frontend can show it).
    if (error) {
      await ref.set(
        {
          status: "error",
          error,
          failedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      return Response.json({ ok: true, status: "error" });
    }

    await ref.set(
      {
        createdAt: safeString(existingData.createdAt) || now,
        status: "complete",
        completedAt: now,
        reportId,
        rid: reportId,
        report_id: reportId,
        report,
      },
    );

    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Callback failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
