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
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
              <tr>
                <th className="py-2 pr-4">Competitor</th>
                <th className="py-2 pr-4">Positioning</th>
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
                      {asString(competitor.positioning || signals.positioning) || "—"}
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
              const brandName = asString(competitor.name) || `Competitor ${index + 1}`;
              return (
                <>
                  <div className="relative mb-4 h-40 w-full overflow-hidden rounded-xl border border-[color:var(--card-border)] bg-white/5">
                    <div className="absolute left-3 top-3 z-10 rounded-full border border-[color:var(--card-border)] bg-white/90 px-3 py-1 text-xs font-semibold text-[color:var(--ink)] shadow-sm">
                      {brandName}
                    </div>
                    {asString(competitor.screenshot) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asString(competitor.screenshot)}
                        alt={`${brandName} screenshot`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-[color:var(--muted)]">
                        Screenshot unavailable
                      </div>
                    )}
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
