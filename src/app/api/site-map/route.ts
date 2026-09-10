import { NextResponse } from "next/server";
import { assertPublicHttpUrl } from "@/lib/url-security";

export const runtime = "nodejs";

function uniqueUrls(values: string[], origin: string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    try {
      const url = new URL(value, origin);
      url.hash = "";
      if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return false;
      const normalized = url.toString().replace(/\/$/, "") || url.origin;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    } catch { return false; }
  }).slice(0, 200);
}

async function readUrls(url: URL) {
  const response = await fetch(url, { headers: { accept: "application/xml,text/xml,text/html" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return [];
  const text = await response.text();
  const collect = (pattern: RegExp) => {
    const values: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) values.push(match[1]);
    return values;
  };
  const matches = collect(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi);
  return matches.length ? matches : collect(/href=["']([^"']+)["']/gi);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    const target = assertPublicHttpUrl(String(body.url || "").trim());
    const sitemapCandidates = [new URL("/sitemap.xml", target), new URL("/sitemap_index.xml", target)];
    let urls: string[] = [];
    for (const candidate of sitemapCandidates) {
      try { urls = [...urls, ...(await readUrls(candidate))]; } catch {}
    }
    if (!urls.length) {
      try { urls = await readUrls(target); } catch {}
    }
    const pages = uniqueUrls(urls, target.origin).map((pageUrl) => ({ url: pageUrl, label: pageUrl === target.toString().replace(/\/$/, "") ? "Homepage" : new URL(pageUrl).pathname }));
    return NextResponse.json({ ok: true, pages });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not discover site pages." }, { status: 400 });
  }
}
