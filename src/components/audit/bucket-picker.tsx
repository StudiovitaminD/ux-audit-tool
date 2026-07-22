import { Card } from "@/components/ui/card";

export type BucketKey =
  | "Navigation & Findability"
  | "Content & UX Writing"
  | "Visual Hierarchy & Layout"
  | "Accessibility & Inclusivity"
  | "Input, Errors & Validation"
  | "Feedback & System States"
  | "Consistency & UI Patterns"
  | "Product Optimisation";

type BucketRow = {
  bucket: BucketKey;
  pillar: "Impact" | "Delight" | "Accessibility";
};

const rows: BucketRow[] = [
  { bucket: "Navigation & Findability", pillar: "Impact" },
  { bucket: "Content & UX Writing", pillar: "Delight" },
  { bucket: "Visual Hierarchy & Layout", pillar: "Delight" },
  { bucket: "Accessibility & Inclusivity", pillar: "Accessibility" },
  { bucket: "Input, Errors & Validation", pillar: "Impact" },
  { bucket: "Feedback & System States", pillar: "Impact" },
  { bucket: "Consistency & UI Patterns", pillar: "Impact" },
  { bucket: "Product Optimisation", pillar: "Impact" },
];

function pillarClass(pillar: BucketRow["pillar"]) {
  if (pillar === "Impact") return "text-amber-300";
  if (pillar === "Delight") return "text-sky-300";
  return "text-rose-300";
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

  function toggle(bucket: BucketKey) {
    const next = new Set(selected);
    if (next.has(bucket)) next.delete(bucket);
    else next.add(bucket);
    onChange(Array.from(next));
  }

  return (
    <Card className="p-0">
      <div className="overflow-hidden rounded-2xl border border-[color:var(--card-border)]">
        <div className="grid grid-cols-12 bg-white/5 px-4 py-3 text-xs font-semibold tracking-wider text-[color:var(--muted)]">
          <div className="col-span-8 uppercase">Bucket</div>
          <div className="col-span-4 uppercase">Pillar</div>
        </div>
        <div className="divide-y divide-[color:var(--card-border)]">
          {rows.map((r) => {
            const isChecked = selected.has(r.bucket);
            return (
              <button
                type="button"
                key={r.bucket}
                onClick={() => toggle(r.bucket)}
                className={[
                  "grid w-full grid-cols-12 items-center px-4 py-3 text-left transition-colors",
                  "hover:bg-white/5",
                ].join(" ")}
              >
                <div className="col-span-8 flex items-center gap-3">
                  <span
                    className={[
                      "grid size-5 place-items-center rounded border text-xs",
                      isChecked
                        ? "border-transparent bg-[color:var(--accent)] text-zinc-950"
                        : "border-[color:var(--card-border)] text-[color:var(--muted)]",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {isChecked ? "✓" : ""}
                  </span>
                  <span className="text-sm font-semibold">{r.bucket}</span>
                </div>
                <div
                  className={[
                    "col-span-4 text-sm font-semibold",
                    pillarClass(r.pillar),
                  ].join(" ")}
                >
                  {r.pillar}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {error ? (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      ) : null}
    </Card>
  );
}
