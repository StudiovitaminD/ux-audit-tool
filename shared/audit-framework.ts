import { UX_AUDIT_BUCKETS } from "./ux-audit-core";

export type AuditCriterion = {
  title: string;
  question: string;
};

export type AuditBucket = {
  name: string;
  criteria: AuditCriterion[];
};

type AuditPillar = {
  name: "Accessibility" | "Impact" | "Delight";
  summary: string;
  bucketCount: number;
  criterionCount: number;
  buckets: Array<AuditBucket & { name: string }>;
};

const pillarSummaries: Record<AuditPillar["name"], string> = {
  Accessibility: "Can everyone perceive, understand and operate the experience?",
  Impact: "Does the experience help users complete tasks and support business goals?",
  Delight: "Does the experience feel polished, distinctive and emotionally satisfying?",
};

const pillarBuckets = UX_AUDIT_BUCKETS.reduce<Record<AuditPillar["name"], AuditBucket[]>>(
  (acc, bucket) => {
    acc[bucket.pillar].push({
      name: bucket.name,
      criteria: bucket.questions.map((question) => ({
        title: question.title,
        question: question.question,
      })),
    });
    return acc;
  },
  { Accessibility: [], Impact: [], Delight: [] },
);

export const AUDIT_FRAMEWORK = {
  purpose:
    "Use this framework to audit digital products consistently, record evidence, score individual criteria, and identify improvement priorities across the three UX pillars.",
  scoringScale:
    "Score PASS as 1, PARTIAL as 0.5, and FAIL as 0. Exclude NOT_TESTED and N/A from the bucket denominator. Each bucket carries equal weight in the overall score.",
  auditNote:
    "Accessibility should combine automated checks with manual keyboard and screen-reader testing. Performance should be measured under realistic device and network conditions. If Screen Reader Support or Performance are selected, capture at least one semantic/ARIA inspection and one mobile/responsive pass so the model has enough evidence to give a best-effort score.",
  pillars: (Object.entries(pillarBuckets) as Array<[AuditPillar["name"], AuditBucket[]]>).map(
    ([name, buckets]) => ({
      name,
      summary: pillarSummaries[name],
      bucketCount: buckets.length,
      criterionCount: buckets.reduce((sum, bucket) => sum + bucket.criteria.length, 0),
      buckets,
    }),
  ),
  checklist: [
    "Screen, page, flow, or component audited",
    "Device, browser, viewport, and assistive technology used",
    "Observed behaviour and the expected behaviour",
    "Screenshot, recording, technical output, or test result",
    "Severity, affected user group, and business consequence",
    "Recommended action and responsible owner",
  ],
} as const;

export function buildAuditFrameworkBrief() {
  const lines: string[] = [];
  lines.push(AUDIT_FRAMEWORK.purpose);
  lines.push(AUDIT_FRAMEWORK.scoringScale);
  lines.push(AUDIT_FRAMEWORK.auditNote);
  lines.push("");
  lines.push("Framework structure:");
  for (const pillar of AUDIT_FRAMEWORK.pillars) {
    lines.push(`- ${pillar.name}: ${pillar.summary} (${pillar.bucketCount} buckets, ${pillar.criterionCount} criteria)`);
  }
  lines.push("");
  lines.push("Audit evidence checklist:");
  for (const item of AUDIT_FRAMEWORK.checklist) lines.push(`- ${item}`);
  return lines.join("\n");
}

export function buildBucketFrameworkBrief(bucketName: string) {
  for (const pillar of AUDIT_FRAMEWORK.pillars) {
    const bucket = pillar.buckets.find((item) => item.name === bucketName);
    if (!bucket) continue;
    const lines = [
      `Framework focus for ${bucketName} under ${pillar.name}.`,
      `Pillar intent: ${pillar.summary}`,
      "How to audit:",
      ...bucket.criteria.map((criterion) => `- ${criterion.title}: ${criterion.question}`),
    ];
    return lines.join("\n");
  }
  return buildAuditFrameworkBrief();
}
