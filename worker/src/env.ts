import { z } from "zod";

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4.1-mini";

const EnvSchema = z.object({
  PORT: z.string().optional(),
  WORKER_SECRET: z.string().min(1),

  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1).default(DEFAULT_OPENROUTER_MODEL),

  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().min(1),
  FIREBASE_PRIVATE_KEY: z.string().min(1),

  FIREBASE_STORAGE_BUCKET: z.string().optional(),

  EVIDENCE_MAX_PAGES: z.string().optional(),
});

export type WorkerEnv = z.infer<typeof EnvSchema>;

export function getEnv(): WorkerEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Worker env invalid: ${msg}`);
  }
  return parsed.data;
}
