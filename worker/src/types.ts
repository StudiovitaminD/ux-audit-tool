import { z } from "zod";

export const IntakeSchema = z.object({
  product_name: z.string().min(1),
  product_url: z.string().min(1),
  product_type: z.union([
    z.literal("saas"),
    z.literal("ecommerce"),
    z.literal("marketing_website"),
    z.literal("SaaS"),
    z.literal("E-commerce"),
    z.literal("Website"),
  ]),
  primary_platform: z.string().min(1),
  audit_goal: z.array(z.string()).default([]),
  audit_flows: z.array(z.string()).default([]),
  selected_buckets: z.array(z.string()).default([]),
  product_stage: z.string().optional(),
  competitors: z.string().optional(),
  differentiation: z.string().optional(),
  known_problem: z.string().optional(),
  login_required: z.boolean().optional(),
  login_email: z.string().optional(),
  login_password: z.string().optional(),
  who_implements: z.string().optional(),
  success_metric: z.string().optional(),
  constraints: z.string().optional(),
  primary_user: z.string().optional(),
  primary_user_goal: z.string().optional(),
  primary_user_intent: z.string().optional(),
  frequency_of_use: z.string().optional(),
});

export type Intake = z.infer<typeof IntakeSchema>;

export type EvidencePage = {
  url: string;
  title: string;
  metaDescription?: string;
  h1: string[];
  h2: string[];
  h3: string[];
  topNavLinks: Array<{ text: string; href: string }>;
  primaryCtas?: Array<{ text: string; href: string }>;
  textSnippet: string;
  screenshots?: {
    desktop?: string;
    mobile?: string;
  };
};

export type EvidenceBundle = {
  pages: EvidencePage[];
  warnings: string[];
};

export type BucketResult = {
  bucket_name: string;
  pillar: string;
  total_marks: number | null;
  max_marks: number | null;
  score: number | null;
  bucket_status?: "scored" | "not_tested" | "insufficient_evidence" | "scoring_unavailable";
  audit_confidence?: number | null;
  health: string;
  risk: string;
  priority: string;
  questions: Array<{
    id: string;
    question: string;
    mark: number | null;
    selected_option?: number | string | null;
    selected_option_state?: string | null;
    evidence: string;
    observation: string;
    recommendation?: string;
    effort?: string;
    impact?: string;
    confidence?: number;
    answer_state?: string | null;
    answer_status?: string | null;
  }>;
  findings: Array<Record<string, unknown>>;
  improvements: Array<Record<string, unknown>>;
};
