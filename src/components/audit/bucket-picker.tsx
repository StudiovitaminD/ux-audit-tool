export type BucketKey =
  | "Navigation & Findability"
  | "Content & UX Writing"
  | "Visual Hierarchy & Layout"
  | "Accessibility & Inclusivity"
  | "Input, Errors & Validation"
  | "Feedback & System States"
  | "Consistency & UI Patterns"
  | "code optimisation";

type BucketRow = {
  bucket: BucketKey;
  pillar: "Impact" | "Delight" | "Accessibility";
  coverage: string;
};

const rows: BucketRow[] = [
  {
    bucket: "Navigation & Findability",
    pillar: "Impact",
    coverage: "Menus, search, IA, and wayfinding",
  },
  {
    bucket: "Content & UX Writing",
    pillar: "Delight",
    coverage: "Labels, microcopy, tone, and helper text",
  },
  {
    bucket: "Visual Hierarchy & Layout",
    pillar: "Delight",
    coverage: "Spacing, emphasis, alignment, and scanability",
  },
  {
    bucket: "Accessibility & Inclusivity",
    pillar: "Accessibility",
    coverage: "Contrast, keyboard support, and inclusive UX",
  },
  {
    bucket: "Input, Errors & Validation",
    pillar: "Accessibility",
    coverage: "Forms, validation, errors, and input feedback",
  },
  {
    bucket: "Feedback & System States",
    pillar: "Accessibility",
    coverage: "Loading, empty, success, and progress states",
  },
  {
    bucket: "Consistency & UI Patterns",
    pillar: "Impact",
    coverage: "Reusable components and consistent interaction patterns",
  },
  {
    bucket: "code optimisation",
    pillar: "Impact",
    coverage: "Performance, load time, and maintainability",
  },
];

const pillarOrder: BucketRow["pillar"][] = ["Accessibility", "Impact", "Delight"];

function pillarClass(pillar: BucketRow["pillar"]) {
  if (pillar === "Impact") return "text-amber-300";
  if (pillar === "Delight") return "text-sky-300";
  return "text-rose-300";
}

function groupRowsByPillar() {
  return pillarOrder.map((pillar) => ({
    pillar,
    rows: rows.filter((row) => row.pillar === pillar),
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

  function toggle(bucket: BucketKey) {
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
              <th className="px-4 py-4 text-left">Bucket</th>
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
                        <div className="mx-auto [writing-mode:vertical-rl] rotate-180 text-[8px] font-semibold uppercase tracking-[0.12em] leading-none text-[color:var(--muted)]">
                          {pillar}
                        </div>
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
                          {row.bucket}
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
