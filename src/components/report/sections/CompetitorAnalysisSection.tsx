import { asString, type AnyRecord } from "@/lib/report-model";
import { BulletList, SectionTitle } from "./shared";

export function CompetitorAnalysisSection({
  competitors,
}: { competitors: AnyRecord[] }) {
  if (!competitors.length) {
    return (
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 text-sm text-[color:var(--muted)]">
        Competitor analysis was not generated because no competitor inputs or comparison evidence were captured.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5">
        <div className="text-sm font-semibold">Competitor comparison snapshot</div>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Competitor</th>
                <th className="py-2 pr-4">Compare focus</th>
                <th className="py-2 pr-4">Positioning</th>
                <th className="py-2 pr-4">Primary CTA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--card-border)]/60">
              {competitors.map((competitor, index) => {
                const signals =
                  competitor && typeof competitor.signals === "object" && competitor.signals
                    ? (competitor.signals as Record<string, unknown>)
                    : {};
                return (
                  <tr key={`${asString(competitor.name)}-${index}`}>
                    <td className="py-3 pr-4 font-medium">
                      <div>{asString(competitor.name) || `Competitor ${index + 1}`}</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        {asString(competitor.url) || "—"}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-[color:var(--muted)]">
                      {asString(competitor.compare_focus) || "—"}
                    </td>
                    <td className="py-3 pr-4 text-[color:var(--muted)]">
                      {asString(competitor.positioning || signals.positioning) || "—"}
                    </td>
                    <td className="py-3 pr-4 font-medium">
                      {asString(competitor.primary_cta || signals.primary_cta) || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {competitors.map((competitor, index) => (
          <div
            key={`${asString(competitor.name)}-card-${index}`}
            className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
          >
            {(() => {
              return (
                <>
            {asString(competitor.screenshot) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asString(competitor.screenshot)}
                alt={`${asString(competitor.name)} screenshot`}
                className="mb-4 h-40 w-full rounded-xl border border-[color:var(--card-border)] object-cover"
              />
            ) : (
              <div className="mb-4 flex h-40 w-full items-center justify-center rounded-xl border border-[color:var(--card-border)] bg-white/5 text-sm text-[color:var(--muted)]">
                Screenshot unavailable
              </div>
            )}
            <div className="text-sm font-semibold">
              {asString(competitor.name) || `Competitor ${index + 1}`}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wider text-[color:var(--muted)]">
              {asString(competitor.compare_focus) || "—"}
            </div>

            {asString(competitor.positioning) ? (
              <div className="mt-3 text-sm text-[color:var(--muted)]">
                <span className="font-medium text-[color:var(--ink)]">Positioning:</span>{" "}
                {asString(competitor.positioning)}
              </div>
            ) : null}

            {asString(competitor.primary_cta) ? (
              <div className="mt-2 text-sm text-[color:var(--muted)]">
                <span className="font-medium text-[color:var(--ink)]">Primary CTA:</span>{" "}
                {asString(competitor.primary_cta)}
              </div>
            ) : null}

            <div className="mt-4">
              <SectionTitle>Strengths</SectionTitle>
              <BulletList
                items={Array.isArray(competitor.strengths) ? competitor.strengths : []}
                emptyLabel="No strengths captured."
              />
            </div>

            <div className="mt-4">
              <SectionTitle>Gaps</SectionTitle>
              <BulletList
                items={Array.isArray(competitor.gaps) ? competitor.gaps : []}
                emptyLabel="No gaps captured."
              />
            </div>

            <div className="mt-4">
              <SectionTitle>Steal this</SectionTitle>
              <BulletList
                items={Array.isArray(competitor.steal_this) ? competitor.steal_this : []}
                emptyLabel="No takeaways captured."
              />
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
