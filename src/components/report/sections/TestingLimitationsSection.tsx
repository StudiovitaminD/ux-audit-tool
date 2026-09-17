import { asString, type AnyRecord } from "@/lib/report-model";
import type { ReportPage } from "./shared";

function TestingLimitationsSection({ limitations }: { limitations: AnyRecord[] }) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-[color:var(--muted)]">
        These criteria were not scored because the required evidence was unavailable. They are
        follow-up tests, not confirmed product defects.
      </p>
      {limitations.map((limitation, index) => (
        <article
          key={`${asString(limitation.bucket)}-${asString(limitation.question_id)}-${index}`}
          className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card)] p-5"
        >
          <div className="text-sm font-semibold text-[color:var(--ink)]">
            {asString(limitation.bucket) || "Audit criterion"}
          </div>
          {asString(limitation.question) ? (
            <div className="mt-2 text-sm text-[color:var(--ink)]">
              {asString(limitation.question)}
            </div>
          ) : null}
          <div className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            {asString(limitation.reason) || "The required evidence was not captured."}
          </div>
        </article>
      ))}
    </div>
  );
}

export function buildTestingLimitationsPages(limitations: AnyRecord[]): ReportPage[] {
  if (!limitations.length) return [];
  const chunks: AnyRecord[][] = [];
  let current: AnyRecord[] = [];
  let currentSize = 0;
  for (const limitation of limitations) {
    const itemSize = `${asString(limitation.question)} ${asString(limitation.reason)}`.length + 160;
    if (current.length && (current.length >= 4 || currentSize + itemSize > 1800)) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(limitation);
    currentSize += itemSize;
  }
  if (current.length) chunks.push(current);
  const pages: ReportPage[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const pageNumber = index;
    pages.push({
      key: `testing_limitations_${pageNumber + 1}`,
      title: "Testing Limitations",
      showTitle: pageNumber === 0,
      variant: "standard",
      body: <TestingLimitationsSection limitations={chunks[index]} />,
    });
  }
  return pages;
}
