import Link from "next/link";

const starterFeatures = [
  "10 reports included",
  "Marketing website and ecommerce audits",
  "Full report access",
  "Best for solo founders and small teams",
];

const customFeatures = [
  "Choose the number of reports you need",
  "$0.75 per report",
  "Minimum order: more than 20 reports",
  "Best for agencies, operators, and repeat audit workflows",
];

function PlanCard({
  eyebrow,
  title,
  subtitle,
  price,
  features,
  primary,
  ctaHref,
  ctaLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  price: string;
  features: string[];
  primary?: boolean;
  ctaHref: string;
  ctaLabel: string;
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
    </div>
  );
}

export default function PricingPage() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:py-16">
      <div className="rounded-[36px] border border-[color:var(--cream-dark)] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)] sm:p-10">
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
            price="$10"
            features={starterFeatures}
            ctaHref="/sign-up?returnTo=/pricing"
            ctaLabel="Choose 10 report plan"
          />
          <PlanCard
            eyebrow="Custom"
            title="Flexible Volume"
            subtitle="For larger usage where you want to decide the number of reports."
            price="$0.75/report"
            features={customFeatures}
            primary
            ctaHref="/sign-up?returnTo=/pricing"
            ctaLabel="Request custom plan"
          />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-[color:var(--cream-dark)] bg-[color:var(--cream)]/50 p-6">
            <div className="text-lg font-semibold text-[color:var(--ink)]">Custom plan pricing example</div>
            <div className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">
              If you need more than 20 reports, the custom plan is charged at $0.75 per report.
              For example, 25 reports would cost $18.75 and 40 reports would cost $30.
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--cream-dark)] bg-[linear-gradient(180deg,#fff_0%,#faf5ea_100%)] p-6">
            <div className="text-lg font-semibold text-[color:var(--ink)]">How to get started</div>
            <div className="mt-3 text-sm leading-7 text-[color:var(--ink-muted)]">
              Create your account first, then choose the plan you want. For custom volume, request the report count you need and keep it above 20 reports.
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/sign-up?returnTo=/pricing" className="btnPrimary">
                Create account
              </Link>
              <Link href="/audit" className="btnSecondary">
                Go to audit
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
