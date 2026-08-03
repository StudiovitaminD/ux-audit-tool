"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SESSION_STORAGE_KEY, fetchAppSession } from "@/lib/app-session";
import { type CheckoutPlan } from "@/lib/razorpay-billing";

type BillingOrderResponse = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  plan: CheckoutPlan;
  reportLimit: number;
  next: string;
};

type RazorpayWindow = Window & {
  Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
};

let razorpayScriptPromise: Promise<void> | null = null;

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

function extractErrorMessage(data: BillingOrderResponse | { error?: string } | null) {
  if (data && "error" in data && typeof data.error === "string" && data.error.trim()) {
    return data.error.trim();
  }
  return "Unable to start checkout.";
}

function loadRazorpayScript() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
  if (existing) {
    return Promise.resolve();
  }
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));
      document.head.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

export default function BillingCheckoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<BillingOrderResponse | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const startedRef = useRef(false);

  const checkoutParams = useMemo(() => {
    if (typeof window === "undefined") {
      return { plan: "custom" as CheckoutPlan, reportLimit: 20, next: "/audit" };
    }
    const params = new URLSearchParams(window.location.search);
    const plan = normalizePlan(params.get("plan"));
    const next = normalizeNext(params.get("next"));
    const reportLimit = normalizeReportLimit(plan, params.get("reportLimit"));
    return { plan, reportLimit, next };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
        const session = await fetchAppSession({ expectedStorageValue: storageSnapshot }).catch(() => null);
        if (cancelled) return;
        if (!session) {
          const current = `${window.location.pathname}${window.location.search}`;
          router.replace(`/sign-up?returnTo=${encodeURIComponent(current)}`);
          return;
        }

        setSignedIn(true);
        const response = await fetch("/api/billing/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(checkoutParams),
        });
        const data = (await response.json().catch(() => null)) as
          | BillingOrderResponse
          | { error?: string }
          | null;

        if (!response.ok) {
          throw new Error(extractErrorMessage(data));
        }

        if (!data || !("orderId" in data)) {
          throw new Error("Unable to start checkout.");
        }

        if (cancelled) return;
        setOrder(data);
      } catch (checkoutError) {
        if (cancelled) return;
        setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout.");
        setLoading(false);
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [checkoutParams, router]);

  useEffect(() => {
    if (!order || startedRef.current) return;
    startedRef.current = true;
    const activeOrder = order;

    let cancelled = false;

    async function openCheckout() {
      try {
        await loadRazorpayScript();
        if (cancelled) return;

        const Razorpay = (window as RazorpayWindow).Razorpay;
        if (!Razorpay) {
          throw new Error("Razorpay checkout is unavailable.");
        }

        const modal = new Razorpay({
          key: activeOrder.keyId,
          amount: activeOrder.amount,
          currency: activeOrder.currency,
          order_id: activeOrder.orderId,
          name: "AI UX Audit",
          description:
            activeOrder.plan === "starter"
              ? "Starter report pack"
              : `${activeOrder.reportLimit} report pack`,
          prefill: {},
          theme: {
            color: "#111111",
          },
          handler: async (response: Record<string, unknown>) => {
            try {
              const confirmation = await fetch("/api/billing/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  orderId: String(response.razorpay_order_id ?? ""),
                  paymentId: String(response.razorpay_payment_id ?? ""),
                  signature: String(response.razorpay_signature ?? ""),
                }),
              });
              const confirmationData = (await confirmation.json().catch(() => null)) as
                | { error?: string }
                | null;
              if (!confirmation.ok) {
                throw new Error(confirmationData?.error || "Payment confirmation failed.");
              }
              const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
              await fetchAppSession({ expectedStorageValue: storageSnapshot }).catch(() => undefined);
              if (cancelled) return;
              router.replace(activeOrder.next);
            } catch (paymentError) {
              if (cancelled) return;
              setError(paymentError instanceof Error ? paymentError.message : "Payment confirmation failed.");
              setLoading(false);
            }
          },
          modal: {
            ondismiss: () => {
              if (cancelled) return;
              setError("Checkout was cancelled. You can try again anytime.");
              setLoading(false);
            },
          },
        });

        modal.open();
        if (!cancelled) {
          setLoading(false);
        }
      } catch (checkoutError) {
        if (cancelled) return;
        setError(checkoutError instanceof Error ? checkoutError.message : "Unable to open checkout.");
        setLoading(false);
      }
    }

    void openCheckout();

    return () => {
      cancelled = true;
    };
  }, [order, router]);

  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center px-4 py-16">
      <div className="w-full rounded-[32px] border border-[color:var(--cream-dark)] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)]">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
          Payment
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--ink)]">
          {loading ? "Opening secure checkout…" : error ? "Payment needs attention" : "Ready to pay"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--ink-muted)]">
          {error
            ? error
            : signedIn
              ? "We’re opening Razorpay now. If the modal does not appear, refresh and try again."
              : "Checking your account before opening checkout."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/pricing" className="btnSecondary">
            Back to pricing
          </a>
          {error ? (
            <button type="button" onClick={() => window.location.reload()} className="btnPrimary">
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
