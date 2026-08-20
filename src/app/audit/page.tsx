import { Suspense } from "react";
import { AuditForm } from "@/components/audit/audit-form";

export default function AuditPage() {
  return (
    <div className="m-16 pb-16">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Audit Details
          </h1>
        </div>

        <Suspense>
          <AuditForm />
        </Suspense>
      </div>
    </div>
  );
}
