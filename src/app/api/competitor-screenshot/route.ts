import { NextResponse } from "next/server";
import { z } from "zod";
import {
  captureCompetitorSnapshot,
  makeFallbackSnapshot,
} from "@/lib/competitor-snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  name: z.string().optional().default(""),
  url: z.string().url(),
  compare_focus: z.string().optional().default(""),
});

function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Competitor screenshot timed out")), ms);
  });
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const result = await Promise.race([
      captureCompetitorSnapshot(body),
      timeoutAfter(50_000),
    ]).catch((error) =>
      makeFallbackSnapshot(
        body,
        error instanceof Error ? error.message : "Failed to capture screenshot",
      ),
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to capture screenshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
