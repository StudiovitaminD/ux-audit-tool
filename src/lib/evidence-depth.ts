import type { EvidenceBundle, EvidencePage } from "@/lib/evidence-collector";
import { QUESTION_BANK } from "@/lib/question-bank";
import { criterionEvidenceKinds } from "@/lib/criterion-evidence-policy";

export type EvidenceKind =
  | "screenshot"
  | "content"
  | "dom"
  | "accessibility_tree"
  | "keyboard"
  | "form_state"
  | "contrast"
  | "responsive"
  | "zoom"
  | "text_spacing"
  | "interaction"
  | "reduced_motion"
  | "performance"
  | "lighthouse";

export type EvidenceRequirement = {
  bucketId: string;
  questionId: string;
  kinds: EvidenceKind[];
};

export type EvidenceRecord = {
  evidenceId: string;
  bucketId: string;
  questionId: string;
  kind: EvidenceKind;
  pageUrl: string;
  viewport?: string;
  testMethod: string;
  observedAt: string;
  status: "confirmed" | "inconclusive" | "blocked";
  observation: string;
  screenshotUrl?: string;
  measuredValues?: Record<string, number | string | boolean>;
};

export type EvidencePlan = {
  generatedAt: string;
  requirements: EvidenceRequirement[];
};

export function buildEvidencePlan(selectedBuckets: string[]): EvidencePlan {
  const requirements = selectedBuckets.flatMap((bucket) =>
    (QUESTION_BANK[bucket] || []).map((question) => ({
      bucketId: bucket,
      questionId: question.id,
      kinds: criterionEvidenceKinds(bucket, question.id, question.question),
    })),
  );
  return { generatedAt: new Date().toISOString(), requirements };
}

function pageObservation(page: EvidencePage, kind: EvidenceKind) {
  const targeted = page.targetedCheck;
  const targetedKindMatches = targeted?.kind === kind
    || (targeted?.kind === "motion" && kind === "reduced_motion")
    || (["zoom", "text_spacing"].includes(String(targeted?.kind)) && kind === "responsive");
  if (targeted?.tested && targetedKindMatches) {
    const details = Object.entries(targeted)
      .filter(([key, value]) => !["tested", "taskId", "kind", "method", "question", "pageUrl", "testedAt"].includes(key) && value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value).slice(0, 500) : String(value)}`)
      .join("; ");
    return { status: "confirmed" as const, text: `Targeted ${targeted.method || targeted.kind} check completed${details ? `; ${details}` : ""}.` };
  }
  const measured = page.deterministic;
  if (kind === "performance" && measured?.performance?.tested) {
    return { status: "confirmed" as const, text: `Navigation ${measured.performance.domContentLoadedMs}ms; load ${measured.performance.loadMs}ms; ${measured.performance.requestCount} resources.` };
  }
  if (kind === "contrast" && measured?.contrast?.tested) {
    const groups = measured.contrast;
    return { status: "confirmed" as const, text: `${groups.samplesTested} visible text samples checked; ${groups.failures} failed the computed contrast threshold. Normal text: ${JSON.stringify(groups.normalText || "not separately measured")}; large text: ${JSON.stringify(groups.largeText || "not separately measured")}. Text measurements do not test focus indicators, component boundaries, or hover states.` };
  }
  if (kind === "keyboard" && measured?.keyboard?.tested) {
    return { status: "confirmed" as const, text: `${measured.keyboard.focusableCount} focusable controls found; visible focus observed on ${measured.keyboard.visibleFocusCount} tab stops.` };
  }
  if (kind === "interaction" && measured?.interaction?.tested) {
    return { status: "confirmed" as const, text: `${measured.interaction.controlsTested} safe interactive controls were tested; ${measured.interaction.stateChanges} changed state and ${measured.interaction.activations} produced activation feedback.` };
  }
  if (kind === "responsive" && measured?.responsive?.tested) {
    return { status: "confirmed" as const, text: measured.responsive.horizontalOverflow ? "Horizontal overflow was measured." : "No horizontal overflow was measured at the captured viewport." };
  }
  if (kind === "zoom" && measured?.zoom?.tested) {
    return { status: "confirmed" as const, text: measured.zoom.horizontalOverflow ? `Horizontal overflow was measured at ${measured.zoom.scale * 100}% layout zoom.` : `No horizontal overflow was measured at ${measured.zoom.scale * 100}% layout zoom.` };
  }
  if (kind === "accessibility_tree" && measured?.semantics?.tested) {
    const axeText = measured.axe?.tested
      ? ` Axe found ${measured.axe.violations} rule violations (${measured.axe.critical} critical, ${measured.axe.serious} serious).`
      : "";
    return { status: "confirmed" as const, text: `${measured.semantics.landmarks} landmarks; ${measured.semantics.unlabeledControls} unlabeled controls; ${measured.semantics.imagesMissingAlt} images missing alt text.${axeText}` };
  }
  if (kind === "form_state" && measured?.forms?.tested) {
    const testedStates = (measured.forms.testedStates || []).filter((state) => ["validation_observed", "navigation_observed", "submitted"].includes(String(state.result))).slice(0, 3);
    const stateText = testedStates.length ? ` Outcomes: ${JSON.stringify(testedStates).slice(0, 1200)}.` : "";
    return { status: testedStates.length ? "confirmed" as const : "inconclusive" as const, text: `${measured.forms.formCount} forms; ${measured.forms.requiredFields} required fields; ${measured.forms.unlabeledFields} unlabeled fields; ${measured.forms.statusRegions} status regions.${stateText} Form inventory alone does not prove success, error, loading, or duplicate-submission behavior.` };
  }
  if (kind === "reduced_motion" && measured?.reducedMotion?.tested) {
    return { status: "confirmed" as const, text: `${measured.reducedMotion.animationsDetected} active animations detected; reduced-motion preference ${measured.reducedMotion.mediaQueryMatched ? "matched" : "not matched"}.` };
  }
  if (kind === "dom" || kind === "content") return { status: "confirmed" as const, text: `DOM and visible content captured from ${page.title || page.url}.` };
  if (kind === "screenshot") return { status: "inconclusive" as const, text: "Screenshot evidence is available for visual inspection only." };
  return { status: "blocked" as const, text: `${kind.replaceAll("_", " ")} was not deterministically tested.` };
}

function measuredValuesFor(
  page: EvidencePage | null,
  kind: EvidenceKind,
): Record<string, number | string | boolean> | undefined {
  const deterministic = page?.deterministic;
  if (!deterministic) return undefined;
  if (kind === "performance" && deterministic.performance?.tested) {
    return {
      domContentLoadedMs: deterministic.performance.domContentLoadedMs,
      loadMs: deterministic.performance.loadMs,
      requestCount: deterministic.performance.requestCount,
    };
  }
  if (kind === "contrast" && deterministic.contrast?.tested) {
    return {
      samplesTested: deterministic.contrast.samplesTested,
      failures: deterministic.contrast.failures,
      normalTextTested: deterministic.contrast.normalText?.tested ?? 0,
      normalTextFailures: deterministic.contrast.normalText?.failures ?? 0,
      largeTextTested: deterministic.contrast.largeText?.tested ?? 0,
      largeTextFailures: deterministic.contrast.largeText?.failures ?? 0,
    };
  }
  if (kind === "keyboard" && deterministic.keyboard?.tested) {
    return {
      focusableCount: deterministic.keyboard.focusableCount,
      visibleFocusCount: deterministic.keyboard.visibleFocusCount,
    };
  }
  if (kind === "interaction" && deterministic.interaction?.tested) {
    return {
      controlsTested: deterministic.interaction.controlsTested,
      stateChanges: deterministic.interaction.stateChanges,
      activations: deterministic.interaction.activations,
    };
  }
  if (kind === "responsive" && deterministic.responsive?.tested) {
    return { horizontalOverflow: deterministic.responsive.horizontalOverflow };
  }
  if (kind === "zoom" && deterministic.zoom?.tested) {
    return {
      scale: deterministic.zoom.scale,
      horizontalOverflow: deterministic.zoom.horizontalOverflow,
    };
  }
  if (kind === "accessibility_tree" && deterministic.semantics?.tested) {
    return {
      landmarks: deterministic.semantics.landmarks,
      unlabeledControls: deterministic.semantics.unlabeledControls,
      imagesMissingAlt: deterministic.semantics.imagesMissingAlt,
      headingOrderIssues: deterministic.semantics.headingOrderIssues,
      axeViolations: deterministic.axe?.violations ?? 0,
      axeCritical: deterministic.axe?.critical ?? 0,
      axeSerious: deterministic.axe?.serious ?? 0,
    };
  }
  if (kind === "form_state" && deterministic.forms?.tested) {
    return {
      formCount: deterministic.forms.formCount,
      requiredFields: deterministic.forms.requiredFields,
      unlabeledFields: deterministic.forms.unlabeledFields,
      statusRegions: deterministic.forms.statusRegions,
      testedStateCount: deterministic.forms.testedStates?.filter((state) => ["validation_observed", "navigation_observed", "submitted"].includes(String(state.result))).length || 0,
      validationStateCount: deterministic.forms.testedStates?.filter((state) => state.result === "validation_observed").length || 0,
      submissionStateCount: deterministic.forms.testedStates?.filter((state) => ["navigation_observed", "submitted"].includes(String(state.result))).length || 0,
    };
  }
  if (kind === "reduced_motion" && deterministic.reducedMotion?.tested) {
    return {
      animationsDetected: deterministic.reducedMotion.animationsDetected,
      mediaQueryMatched: deterministic.reducedMotion.mediaQueryMatched,
    };
  }
  return undefined;
}

function pageSupportsKind(page: EvidencePage, kind: EvidenceKind) {
  const measured = page.deterministic;
  if (kind === "performance") return measured?.performance?.tested === true;
  if (kind === "contrast") return measured?.contrast?.tested === true;
  if (kind === "keyboard") return measured?.keyboard?.tested === true;
  if (kind === "interaction") return measured?.interaction?.tested === true || (page.targetedCheck?.kind === "interaction" && page.targetedCheck.tested === true);
  if (kind === "responsive") return measured?.responsive?.tested === true;
  if (kind === "zoom") return measured?.zoom?.tested === true;
  if (kind === "accessibility_tree") return measured?.semantics?.tested === true;
  if (kind === "form_state") return measured?.forms?.tested === true && Boolean(measured.forms.testedStates?.some((state) => ["validation_observed", "navigation_observed", "submitted"].includes(String(state.result))));
  if (kind === "reduced_motion") return measured?.reducedMotion?.tested === true;
  if (kind === "text_spacing") return page.targetedCheck?.kind === "text_spacing" && page.targetedCheck.tested === true;
  return kind === "dom" || kind === "content" || kind === "screenshot";
}

export function attachEvidenceDepth(bundle: EvidenceBundle, plan: EvidencePlan): EvidenceBundle {
  const pages = bundle.pages || [];
  const screenshots = (bundle.screenshots || []).filter((shot) => shot.isValidAuditEvidence !== false);
  const records: EvidenceRecord[] = [];
  for (const requirement of plan.requirements) {
    for (const kind of requirement.kinds) {
      const taskId = `${requirement.bucketId}:${requirement.questionId}`;
      const targetedPages = pages.filter(
        (page) => page.targetedCheck?.taskId === taskId && pageSupportsKind(page, kind),
      );
      const measuredPages = pages.filter((page) => pageSupportsKind(page, kind));
      // Exact task evidence takes precedence, followed by pages that actually
      // contain the required measurement. Page order is not evidence quality.
      const sources = targetedPages.length
        ? targetedPages.slice(0, 2)
        : measuredPages.length
          ? measuredPages.slice(0, 2)
          : pages.length
            ? pages.slice(0, 2)
            : [null];
      sources.forEach((page, pageIndex) => {
        const screenshot = screenshots.find((item) => Boolean(page?.url) && item.pageUrl === page?.url)
          || screenshots.find((item) => Boolean(page) && (
            item.screenName === page?.title || item.title === page?.title || item.label === page?.label
          ))
          || screenshots[pageIndex]
          || screenshots[0];
        const result = page
          ? pageObservation(page, kind)
          : kind === "screenshot" && screenshot
            ? { status: "confirmed" as const, text: `Visual capture "${screenshot.label || "uploaded screenshot"}" is available for inspection.` }
            : { status: "blocked" as const, text: "No page evidence was captured." };
        const screenshotConfirmed = kind === "screenshot" && Boolean(screenshot?.url) && screenshot?.isValidAuditEvidence !== false;
        records.push({
          evidenceId: `ev-${requirement.questionId.toLowerCase()}-${kind.replaceAll("_", "-")}-p${pageIndex + 1}`,
          bucketId: requirement.bucketId,
          questionId: requirement.questionId,
          kind,
          pageUrl: page?.url || "",
          viewport: page?.viewport || screenshot?.viewport,
          testMethod: kind === "screenshot"
            ? "visual_capture"
            : page?.targetedCheck?.taskId === taskId && page.targetedCheck.tested === true
              ? "targeted_browser_measurement"
            : result.status === "confirmed" && ["dom", "content"].includes(kind)
              ? "captured_dom_context"
              : result.status === "confirmed"
                ? "deterministic_browser_measurement"
                : "not_executed",
          observedAt: page?.capturedAt || screenshot?.capturedAt || plan.generatedAt,
          status: screenshotConfirmed ? "confirmed" : result.status,
          observation: kind === "screenshot" && screenshot
            ? `${result.text} Screen: ${screenshot.screenName || screenshot.title || screenshot.label}; heading: ${screenshot.heading || "not captured"}; visible content: ${screenshot.visibleTextSummary || "not summarized"}.`
            : result.text,
          screenshotUrl: kind === "screenshot" ? screenshot?.url : undefined,
          measuredValues: measuredValuesFor(page, kind),
        });
      });
    }
  }
  records.push(...lighthouseEvidenceRecords(bundle, plan));
  return { ...bundle, evidencePlan: plan, evidenceRecords: records };
}

type LighthouseAudit = { score: number | null; numericValue?: number; displayValue?: string };

function lighthouseEvidenceRecords(bundle: EvidenceBundle, plan: EvidencePlan): EvidenceRecord[] {
  const lighthouse = bundle.debug?.lighthouse;
  if (!lighthouse || typeof lighthouse !== "object" || Array.isArray(lighthouse)) return [];
  const summary = lighthouse as { performance?: unknown; audits?: unknown };
  const rawAudits = summary.audits;
  if (!rawAudits || typeof rawAudits !== "object" || Array.isArray(rawAudits)) return [];
  const audits = rawAudits as Record<string, LighthouseAudit>;
  const page = bundle.pages?.[0];
  const observedAt = plan.generatedAt;
  const sourceUrl = page?.url || "";
  const toRecord = (bucketId: string, questionId: string, auditId: string, observation: string, measuredValues: EvidenceRecord["measuredValues"]): EvidenceRecord | null => {
    const audit = audits[auditId];
    if (!audit || typeof audit.score !== "number") return null;
    return {
      evidenceId: `ev-${questionId.toLowerCase()}-lighthouse`,
      bucketId,
      questionId,
      kind: "lighthouse",
      pageUrl: sourceUrl,
      testMethod: "lighthouse_audit",
      observedAt,
      status: "confirmed",
      observation,
      measuredValues,
    };
  };
  const status = (passes: boolean) => passes ? "passes" : "needs improvement";
  const lcp = audits["largest-contentful-paint"];
  const tbt = audits["total-blocking-time"];
  const cls = audits["cumulative-layout-shift"];
  const performance = typeof summary.performance === "number" ? summary.performance : null;
  const records = [
    lcp && toRecord("Performance", "PF01", "largest-contentful-paint", `Lighthouse Largest Contentful Paint: ${lcp.displayValue || "measured"}; ${status((lcp.numericValue ?? Infinity) <= 2500)} against the 2.5 s good threshold.`, { lcpMs: lcp.numericValue ?? "not reported", thresholdMs: 2500 }),
    tbt && toRecord("Performance", "PF02", "total-blocking-time", `Lighthouse Total Blocking Time: ${tbt.displayValue || "measured"}; ${status((tbt.numericValue ?? Infinity) <= 200)} against the 200 ms good threshold.`, { totalBlockingTimeMs: tbt.numericValue ?? "not reported", thresholdMs: 200 }),
    toRecord("Performance", "PF03", "uses-optimized-images", `Lighthouse image optimization audit ${status(audits["uses-optimized-images"]?.score === 1)}.`, { score: audits["uses-optimized-images"]?.score ?? "not reported" }),
    toRecord("Performance", "PF04", "unused-javascript", `Lighthouse unused JavaScript audit ${status(audits["unused-javascript"]?.score === 1)}.`, { score: audits["unused-javascript"]?.score ?? "not reported" }),
    toRecord("Performance", "PF05", "render-blocking-resources", `Lighthouse render-blocking resources audit ${status(audits["render-blocking-resources"]?.score === 1)}.`, { score: audits["render-blocking-resources"]?.score ?? "not reported" }),
    performance !== null
      ? {
          evidenceId: "ev-pf08-lighthouse",
          bucketId: "Performance",
          questionId: "PF08",
          kind: "lighthouse" as const,
          pageUrl: sourceUrl,
          testMethod: "lighthouse_audit",
          observedAt,
          status: "confirmed" as const,
          observation: `Lighthouse mobile performance category score: ${Math.round(performance * 100)}/100; ${status(performance >= 0.9)} against the 90/100 good threshold.`,
          measuredValues: { performanceScore: Math.round(performance * 100), threshold: 90 },
        }
      : null,
    cls && toRecord("Performance", "PF09", "cumulative-layout-shift", `Lighthouse Cumulative Layout Shift: ${cls.displayValue || "measured"}; ${status((cls.numericValue ?? Infinity) <= 0.1)} against the 0.1 good threshold.`, { cls: cls.numericValue ?? "not reported", threshold: 0.1 }),
    cls && toRecord("Performance", "PF10", "cumulative-layout-shift", `Lighthouse Cumulative Layout Shift: ${cls.displayValue || "measured"}; ${status((cls.numericValue ?? Infinity) <= 0.1)} against the 0.1 good threshold.`, { cls: cls.numericValue ?? "not reported", threshold: 0.1 }),
    toRecord("Color & Contrast", "CC01", "color-contrast", `Lighthouse text contrast audit ${status(audits["color-contrast"]?.score === 1)}. This is limited to automatically detectable text contrast violations.`, { score: audits["color-contrast"]?.score ?? "not reported" }),
    toRecord("Color & Contrast", "CC06", "color-contrast", `Lighthouse foreground/background contrast audit ${status(audits["color-contrast"]?.score === 1)}. This is limited to automatically detectable text contrast violations.`, { score: audits["color-contrast"]?.score ?? "not reported" }),
  ];
  return records.filter((record): record is EvidenceRecord => Boolean(record));
}

export function questionEvidence(bundle: EvidenceBundle | null, bucket: string, questionId: string) {
  return (bundle?.evidenceRecords || []).filter((record) => record.bucketId === bucket && record.questionId === questionId);
}

export function evidenceConfidence(records: EvidenceRecord[]) {
  if (!records.length) return 0;
  const confirmed = records.filter((record) => record.status === "confirmed");
  if (!confirmed.length) return 0;
  const measured = confirmed.filter((record) => ["deterministic_browser_measurement", "targeted_browser_measurement"].includes(record.testMethod)).length;
  const visual = confirmed.filter((record) => record.testMethod === "visual_capture").length;
  const coverage = confirmed.length / records.length;
  const reliability = measured ? 0.95 : visual ? 0.75 : 0.65;
  return Math.min(1, Number((coverage * reliability).toFixed(2)));
}
