const pillars = [
  { title: "Delight", score: 77, subtitle: "Experience quality" },
  { title: "Impact", score: 66, subtitle: "Conversion momentum" },
  { title: "Accessibility", score: 50, subtitle: "Inclusive reach" },
];

const timeline = [
  {
    label: "Week 1-2",
    headline: "Immediate quick wins",
    details: [
      "Inline validation and form feedback",
      "Critical CTA clarity and button states",
    ],
  },
  {
    label: "Month 1",
    headline: "Conversion and trust",
    details: [
      "Navigation refinement and microcopy",
      "High-impact accessibility fixes",
    ],
  },
  {
    label: "Quarter 1",
    headline: "Strategic experience lift",
    details: [
      "Roadmap alignment with product goals",
      "Stakeholder-ready report storytelling",
    ],
  },
];

const competitors = [
  {
    name: "Primary site",
    score: "67",
    focus: "Own UX experience",
    badge: "Baseline",
  },
  {
    name: "Competitor A",
    score: "74",
    focus: "Conversion clarity",
    badge: "Faster discovery",
  },
  {
    name: "Competitor B",
    score: "58",
    focus: "Accessibility gaps",
    badge: "Ease of use",
  },
];

export function LandingSections() {
  return (
    <div className="relative mx-auto max-w-7xl px-6 pb-28 sm:px-8 lg:px-12">
      <section className="mb-24 rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--card)]/85 p-8 shadow-[0_40px_120px_rgba(15,23,42,0.10)] backdrop-blur-3xl">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Trusted by</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-5xl">
              Built for product teams who need a report that feels deliberate and distinct.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-[color:var(--muted-foreground)]">
              From audit snapshot to roadmap, every section is designed to look like a product experience, not a feature list.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-[color:var(--muted)]">
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">Acme Inc.</span>
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">layer.dev</span>
            <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3">ShipFast</span>
          </div>
        </div>
      </section>

      <section className="mb-24 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Report snapshot</p>
          <h2 className="text-4xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-5xl">
            An interactive report preview with clear score signals and premium contrast.
          </h2>
          <p className="max-w-2xl text-base leading-8 text-[color:var(--muted-foreground)]">
            The homepage now feels like the report itself: bold statistics, layered glass panels, and a cinematic visual system for product teams.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="glassPanel p-6">
              <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Overall health</p>
              <p className="mt-4 text-3xl font-semibold text-[color:var(--foreground)]">Moderate</p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">Actionable insights prioritize the most impactful improvements first.</p>
            </div>
            <div className="glassPanel p-6">
              <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Conversion risk</p>
              <p className="mt-4 text-3xl font-semibold text-[color:var(--foreground)]">High</p>
              <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">This report focuses on the experiences that are most likely to affect conversion.</p>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--surface)]/85 p-6 shadow-[0_24px_60px_rgba(15,23,42,0.12)] backdrop-blur-3xl">
          <div className="absolute left-6 top-6 h-24 w-24 rounded-full bg-[radial-gradient(circle,_rgba(255,128,95,0.2),transparent_55%)] blur-3xl" />
          <div className="absolute right-6 bottom-6 h-24 w-24 rounded-full bg-[radial-gradient(circle,_rgba(96,165,250,0.22),transparent_55%)] blur-3xl" />
          <div className="relative rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--card)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="grid gap-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Interactive preview</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">UX score board</p>
                </div>
                <span className="rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-foreground)]">Live</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Score</p>
                  <p className="mt-3 text-5xl font-semibold text-[color:var(--foreground)]">67</p>
                  <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">A bold experience metric for stakeholder reporting.</p>
                </div>
                <div className="rounded-[1.5rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
                  <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Snapshot</p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--muted-foreground)]">
                    Critical form validation and UX clarity issues are surfaced immediately in the report preview.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-24">
        <div className="grid gap-8 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="group relative overflow-hidden rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--card)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.1)] transition hover:-translate-y-1 hover:shadow-[0_30px_120px_rgba(15,23,42,0.14)]"
            >
              <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-[radial-gradient(circle,_rgba(255,128,95,0.12),transparent_55%)] blur-3xl" />
              <div className="relative z-10">
                <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">{pillar.title}</p>
                <p className="mt-5 text-3xl font-semibold text-[color:var(--foreground)]">{pillar.score}</p>
                <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{pillar.subtitle}</p>
                <div className="mt-6 h-3 rounded-full bg-[color:var(--surface)]">
                  <div className="h-full rounded-full bg-[color:var(--accent)]" style={{ width: `${pillar.score}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-24 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glassPanel p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Roadmap</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-[color:var(--foreground)] sm:text-5xl">
            A timeline that feels like a modern strategy experience.
          </h2>
          <div className="mt-8 space-y-8">
            {timeline.map((item) => (
              <div key={item.label} className="relative pl-10">
                <div className="absolute left-0 top-3 h-4 w-4 rounded-full bg-[color:var(--accent)] ring-4 ring-[color:var(--surface)]" />
                <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--muted)]">{item.label}</p>
                <p className="mt-3 text-xl font-semibold text-[color:var(--foreground)]">{item.headline}</p>
                <ul className="mt-4 space-y-2 text-sm leading-7 text-[color:var(--muted-foreground)]">
                  {item.details.map((detail) => (
                    <li key={detail} className="flex gap-3">
                      <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-[color:var(--accent)]" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-[color:var(--border)] bg-[color:var(--card)] p-8 shadow-[0_30px_90px_rgba(15,23,42,0.1)]">
            <p className="text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">Report preview</p>
            <h3 className="mt-4 text-2xl font-semibold text-[color:var(--foreground)]">Roadmap and risk in a single view</h3>
            <p className="mt-4 text-sm leading-7 text-[color:var(--muted-foreground)]">
              Show clients exactly what to act on next, with a visual progression from quick wins to strategic investment.
            </p>
          </div>
          <div className="grid gap-5">
            {competitors.map((competitor) => (
              <div key={competitor.name} className="rounded-[1.75rem] border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-[color:var(--muted)]">{competitor.name}</p>
                    <p className="mt-3 text-xl font-semibold text-[color:var(--foreground)]">{competitor.focus}</p>
                  </div>
                  <span className="rounded-full bg-[color:var(--accent)] px-3 py-1 text-xs font-semibold text-[color:var(--accent-foreground)]">{competitor.badge}</span>
                </div>
                <div className="mt-5 flex items-center justify-between gap-6">
                  <span className="text-5xl font-semibold text-[color:var(--foreground)]">{competitor.score}</span>
                  <p className="text-sm text-[color:var(--muted-foreground)]">Score guide for comparison and positioning.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
