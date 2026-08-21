export const bucketRows = [
  {
    bucket: "Visual Feedback",
    pillar: "Accessibility",
    coverage: "Hover, click, loading, success, and error-state feedback",
  },
  {
    bucket: "Color & Contrast",
    pillar: "Accessibility",
    coverage: "Text contrast, color reliance, zoom, and legibility",
  },
  {
    bucket: "Typography & Readability",
    pillar: "Accessibility",
    coverage: "Type scale, scanability, spacing, and reading comfort",
  },
  {
    bucket: "Keyboard Navigation",
    pillar: "Accessibility",
    coverage: "Tab order, focus states, shortcuts, and keyboard-only use",
  },
  {
    bucket: "Screen Reader Support",
    pillar: "Accessibility",
    coverage: "Semantic HTML, ARIA, labels, alt text, announcements, and a screen-reader capture",
  },
  {
    bucket: "Navigation & Findability",
    pillar: "Impact",
    coverage: "Menus, search, IA, breadcrumbs, and wayfinding",
  },
  {
    bucket: "Consistency & UI Patterns",
    pillar: "Impact",
    coverage: "Reusable components and predictable interaction patterns",
  },
  {
    bucket: "Content (Impact)",
    pillar: "Impact",
    coverage: "Messaging clarity, labels, microcopy, and content structure",
  },
  {
    bucket: "Performance",
    pillar: "Impact",
    coverage: "Load speed, runtime responsiveness, asset efficiency, and a mobile performance pass",
  },
  {
    bucket: "Visual Consistency",
    pillar: "Delight",
    coverage: "Shared styling, spacing rhythm, and cohesive presentation",
  },
  {
    bucket: "Motion & Microinteractions",
    pillar: "Delight",
    coverage: "Transitions, feedback motion, and small interaction flourishes",
  },
  {
    bucket: "Content (Delight)",
    pillar: "Delight",
    coverage: "Tone, personality, and emotionally resonant writing",
  },
  {
    bucket: "Brand Expression",
    pillar: "Delight",
    coverage: "Voice, visual personality, and distinctive identity cues",
  },
  {
    bucket: "Icons & Imagery",
    pillar: "Delight",
    coverage: "Icon clarity, illustration quality, and image support",
  },
] as const;

type BucketRow = (typeof bucketRows)[number];
type Pillar = BucketRow["pillar"];

const pillarOrder: Pillar[] = ["Accessibility", "Impact", "Delight"];

function groupRowsByPillar() {
  return pillarOrder.map((pillar) => ({
    pillar,
    rows: bucketRows.filter((row) => row.pillar === pillar),
  }));
}

export function BucketPicker({
  value,
  onChange,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}) {
  const selected = new Set(value);
  const groupedRows = groupRowsByPillar();

  function toggle(bucket: BucketRow["bucket"]) {
    const next = new Set(selected);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    onChange(Array.from(next));
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-[color:var(--card-border)]/60 bg-white/5">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[52px]" />
            <col className="w-[44%]" />
            <col className="w-[56%]" />
          </colgroup>
          <thead className="border-b border-[color:var(--card-border)]/60 text-xs uppercase tracking-wider text-[color:var(--muted)]">
            <tr>
              <th className="px-1 py-3 text-center">
                <span className="sr-only">Pillar</span>
              </th>
              <th className="px-4 py-4 pl-[46px] text-left">Bucket</th>
              <th className="px-4 py-4 text-left">What it covers</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--card-border)]/60">
            {groupedRows.flatMap(({ pillar, rows: pillarRows }) =>
              pillarRows.map((row, index) => {
                const isChecked = selected.has(row.bucket);
                return (
                  <tr
                    key={`${pillar}-${row.bucket}`}
                    onClick={() => toggle(row.bucket)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggle(row.bucket);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isChecked}
                    className={[
                      "group cursor-pointer transition-colors",
                      isChecked ? "bg-[color:var(--cream)]/40" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    {index === 0 ? (
                      <td
                        rowSpan={pillarRows.length}
                        className="border-r border-[color:var(--card-border)]/60 align-middle px-1 py-0 text-center"
                      >
                        <h4
                          className="mx-auto m-0 w-fit whitespace-nowrap text-center [writing-mode:vertical-rl] rotate-180 normal-case tracking-normal leading-none"
                          style={{ color: "var(--ink)", fontSize: "14px" }}
                        >
                          {pillar}
                        </h4>
                      </td>
                    ) : null}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-[10px]">
                        <span
                          className={[
                            "grid size-5 shrink-0 place-items-center rounded-md border text-[10px] transition-colors",
                            isChecked
                              ? "border-transparent bg-[color:var(--accent)] text-zinc-950"
                              : "border-[color:var(--card-border)] text-[color:var(--muted)]",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          {isChecked ? "✓" : ""}
                        </span>
                        <span className="text-[15px] font-medium text-[color:var(--ink)]">
                          {row.bucket.includes("Content") ? "Content" : row.bucket}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[15px] text-[color:var(--muted)]">
                      <span className="block max-w-full whitespace-normal break-words">
                        {row.coverage}
                      </span>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
      {error ? <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div> : null}
    </>
  );
}
