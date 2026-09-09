import { NextResponse } from "next/server";

function normalize(value: string) {
  return value.trim().replace(/\/$/, "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get("url") || "";
  const token = searchParams.get("token") || "";
  if (!rawUrl || !token) return NextResponse.json({ ok: false, error: "URL and token are required." }, { status: 400 });

  let target: URL;
  try {
    target = new URL(rawUrl);
    if (!["http:", "https:"].includes(target.protocol)) throw new Error("Unsupported protocol");
  } catch {
    return NextResponse.json({ ok: false, error: "Enter a valid website URL." }, { status: 400 });
  }

  try {
    const response = await fetch(target.origin + target.pathname, {
      headers: { "user-agent": "UX-Audit-Ownership-Check/1.0" },
      cache: "no-store",
      redirect: "follow",
    });
    const html = await response.text();
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const meta = new RegExp(`<meta[^>]+name=["']ux-audit-verification["'][^>]+content=["']${escapedToken}["']`, "i");
    const file = await fetch(new URL("/ux-audit-verification.txt", target.origin), { cache: "no-store" }).then((r) => r.text()).catch(() => "");
    const verified = meta.test(html) || file.trim() === token;
    return NextResponse.json({ ok: verified, method: meta.test(html) ? "meta_tag" : file.trim() === token ? "file" : null, error: verified ? null : "Verification token was not found on this website." });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach this website. Check the URL and try again." }, { status: 502 });
  }
}
