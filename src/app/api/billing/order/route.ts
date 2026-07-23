import { NextResponse } from "next/server";
import { getAccountSessionFromRequest } from "@/lib/account-server";
import { createRazorpayOrder, type CheckoutPlan } from "@/lib/razorpay-billing";

export const runtime = "nodejs";

function normalizePlan(value: string | null): CheckoutPlan {
  return value === "starter" ? "starter" : "custom";
}

function normalizeNext(value: string | null) {
  if (!value || !value.trim()) return "/audit";
  if (!value.startsWith("/")) return "/audit";
  if (value.startsWith("//")) return "/audit";
  return value;
}

function normalizeReportLimit(plan: CheckoutPlan, value: string | null) {
  const parsed = Number(value);
  if (plan === "starter") return 10;
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(20, Math.floor(parsed));
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => null)) as {
      plan?: string;
      reportLimit?: number | string;
      next?: string;
    } | null;

    const plan = normalizePlan(body?.plan ?? url.searchParams.get("plan"));
    const next = normalizeNext(body?.next ?? url.searchParams.get("next"));
    const reportLimit = normalizeReportLimit(
      plan,
      typeof body?.reportLimit === "string"
        ? body.reportLimit
        : typeof body?.reportLimit === "number"
          ? String(body.reportLimit)
          : url.searchParams.get("reportLimit"),
    );

    const accountSession = await getAccountSessionFromRequest(req);
    if (!accountSession) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    if (plan === "custom" && reportLimit < 20) {
      return NextResponse.json({ error: "Minimum order is 20 reports." }, { status: 400 });
    }

    const order = await createRazorpayOrder({
      userId: accountSession.id,
      email: accountSession.email,
      plan,
      reportLimit,
      next,
    });

    return NextResponse.json(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
