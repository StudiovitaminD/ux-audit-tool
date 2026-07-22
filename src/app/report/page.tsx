import { ReportView } from "@/components/report/report-view";
import { Suspense } from "react";

export default function ReportPage() {
  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-10 sm:px-6 lg:px-8">
      <Suspense>
        <ReportView />
      </Suspense>
    </div>
  );
}
