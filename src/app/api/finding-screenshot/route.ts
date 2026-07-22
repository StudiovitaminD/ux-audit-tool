import { NextResponse } from "next/server";
import { z } from "zod";
import {
  captureFindingSnapshot,
  makeFallbackFindingSnapshot,
} from "@/lib/finding-snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  reportId: z.string().optional().default(""),
  product_url: z.string().url(),
  finding_id: z.string().optional().default(""),
  bucket: z.string().optional().default(""),
  title: z.string().optional().default(""),
  what_we_found: z.string().optional().default(""),
  why_it_matters: z.string().optional().default(""),
  recommendation: z.string().optional().default(""),
});

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Finding screenshot timed out")), ms);
  });
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const result = await Promise.race([
      captureFindingSnapshot(body),
      timeoutAfter(45_000),
    ]).catch((error) =>
      makeFallbackFindingSnapshot(
        body.product_url,
        error instanceof Error ? error.message : "Failed to capture screenshot",
      ),
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to capture screenshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
