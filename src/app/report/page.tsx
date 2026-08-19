import { ReportView } from "@/components/report/report-view";
import { Suspense } from "react";

export default function ReportPage() {
  return (
    <div className="m-0 w-full min-h-screen bg-[color:var(--background)] p-0">
      <Suspense>
        <ReportView />
      </Suspense>
    </div>
  );
}
