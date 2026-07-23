"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, type ReactNode } from "react";

const REPORT_PRICE = 0.75;
const MIN_CUSTOM_REPORTS = 20;

const starterFeatures = [
  "10 reports included",
  "Marketing website and ecommerce audits",
  "Full report access",
  "Best for solo founders and small teams",
];

const customFeatures = [
  "Choose the number of reports you need",
  "₹0.75 per report",
  "Minimum order: 20 reports",
  "Best for agencies, operators, and repeat audit workflows",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function PlanCard({
  eyebrow,
  title,
  subtitle,
  price,
  features,
  primary,
  ctaHref,
  ctaLabel,
  ctaDisabled,
  extra,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  price: string;
  features: string[];
  primary?: boolean;
  ctaHref: string;
  ctaLabel: string;
  ctaDisabled?: boolean;
  extra?: ReactNode;
}) {
  return (
    <div
      className={`rounded-[32px] border p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)] ${
        primary
          ? "border-black bg-[color:var(--ink)] text-white"
          : "border-[color:var(--cream-dark)] bg-white text-[color:var(--ink)]"
      }`}
    >
      <div className={`text-xs font-semibold uppercase tracking-[0.28em] ${primary ? "text-white/70" : "text-[color:var(--ink-muted)]"}`}>
        {eyebrow}
      </div>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
      <p className={`mt-3 text-sm leading-7 ${primary ? "text-white/80" : "text-[color:var(--ink-muted)]"}`}>
        {subtitle}
      </p>
      <div className="mt-6 text-4xl font-semibold">{price}</div>
      <ul className="mt-8 space-y-3 text-sm leading-7">
        {features.map((feature) => (
          <li key={feature} className="flex gap-3">
            <span className={`mt-2 inline-flex h-2.5 w-2.5 rounded-full ${primary ? "bg-white" : "bg-[color:var(--ink)]"}`} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {extra ? extra : null}
      {ctaDisabled ? (
        <button
          type="button"
          disabled
          className={`mt-8 inline-flex cursor-not-allowed rounded-full px-5 py-3 text-sm font-semibold opacity-55 transition ${
            primary
              ? "bg-white text-[color:var(--ink)]"
              : "bg-[color:var(--ink)] text-white"
          }`}
        >
          {ctaLabel}
        </button>
      ) : (
        <Link
          href={ctaHref}
          className={`mt-8 inline-flex rounded-full px-5 py-3 text-sm font-semibold transition ${
            primary
              ? "bg-white text-[color:var(--ink)] hover:bg-white/90"
              : "bg-[color:var(--ink)] text-white hover:opacity-90"
          }`}
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}

export default function PricingPage() {
  const [reportCount, setReportCount] = useState(MIN_CUSTOM_REPORTS);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const checkoutError = searchParams.get("checkout_error");
    const cancelled = searchParams.get("checkout");
    if (checkoutError) {
      setNotice(checkoutError);
      return;
    }
    if (cancelled === "cancelled") {
      setNotice("Checkout was cancelled. You can try again anytime.");
      return;
    }
    setNotice(null);
  }, []);

  const previewCustomCount = Number.isFinite(reportCount)
    ? Math.max(0, Math.floor(reportCount))
    : 0;
  const isCustomCountValid = previewCustomCount >= MIN_CUSTOM_REPORTS;
  const customTotal = useMemo(
    () => previewCustomCount * REPORT_PRICE,
    [previewCustomCount],
  );

  const starterCheckoutUrl = `/billing/checkout?plan=starter&reportLimit=10&next=/audit`;
  const customCheckoutUrl = `/billing/checkout?plan=custom&reportLimit=${previewCustomCount}&next=/audit`;
  const starterHref = starterCheckoutUrl;
  const customHref = customCheckoutUrl;
  const customCtaLabel = isCustomCountValid
    ? `Pay for ${previewCustomCount} reports`
    : `Minimum ${MIN_CUSTOM_REPORTS} reports`;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:py-16">
      <div className="rounded-[36px] border border-[color:var(--cream-dark)] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)] sm:p-10">
        {notice ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {notice}
          </div>
        ) : null}

        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
            Plans
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-[color:var(--ink)] sm:text-5xl">
            Choose the report plan that fits your audit volume
          </h1>
          <p className="mt-4 text-base leading-8 text-[color:var(--ink-muted)]">
            Pick a simple fixed plan for smaller usage or a custom report pack for higher-volume audit needs.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <PlanCard
            eyebrow="Starter"
            title="10 Report Plan"
            subtitle="A simple fixed plan for teams that need a small batch of audits."
            price="₹10"
            features={starterFeatures}
            ctaHref={starterHref}
            ctaLabel="Choose 10 report plan"
          />
          <PlanCard
            eyebrow="Custom"
            title="Flexible Volume"
            subtitle="For larger usage where you want to decide the number of reports."
            price={formatCurrency(customTotal)}
            features={customFeatures}
            primary
            ctaHref={customHref}
            ctaLabel={customCtaLabel}
            ctaDisabled={!isCustomCountValid}
            extra={
              <div className="mt-8 rounded-[28px] border border-white/10 bg-white/6 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/70">
                  Number of reports
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="block">
                    <div className="mb-2 text-sm font-medium text-white/90">
                      Choose your volume
                    </div>
                    <div className="grid grid-cols-[1fr_auto] overflow-hidden rounded-2xl border border-white/10 bg-[#111111]">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={previewCustomCount}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setReportCount(Number.isFinite(next) ? next : 0);
                        }}
                        className="w-full bg-transparent px-4 py-3 text-lg font-semibold text-white outline-none transition placeholder:text-white/35 focus:ring-0"
                      />
                      <div className="flex flex-col border-l border-white/10">
                        <button
                          type="button"
                          aria-label="Increase reports"
                          onClick={() => setReportCount((current) => Math.max(0, Math.floor(current) + 1))}
                          className="grid h-1/2 min-h-8 w-11 place-items-center text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          aria-label="Decrease reports"
                          onClick={() => setReportCount((current) => Math.max(0, Math.floor(current) - 1))}
                          className="grid h-1/2 min-h-8 w-11 place-items-center border-t border-white/10 text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          −
                        </button>
                      </div>
                    </div>
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-white/55">
                      Estimated total
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-white">
                      {formatCurrency(customTotal)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-sm leading-6 text-white/70">
                  Minimum order: {MIN_CUSTOM_REPORTS} reports. {isCustomCountValid ? "You're ready to pay." : "Increase to 20 or more to unlock payment."}
                </div>
              </div>
            }
          />
        </div>

        <div className="mt-10" />
      </div>
    </section>
  );
}
