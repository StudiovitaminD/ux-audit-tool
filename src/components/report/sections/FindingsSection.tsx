import { asString, type AnyRecord } from "@/lib/report-model";
import { FindingCard } from "./shared";

export function FindingsSection({ findings }: { findings: AnyRecord[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {findings.length ? (
        findings.map((finding, index) => (
          <FindingCard key={`${asString(finding.what_we_found)}-${index}`} finding={finding} />
        ))
      ) : (
        <div className="rounded-2xl border border-[color:var(--card-border)] bg-white/5 p-5 text-sm text-[color:var(--muted)]">
          No critical findings were captured.
        </div>
      )}
    </div>
  );
}
