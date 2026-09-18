import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dataset = JSON.parse(fs.readFileSync(path.join(root, "evals/senior-designer-reference.json"), "utf8"));
const thresholds = JSON.parse(fs.readFileSync(path.join(root, "evals/quality-thresholds.json"), "utf8"));
const baseline = JSON.parse(fs.readFileSync(path.join(root, "evals/quality-baseline.json"), "utf8"));
const cases = Array.isArray(dataset.cases) ? dataset.cases : [];
const sentenceFields = ["observation", "consequence", "recommendation", "evidence"];
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value) => new Set(normalize(value).split(" ").filter((word) => word.length > 3));
const similar = (a, b) => {
  const left = tokens(a); const right = tokens(b);
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.max(1, Math.min(left.size, right.size)) >= 0.78;
};
const complete = (value) => /[.!?]$/.test(String(value || "").trim()) && !/(?:\.{3}|…)$/.test(String(value || "").trim());
const expectedMark = (state) => state === "pass" ? 1 : state === "partial" ? 0.5 : 0;
const rate = (count) => cases.length ? Number((count / cases.length).toFixed(4)) : 0;

let structured = 0, contextual = 0, evidenced = 0, completeCases = 0, scoreCorrect = 0, duplicates = 0;
const observations = [];
for (const item of cases) {
  const finding = item.finding || {};
  if (["context_label", "observation", "consequence", "recommendation"].every((key) => String(finding[key] || "").trim())) structured += 1;
  if (String(finding.context_label || "").trim() && !/^(screen|page|interface|website|component)$/i.test(finding.context_label)) contextual += 1;
  if (String(finding.evidence || "").trim() && String(finding.question_id || "").trim()) evidenced += 1;
  if (sentenceFields.every((key) => complete(finding[key]))) completeCases += 1;
  if (item.mark === expectedMark(item.answer_state)) scoreCorrect += 1;
  if (observations.some((value) => similar(value, finding.observation))) duplicates += 1;
  observations.push(finding.observation);
}

const metrics = {
  case_count: cases.length,
  structured_finding_rate: rate(structured),
  context_label_rate: rate(contextual),
  evidence_backed_rate: rate(evidenced),
  complete_sentence_rate: rate(completeCases),
  score_policy_accuracy: rate(scoreCorrect),
  duplicate_rate: rate(duplicates),
};
const failures = [];
if (metrics.case_count < thresholds.minimum_case_count) failures.push("reference dataset is too small");
for (const key of ["structured_finding_rate", "context_label_rate", "evidence_backed_rate", "complete_sentence_rate", "score_policy_accuracy"]) {
  if (metrics[key] < thresholds[key]) failures.push(`${key} ${metrics[key]} is below threshold ${thresholds[key]}`);
  if (metrics[key] < baseline[key]) failures.push(`${key} regressed below baseline ${baseline[key]}`);
}
if (metrics.duplicate_rate > thresholds.maximum_duplicate_rate) failures.push(`duplicate_rate ${metrics.duplicate_rate} exceeds ${thresholds.maximum_duplicate_rate}`);
if (metrics.duplicate_rate > baseline.duplicate_rate) failures.push(`duplicate_rate regressed above baseline ${baseline.duplicate_rate}`);

console.log(JSON.stringify({ dataset: dataset.version, metrics, status: failures.length ? "failed" : "passed", failures }, null, 2));
if (failures.length) process.exit(1);
