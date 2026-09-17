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
    return { status: "confirmed" as const, text: `${measured.semantics.landmarks} landmarks; ${measured.semantics.unlabeledControls} unlabeled controls; ${measured.semantics.imagesMissingAlt} images missing alt text.` };
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

export function attachEvidenceDepth(bundle: EvidenceBundle, plan: EvidencePlan): EvidenceBundle {
  const pages = bundle.pages || [];
  const screenshot = bundle.screenshots?.find((shot) => shot.isValidAuditEvidence !== false);
  const records: EvidenceRecord[] = [];
  for (const requirement of plan.requirements) {
    for (const kind of requirement.kinds) {
      const page = pages[0];
      const result = page
        ? pageObservation(page, kind)
        : kind === "screenshot" && screenshot
          ? { status: "inconclusive" as const, text: "Uploaded screenshot evidence is available for visual inspection only." }
          : { status: "blocked" as const, text: "No page evidence was captured." };
      records.push({
        evidenceId: `ev-${requirement.questionId.toLowerCase()}-${kind.replaceAll("_", "-")}`,
        bucketId: requirement.bucketId,
        questionId: requirement.questionId,
        kind,
        pageUrl: page?.url || "",
        viewport: page?.viewport,
        testMethod: result.status === "confirmed" ? "deterministic_browser_measurement" : kind === "screenshot" ? "visual_capture" : "not_executed",
        observedAt: page?.capturedAt || plan.generatedAt,
        status: result.status,
        observation: result.text,
        screenshotUrl: kind === "screenshot" ? screenshot?.url : undefined,
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
  const coverage = confirmed.length / records.length;
  return Math.min(1, Number((coverage * (measured ? 0.95 : 0.65)).toFixed(2)));
}
