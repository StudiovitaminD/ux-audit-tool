import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { assertPublicHttpUrl } from "@/lib/url-security";
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
    if (!(await getAccountSessionFromRequest(req))) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const body = BodySchema.parse(await req.json());
    assertPublicHttpUrl(body.url);
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
