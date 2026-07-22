import type { SharedSectionProps } from "./shared";
import { BulletList } from "./shared";

function narrativePoints(value: string) {
  const text = String(value || "").trim();
  if (!text) return [];

  const normalized = text
    .replace(/\s+(What is working:|Main issues:|What to fix next:)/g, "\n$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  const parts = normalized
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((item) => {
      if (
        item.startsWith("What is working:") ||
        item.startsWith("Main issues:") ||
        item.startsWith("What to fix next:")
      ) {
        return item
          .split(/(?<=\.)\s+(?=[A-Z][a-z]+(?:\s*&\s*[A-Z][a-z]+)?\s*:)/g)
          .map((part) => part.trim())
          .filter(Boolean);
      }
      return [item];
    });

  return parts;
}

export function NarrativeSummarySection({ vm }: SharedSectionProps) {
  return (
    <div className="space-y-4">
      {[
        ["Delight", vm.sectionNarrative.delight_narrative],
        ["Impact", vm.sectionNarrative.impact_narrative],
        ["Accessibility", vm.sectionNarrative.accessibility_narrative],
      ].map(([title, text]) => (
        <div
          key={String(title)}
          className="print-avoid-break rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5"
        >
          <div className="text-sm font-semibold">{String(title)}</div>
          <BulletList items={narrativePoints(String(text || ""))} emptyLabel="Narrative not available." />
        </div>
      ))}
    </div>
  );
}
