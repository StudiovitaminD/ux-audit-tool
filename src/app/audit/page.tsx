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
      </div>

      <AuditAccessPanel />

      <Suspense>
        <AuditForm />
      </Suspense>
    </div>
  );
}
