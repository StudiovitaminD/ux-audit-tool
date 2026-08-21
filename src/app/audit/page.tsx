import { Suspense } from "react";
import { AuditForm } from "@/components/audit/audit-form";

export default function AuditPage() {
  return (
    <div className="m-16 mt-32 pb-16">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="font-display text-[24px] font-semibold leading-[1.15] tracking-tight">
            Audit Details
          </h2>
        </div>

        <Suspense>
          <AuditForm />
        </Suspense>
      </div>
    </div>
  );
}
