"use client";

import Link from "next/link";
import { useState } from "react";

const services = [
  {
    title: "Search engine optimization",
    tone: "light",
    copy: "Improve structure, findability, and content clarity across key pages.",
  },
  {
    title: "Pay-per-click advertising",
    tone: "lime",
    copy: "Spot friction in campaign landing journeys and boost conversion quality.",
  },
  {
    title: "Social Media Marketing",
    tone: "dark",
    copy: "Review messaging consistency and CTA clarity across acquisition surfaces.",
  },
  {
    title: "Email Marketing",
    tone: "light",
    copy: "Strengthen sequence clarity, form capture, and handoff experiences.",
  },
  {
    title: "Content Creation",
    tone: "lime",
    copy: "Audit hierarchy, value proposition, and readability of core messaging.",
  },
  {
    title: "Analytics and Tracking",
    tone: "dark",
    copy: "Connect UX issues to measurable conversion and engagement outcomes.",
  },
];

const caseStudies = [
  "For a local restaurant, we improved a targeted PPC campaign and surfaced 18% more leads in the first month after UX fixes.",
  "For a B2B software company, we reduced funnel drop-off and improved form completion after finding errors in the request journey.",
  "For a national retail chain, we created a social-media-to-landing experience that improved engaged sessions and discovery.",
];

const processSteps = [
  {
    title: "Consultation",
    body: "We collect your product context, audit goals, audience, and available evidence. This keeps the report aligned with the real business need rather than generic UX feedback.",
  },
  {
    title: "Research and Strategy Development",
    body: "We review captured pages, competitive patterns, and journey expectations to frame what matters most for conversion, clarity, and trust.",
  },
  {
    title: "Implementation",
    body: "The audit engine scores bucket questions, builds findings, and assembles section-level summaries and exportable reports.",
  },
  {
    title: "Monitoring and Optimization",
    body: "We surface high-priority fixes, quick wins, and medium-term opportunities so product teams can sequence improvements logically.",
  },
  {
    title: "Reporting and Communication",
    body: "Executive summaries, narrative summaries, and bucket-level answers make the output easy to share across founders, product, and design teams.",
  },
  {
    title: "Continual Improvement",
    body: "As you capture better evidence and revisit the product, the reporting system supports iterative re-audits and stronger decision-making.",
  },
];

const team = [
  { name: "John Smith", role: "CEO and Founder" },
  { name: "Jane Doe", role: "Director of Operations" },
  { name: "Michael Brown", role: "Senior SEO Specialist" },
  { name: "Emily Johnson", role: "PPC Manager" },
  { name: "Brian Williams", role: "Social Media Specialist" },
  { name: "Sarah Kim", role: "Content Creator" },
];

const testimonials = [
  "The audit gave us a sharper picture of the journey gaps slowing down demos and contact conversion.",
  "We used the report to align product, content, and performance marketing around the same improvements.",
  "The executive summary made it easy to explain UX priorities to non-design stakeholders.",
];

function toneClasses(tone: "light" | "lime" | "dark") {
  if (tone === "lime") return "bg-[#c7ff4f] text-[#191919]";
  if (tone === "dark") return "bg-[#191a23] text-white";
  return "bg-white text-[#191919]";
}

export function LandingSections() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="relative w-full bg-[#f6f1e8] px-16 pb-20 text-[#191919]">
      <div className="mx-auto max-w-none space-y-20">
        <section id="features" data-reveal>
          <div className="mb-8 flex items-center gap-4">
            <span className="rounded-md bg-[#c7ff4f] px-3 py-1 text-sm font-bold">
              Services
            </span>
            <p className="max-w-[520px] text-sm text-[#555]">
              Our digital marketing agency style, translated into a premium AI UX audit landing experience.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {services.map((service) => (
              <article
                key={service.title}
                className={`rounded-[28px] border border-[#191919] p-6 shadow-[0_8px_0_rgba(25,25,25,0.08)] ${toneClasses(service.tone as "light" | "lime" | "dark")}`}
              >
                <div className="flex min-h-[190px] flex-col justify-between">
                  <div>
                    <h3 className="max-w-[14ch] rounded-md bg-white/90 px-2 py-1 text-[1.55rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#191919]">
                      {service.title}
                    </h3>
                    <p
                      className={`mt-5 max-w-[30ch] text-sm leading-6 ${service.tone === "dark" ? "text-white/75" : "text-[#4d4d4d]"}`}
                    >
                      {service.copy}
                    </p>
                  </div>
                  <div className="mt-8 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-sm font-medium">
                      <span className={`inline-block h-3 w-3 rounded-full ${service.tone === "dark" ? "bg-[#c7ff4f]" : "bg-[#191919]"}`} />
                      Learn more
                    </span>
                    <span className="text-3xl opacity-55">✦</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section data-reveal>
          <div className="grid gap-8 rounded-[34px] bg-[#ece8df] px-6 py-8 md:grid-cols-[1fr_0.45fr] md:px-10">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6f6f6f]">
                Let&apos;s make things happen
              </p>
              <h2 className="mt-3 text-[2rem] font-semibold tracking-[-0.05em] sm:text-[2.6rem]">
                Turn your website into a clearer, faster, more convincing experience.
              </h2>
              <p className="mt-4 max-w-[54ch] text-[15px] leading-7 text-[#555]">
                Contact us today to learn how our AI-assisted digital marketing and
                UX audit platform can help your business grow and succeed online.
              </p>
              <Link
                href="/audit"
                className="mt-6 inline-flex rounded-xl bg-[#191a23] px-5 py-3 text-sm font-semibold text-white"
              >
                Get your audit proposal
              </Link>
            </div>
            <div className="relative min-h-[220px]">
              <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#191919]/15" />
              <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#191a23]" />
              <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-[22px] -translate-y-[12px] rounded-full bg-white" />
              <div className="absolute left-1/2 top-1/2 h-7 w-7 translate-x-[2px] -translate-y-[12px] rounded-full bg-white" />
              <div className="absolute bottom-4 left-8 text-5xl text-[#c7ff4f]">✦</div>
            </div>
          </div>
        </section>

        <section data-reveal>
          <div className="mb-8 flex items-center gap-4">
            <span className="rounded-md bg-[#c7ff4f] px-3 py-1 text-sm font-bold">
              Case Studies
            </span>
            <p className="text-sm text-[#555]">
              Explore real-life examples of our approach to UX and growth.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {caseStudies.map((item, index) => (
              <article
                key={index}
                className="rounded-[28px] bg-[#191a23] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.12)]"
              >
                <p className="text-sm leading-7 text-white/78">{item}</p>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#c7ff4f]">
                  Learn more <span aria-hidden="true">→</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" data-reveal>
          <div className="mb-8 flex items-center gap-4">
            <span className="rounded-md bg-[#c7ff4f] px-3 py-1 text-sm font-bold">
              Our Working Process
            </span>
            <p className="text-sm text-[#555]">
              Step-by-step guidance to achieving your business goals.
            </p>
          </div>
          <div className="space-y-4">
            {processSteps.map((step, index) => {
              const active = index === activeStep;
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  className={`block w-full rounded-[24px] border border-[#191919] px-6 py-5 text-left shadow-[0_6px_0_rgba(25,25,25,0.06)] transition ${
                    active ? "bg-[#c7ff4f]" : "bg-white hover:bg-[#f2f2f2]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex gap-4">
                      <span className="min-w-[46px] text-[2rem] font-semibold tracking-[-0.04em]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="text-[1.2rem] font-semibold tracking-[-0.03em]">
                          {step.title}
                        </h3>
                        {active ? (
                          <p className="mt-4 max-w-[80ch] text-sm leading-7 text-[#3f3f3f]">
                            {step.body}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#191919]/25 bg-white text-xl">
                      {active ? "−" : "+"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section data-reveal>
          <div className="mb-8 flex items-center gap-4">
            <span className="rounded-md bg-[#c7ff4f] px-3 py-1 text-sm font-bold">
              Team
            </span>
            <p className="text-sm text-[#555]">
              Meet the skilled and experienced team behind successful audit strategy.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {team.map((member) => (
              <article
                key={member.name}
                className="rounded-[28px] border border-[#191919] bg-white p-5 shadow-[0_8px_0_rgba(25,25,25,0.06)]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#c7ff4f] text-2xl">
                    ✳
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{member.name}</h3>
                    <p className="text-sm text-[#5b5b5b]">{member.role}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-[#555]">
                  Expert review across UX, conversion, content, and customer
                  journey clarity.
                </p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Link
              href="/sign-in"
              className="inline-flex rounded-xl bg-[#191a23] px-5 py-3 text-sm font-semibold text-white"
            >
              See all team
            </Link>
          </div>
        </section>

        <section data-reveal>
          <div className="mb-8 flex items-center gap-4">
            <span className="rounded-md bg-[#c7ff4f] px-3 py-1 text-sm font-bold">
              Testimonials
            </span>
            <p className="text-sm text-[#555]">
              Hear from teams who used our UX audits to improve decision-making.
            </p>
          </div>
          <div className="rounded-[34px] bg-[#191a23] px-6 py-8 text-white md:px-10">
            <div className="grid gap-6 lg:grid-cols-3">
              {testimonials.map((item, index) => (
                <article
                  key={index}
                  className="rounded-[22px] border border-white/14 p-5"
                >
                  <p className="text-sm leading-7 text-white/78">{item}</p>
                  <div className="mt-5 text-sm font-semibold text-[#c7ff4f]">
                    John Smith
                  </div>
                  <div className="text-xs uppercase tracking-[0.1em] text-white/50">
                    Marketing Director at XYZ Corp
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="docs" data-reveal>
          <div className="mb-8 flex items-center gap-4">
            <span className="rounded-md bg-[#c7ff4f] px-3 py-1 text-sm font-bold">
              Contact Us
            </span>
            <p className="text-sm text-[#555]">
              Connect with us. Let&apos;s discuss your digital marketing needs.
            </p>
          </div>
          <div className="grid gap-8 rounded-[34px] bg-[#efebe4] px-6 py-8 md:grid-cols-[0.85fr_0.55fr] md:px-10">
            <form className="space-y-4">
              <div className="flex gap-6 text-sm font-medium text-[#333]">
                <label className="flex items-center gap-2">
                  <input type="radio" defaultChecked name="contactType" />
                  Say Hi
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="contactType" />
                  Get a Quote
                </label>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Name</label>
                <input
                  className="w-full rounded-xl border border-[#191919]/15 bg-white px-4 py-3 outline-none"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email*</label>
                <input
                  className="w-full rounded-xl border border-[#191919]/15 bg-white px-4 py-3 outline-none"
                  placeholder="Email"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Message*</label>
                <textarea
                  rows={5}
                  className="w-full rounded-xl border border-[#191919]/15 bg-white px-4 py-3 outline-none"
                  placeholder="Message"
                />
              </div>
              <button
                type="button"
                className="inline-flex rounded-xl bg-[#191a23] px-6 py-3 text-sm font-semibold text-white"
              >
                Send Message
              </button>
            </form>

            <div className="relative min-h-[320px] overflow-hidden rounded-[28px] bg-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_27%,rgba(25,26,35,0.08)_28%,transparent_29%),repeating-conic-gradient(from_0deg,rgba(25,26,35,0.18)_0deg,rgba(25,26,35,0.18)_2deg,transparent_2deg,transparent_10deg)] opacity-70" />
              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#191a23]" />
              <div className="absolute bottom-10 left-10 text-5xl text-[#c7ff4f]">✦</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
