import { Suspense } from "react";
import { AIBucketAnswersRoute } from "@/components/report/ai-bucket-answers-route";

export default function AIBucketAnswersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[color:var(--background)]" />}>
      <AIBucketAnswersRoute />
    </Suspense>
  );
}
