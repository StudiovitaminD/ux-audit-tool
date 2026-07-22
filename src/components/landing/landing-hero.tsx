"use client";

import Link from "next/link";

export function LandingHero() {
  return (
    <section className="landingRoot relative overflow-hidden px-6 py-12 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,128,95,0.22),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(110,231,183,0.18),transparent_20%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-20 h-96 bg-[radial-gradient(circle,_rgba(255,255,255,0.08),transparent_55%)] blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-[30%] h-72 w-72 rounded-full bg-[radial-gradient(circle,_rgba(30,99,255,0.18),transparent_60%)] blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col justify-center gap-12 text-[color:var(--foreground)]">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-3 rounded-full border border-[color:var(--border)] bg-[color:var(--surface)]/80 px-4 py-2 text-sm uppercase tracking-[0.35em] text-[color:var(--muted)] shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
              Premium UX audit intelligence
            </div>
            <div className="max-w-2xl space-y-6">
              <h1 className="text-5xl font-semibold leading-tight tracking-[-0.05em] sm:text-6xl lg:text-7xl">
                A cinematic UX audit experience, reimagined for leadership.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[color:var(--muted-foreground)]">
                Turn audit insight into an immersive, executive-ready experience with glowing metrics, interactive score tiles, and refined report storytelling.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/audit"
                className="inline-flex items-center justify-center rounded-full bg-[color:var(--accent)] px-7 py-3 text-sm font-semibold text-[color:var(--accent-foreground)] shadow-[0_24px_80px_rgba(255,128,95,0.24)] transition hover:-translate-y-0.5 hover:bg-[color:var(--accent)]/95"
              >
                Start audit
              </Link>
              <Link
                href="/report"
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-7 py-3 text-sm font-semibold text-[color:var(--foreground)] transition hover:-translate-y-0.5 hover:bg-[color:var(--surface)]"
              >
                View sample report
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--card)]/85 p-6 shadow-[0_40px_120px_rgba(15,23,42,0.14)] backdrop-blur-3xl">
            <div className="absolute -left-16 top-6 h-40 w-40 rounded-full bg-[radial-gradient(circle,_rgba(255,128,95,0.22),transparent_55%)] blur-3xl" />
            <div className="absolute -right-16 bottom-8 h-36 w-36 rounded-full bg-[radial-gradient(circle,_rgba(110,231,183,0.22),transparent_55%)] blur-3xl" />
            <div className="relative grid gap-6">
              <div className="grid gap-5">
                <div className="rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                  <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Executive score</p>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-6xl font-semibold text-[color:var(--foreground)]">67</span>
                    <span className="text-sm text-[color:var(--muted-foreground)]">/100</span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">A high-contrast score view that anchors the audit as a premium product experience.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { label: "Health", value: "Moderate risk" },
                    { label: "Risk", value: "Conversion friction" },
                    { label: "CX", value: "Audit-ready narrative" },
                    { label: "Focus", value: "Leadership review" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--card)] p-5"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">{item.label}</p>
                      <p className="mt-3 text-base font-semibold text-[color:var(--foreground)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)]/80 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Snapshot</p>
                    <p className="mt-3 text-lg font-semibold text-[color:var(--foreground)]">Critical issues in one view</p>
                  </div>
                  <span className="inline-flex rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-foreground)]">Top priority</span>
                </div>
                <div className="grid gap-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                  <p>Contact form validation and submission feedback are the biggest conversion blockers.</p>
                  <p>Interactive audit preview with large score cues, vivid insights, and clear next-step direction.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
