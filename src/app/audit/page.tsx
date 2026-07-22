import { Suspense } from "react";
import { AuditForm } from "@/components/audit/audit-form";
import { AuditAccessPanel } from "@/components/account/access-panels";

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Run an Audit
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Fill in what you know—your AI audit gets better with richer context.
        </p>
      </div>

      <AuditAccessPanel />

      <Suspense>
        <AuditForm />
      </Suspense>
    </div>
  );
}
