import type { ReportViewModel } from "@/lib/report-model";
import type { ReportPage } from "./shared";

function MethodologySection({ vm }: { vm: ReportViewModel }) {
  const method = vm.methodology;
  return (
    <div className="grid gap-5 text-sm text-[color:var(--ink)]">
      <p className="leading-6 text-[color:var(--muted)]">{method.framework}</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">Scope</div>
          <div className="mt-3 font-semibold">{method.selectedBuckets.length} selected buckets</div>
          <div className="mt-2 leading-6 text-[color:var(--muted)]">{method.selectedBuckets.join(" • ") || "No buckets recorded"}</div>
        </div>
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] p-5">
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">Coverage</div>
          <div className="mt-3 font-semibold">{method.questionsScoreable} of {method.questionsTotal} criteria scored</div>
          <div className="mt-2 text-[color:var(--muted)]">Capture status: {method.captureStatus}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] p-5">
        <div className="font-semibold">Evidence policy</div>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-6 text-[color:var(--muted)]">
          <li>Scores include only criteria supported by captured evidence.</li>
          <li>Interaction and accessibility claims require deterministic browser or DOM measurements.</li>
          <li>Screenshot-only observations are limited to visibly verifiable states.</li>
          <li>Missing evidence is reported as a testing limitation and does not reduce the score.</li>
        </ul>
      </div>
    </div>
  );
}

function EvidenceSection({ items }: { items: ReportViewModel["evidenceAppendix"] }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <article key={item.evidenceId} id={item.evidenceId} className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-mono text-xs font-semibold text-[color:var(--orange)]">{item.evidenceId}</div>
              <div className="mt-1 text-sm font-semibold">{item.bucket} · {item.questionId}</div>
            </div>
            <div className="rounded-full border border-[color:var(--cream-dark)] px-2 py-1 text-xs text-[color:var(--muted)]">{Math.round(item.confidence * 100)}% confidence</div>
          </div>
          <div className="mt-2 text-sm leading-5 text-[color:var(--muted)]">{item.observation || item.evidence || item.question}</div>
        </article>
      ))}
    </div>
  );
}

export function buildMethodologyEvidencePages(vm: ReportViewModel): ReportPage[] {
  const pages: ReportPage[] = [{ key: "methodology", title: "Methodology & Scope", variant: "standard", body: <MethodologySection vm={vm} /> }];
  const chunks: ReportViewModel["evidenceAppendix"][] = [];
  let current: ReportViewModel["evidenceAppendix"] = [];
  let currentSize = 0;
  for (const item of vm.evidenceAppendix) {
    const itemSize = (item.observation || item.evidence || item.question).length + 180;
    if (current.length && (current.length >= 4 || currentSize + itemSize > 1900)) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += itemSize;
  }
  if (current.length) chunks.push(current);
  for (let index = 0; index < chunks.length; index += 1) {
    pages.push({
      key: `evidence_appendix_${index + 1}`,
      title: "Evidence Appendix",
      showTitle: index === 0,
      variant: "standard",
      body: <EvidenceSection items={chunks[index]} />,
    });
  }
  return pages;
}
