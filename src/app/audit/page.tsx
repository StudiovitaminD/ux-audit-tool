import { Suspense } from "react";
import { AuditForm } from "@/components/audit/audit-form";

export default function AuditPage() {
  return (
<<<<<<< HEAD
    <div className="m-16 mt-24 pb-16">
=======
    <div className="m-16 pb-16 pt-8">
>>>>>>> bf0192f (fix pdf report rendering)
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
