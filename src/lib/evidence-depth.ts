import type { EvidenceBundle, EvidencePage } from "@/lib/evidence-collector";
import { QUESTION_BANK } from "@/lib/question-bank";

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
  | "reduced_motion"
  | "performance";

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

function requirementKinds(bucket: string, question: string): EvidenceKind[] {
  const text = `${bucket} ${question}`.toLowerCase();
  if (/performance|load|latency|responsive time|speed/.test(text)) return ["performance", "responsive"];
  if (/contrast|colour|color/.test(text)) return ["contrast", "screenshot"];
  if (/keyboard|focus|tab order/.test(text)) return ["keyboard", "dom"];
  if (/screen reader|semantic|aria|alternative text|alt text/.test(text)) return ["accessibility_tree", "dom"];
  if (/zoom|reflow|readability|typography/.test(text)) return ["zoom", "responsive", "screenshot"];
  if (/motion|animation|microinteraction/.test(text)) return ["reduced_motion", "screenshot"];
  if (/error|success|feedback|status|validation|form/.test(text)) return ["form_state", "dom", "screenshot"];
  if (/navigation|findability|menu/.test(text)) return ["dom", "keyboard", "screenshot"];
  return ["content", "screenshot"];
}

export function buildEvidencePlan(selectedBuckets: string[]): EvidencePlan {
  const requirements = selectedBuckets.flatMap((bucket) =>
    (QUESTION_BANK[bucket] || []).map((question) => ({
      bucketId: bucket,
      questionId: question.id,
      kinds: requirementKinds(bucket, question.question),
    })),
  );
  return { generatedAt: new Date().toISOString(), requirements };
}

function pageObservation(page: EvidencePage, kind: EvidenceKind) {
  const measured = page.deterministic;
  if (kind === "performance" && measured?.performance?.tested) {
    return { status: "confirmed" as const, text: `Navigation ${measured.performance.domContentLoadedMs}ms; load ${measured.performance.loadMs}ms; ${measured.performance.requestCount} resources.` };
  }
  if (kind === "contrast" && measured?.contrast?.tested) {
    return { status: "confirmed" as const, text: `${measured.contrast.samplesTested} visible text samples checked; ${measured.contrast.failures} failed the computed contrast threshold.` };
  }
  if (kind === "keyboard" && measured?.keyboard?.tested) {
    return { status: "confirmed" as const, text: `${measured.keyboard.focusableCount} focusable controls found; visible focus observed on ${measured.keyboard.visibleFocusCount} tab stops.` };
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
    return { status: "confirmed" as const, text: `${measured.forms.formCount} forms; ${measured.forms.requiredFields} required fields; ${measured.forms.unlabeledFields} unlabeled fields; ${measured.forms.statusRegions} status regions.` };
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
    };
  }
  if (kind === "keyboard" && deterministic.keyboard?.tested) {
    return {
      focusableCount: deterministic.keyboard.focusableCount,
      visibleFocusCount: deterministic.keyboard.visibleFocusCount,
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

export function attachEvidenceDepth(bundle: EvidenceBundle, plan: EvidencePlan): EvidenceBundle {
  const pages = bundle.pages || [];
  const screenshots = (bundle.screenshots || []).filter((shot) => shot.isValidAuditEvidence !== false);
  const records: EvidenceRecord[] = [];
  for (const requirement of plan.requirements) {
    for (const kind of requirement.kinds) {
      // Two representative pages preserve cross-page proof without overflowing the report document.
      const sources = pages.length ? pages.slice(0, 2) : [null];
      sources.forEach((page, pageIndex) => {
        const screenshot = screenshots[pageIndex] || screenshots[0];
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
          testMethod: kind === "screenshot" ? "visual_capture" : result.status === "confirmed" ? "deterministic_browser_measurement" : "not_executed",
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
  return { ...bundle, evidencePlan: plan, evidenceRecords: records };
}

export function questionEvidence(bundle: EvidenceBundle | null, bucket: string, questionId: string) {
  return (bundle?.evidenceRecords || []).filter((record) => record.bucketId === bucket && record.questionId === questionId);
}

export function evidenceConfidence(records: EvidenceRecord[]) {
  if (!records.length) return 0;
  const confirmed = records.filter((record) => record.status === "confirmed");
  if (!confirmed.length) return 0;
  const measured = confirmed.filter((record) => record.testMethod === "deterministic_browser_measurement").length;
  const visual = confirmed.filter((record) => record.testMethod === "visual_capture").length;
  const coverage = confirmed.length / records.length;
  const reliability = measured ? 0.95 : visual ? 0.75 : 0.65;
  return Math.min(1, Number((coverage * reliability).toFixed(2)));
}
