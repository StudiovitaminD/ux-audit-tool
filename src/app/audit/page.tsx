import { Suspense } from "react";
import { AuditForm } from "@/components/audit/audit-form";

export default function AuditPage() {
  return (
    <div className="m-16 mt-32 pb-16">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2
            className="font-display font-semibold tracking-tight"
            style={{ fontSize: "24px", lineHeight: "1.15", color: "var(--ink)" }}
          >
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
