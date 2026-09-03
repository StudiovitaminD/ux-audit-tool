"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import plusIcon from "../../../+.png";
import minusIcon from "../../../-.png";

const services = [
  {
    title: "Visual Feedback",
    tone: "dark",
    copy: "Check hover, click, loading, and success feedback so every action feels responsive.",
  },
  {
    title: "Color & Contrast",
    tone: "light",
    copy: "Review contrast, color reliance, and legibility so the interface remains readable for everyone.",
  },
  {
    title: "Typography & Readability",
    tone: "dark",
    copy: "Assess type scale, hierarchy, spacing, and scanability so content is easy to read and compare.",
  },
  {
    title: "Keyboard Navigation",
    tone: "light",
    copy: "Identify tab order, focus states, and keyboard-only gaps that block efficient interaction.",
  },
  {
    title: "Screen Reader Support",
    tone: "light",
    copy: "Review semantic HTML, ARIA, labels, and alt text so assistive tech can interpret the experience.",
  },
  {
    title: "Navigation & Findability",
    tone: "dark",
    copy: "Check menus, pathways, labels, and search cues so users can find what they need quickly.",
  },
  {
    title: "Consistency & UI Patterns",
    tone: "light",
    copy: "Compare repeated components, styles, and interaction patterns to reduce friction and confusion.",
  },
  {
    title: "Content (Impact)",
    tone: "dark",
    copy: "Review copy clarity, messaging hierarchy, and microcopy so content supports every action.",
  },
  {
    title: "Performance",
    tone: "light",
    copy: "Prioritise the highest-impact UX fixes that improve conversion, trust, and load performance.",
  },
  {
    title: "Visual Consistency",
    tone: "dark",
    copy: "Assess spacing, structure, emphasis, and page flow so key information stands out.",
  },
  {
    title: "Motion & Microinteractions",
    tone: "light",
    copy: "Check transitions and small interaction cues so feedback feels polished without distraction.",
  },
  {
    title: "Content (Delight)",
    tone: "dark",
    copy: "Review tone, personality, and microcopy so writing feels warm, distinctive, and on-brand.",
  },
  {
    title: "Brand Expression",
    tone: "light",
    copy: "Check whether the visual language feels distinctive, memorable, and aligned with the brand.",
  },
  {
    title: "Icons & Imagery",
    tone: "dark",
    copy: "Review icon clarity and image quality so visuals support understanding instead of adding noise.",
  },
];

const caseStudies = [
  "For a local restaurant, we improved a targeted PPC campaign and surfaced 18% more leads in the first month after UX fixes.",
  "For a B2B software company, we reduced funnel drop-off and improved form completion after finding errors in the request journey.",
  "For a national retail chain, we created a social-media-to-landing experience that improved engaged sessions and discovery.",
];

const processSteps = [
  {
    title: "Primary audit details",
    body: "Capture the main audit focus, context, and goals so the flow starts with the right brief.",
  },
  {
    title: "Product details",
    body: "Add the product type, business model, and key pages or screens that need review.",
  },
  {
    title: "User and business Details",
    body: "Provide audience, market, and business context so the audit reflects real user and commercial needs.",
  },
  {
    title: "Product URL + credentials",
    body: "Share the URL and any access details needed to review the live experience safely.",
  },
  {
    title: "Audit flow",
    body: "Outline the audit path so the experience can be reviewed and completed in the right order.",
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
  {
    title: "Ecommerce",
    quote:
      "The audit gave us a sharper picture of the journey gaps slowing down checkout conversion.",
    author: "Kathrine Katija",
    role: "Marketing Manager, ABC Ad Services",
  },
  {
    title: "SaaS",
    quote:
      "We used the report to align product, content, and performance marketing around the same improvements.",
    author: "Jordan Lee",
    role: "Growth Lead, Northstar SaaS",
  },
  {
    title: "Website UX",
    quote:
      "The executive summary made it easy to explain UX priorities to non-design stakeholders.",
    author: "Maya Patel",
    role: "Head of Design, Bright Studio",
  },
];

function toneClasses(tone: "light" | "lime" | "dark") {
  if (tone === "lime") return "bg-[#fff4e8] text-[#191919]";
  if (tone === "dark") return "bg-[#101010] text-white";
  return "bg-white text-[#191919]";
}

export function LandingSections() {
  const [activeStep, setActiveStep] = useState<number | null>(0);

  return (
    <div className="relative w-full bg-[color:var(--surface)] px-16 pb-20 text-[#101010]">
      <div className="mx-auto max-w-none space-y-20">
        <section id="features" data-reveal>
          <div className="mb-16 flex items-center gap-4">
            <h3 className="inline-flex text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101010]">
              UX Buckets
            </h3>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <article
                key={service.title}
                className={`h-fit rounded-[28px] border border-[#101010] p-[30px] ${toneClasses(service.tone as "light" | "lime" | "dark")}`}
              >
                <div className="flex h-full flex-col gap-5">
                  <div>
                    <h4
                      className={`block w-full whitespace-normal text-balance leading-[1.05] ${service.tone === "dark" ? "text-white" : "text-[#101010]"}`}
                    >
                      {service.title}
                    </h4>
                    <p
                      className={`mt-5 max-w-[30ch] text-sm leading-6 ${service.tone === "dark" ? "text-white/75" : "text-[#4d4d4d]"}`}
                    >
                      {service.copy}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" data-reveal>
          <div className="mb-16 flex items-center gap-4">
            <h3 className="inline-flex text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101010]">
              UX Form Flow
            </h3>
          </div>
          <div className="space-y-4">
            {processSteps.map((step, index) => {
              const active = index === activeStep;
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setActiveStep(active ? null : index)}
                  className={`block w-full rounded-[24px] border border-[#101010] px-6 py-5 text-left transition ${
                    active ? "bg-[#fff4e8]" : "bg-white hover:bg-[#f8f1e7]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <span className="w-[46px] shrink-0 text-[40px] font-medium leading-none tracking-[-0.04em]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h2 className="min-w-0 text-[1.2rem] font-medium leading-none tracking-[-0.03em]">
                        {step.title}
                      </h2>
                    </div>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#101010]/25 bg-white">
                      <Image
                        src={active ? minusIcon : plusIcon}
                        alt={active ? "Collapse step" : "Expand step"}
                        className="h-4 w-4 object-contain"
                      />
                    </span>
                  </div>
                  {active ? (
                    <div className="mt-5">
                      <p className="mt-4 whitespace-nowrap text-sm leading-7 text-[#3f3f3f]">
                        {step.body}
                      </p>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section data-reveal>
          <div className="mb-16 flex items-center gap-4">
            <h3 className="inline-flex text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101010]">
              Testimonials
            </h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
            <div className="space-y-3">
              {testimonials.map((item, index) => {
                const active = index === 1;
                return (
                  <article
                    key={item.title}
                    className={`overflow-hidden rounded-[28px] border p-4 ${
                      active
                        ? "border-[#ff8a1f] bg-[#fff4e8]"
                        : "border-[#e7e0d4] bg-white"
                    }`}
                  >
                    <div
                      className={`h-[132px] rounded-[22px] ${
                        index === 0
                          ? "bg-[linear-gradient(135deg,#0f0f0f_0%,#3b3b3b_100%)]"
                          : index === 1
                            ? "bg-[linear-gradient(135deg,#d4b59a_0%,#6f3f2f_55%,#1f1a1a_100%)]"
                            : "bg-[linear-gradient(135deg,#d9d9d9_0%,#8f8f8f_100%)]"
                      }`}
                    />
                    <div className="mt-3 text-sm font-semibold text-[#101010]">
                      {item.title}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="relative overflow-hidden rounded-[34px] bg-white px-6 py-8 text-[#101010] md:px-10 md:py-10">
              <div className="pointer-events-none absolute right-8 top-4 select-none text-[18rem] font-semibold leading-none text-[#101010]/4">
                “
              </div>
              <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <p className="max-w-[18ch] text-[clamp(2rem,3.5vw,4.1rem)] leading-[1.02] tracking-[-0.05em]">
                    {testimonials[1].quote}
                  </p>
                  <p className="mt-5 max-w-[48ch] text-[17px] leading-7 text-[#5a5a5a]">
                    Trust her work, that the words that she delivered completely transformed our brand
                    presence.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-[1.05rem] font-semibold tracking-[-0.03em]">
                      {testimonials[1].author}
                    </div>
                    <div className="text-sm text-[#6a6a6a]">{testimonials[1].role}</div>
                  </div>
                  <div className="h-px w-full bg-[#101010]/20" />
                  <div className="flex justify-end gap-1 text-[#ff3b30]">
                    {"★★★★★".split("").map((star, index) => (
                      <span key={index}>{star}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="docs" data-reveal>
          <div className="mb-16 flex items-center gap-4">
            <h3 className="inline-flex text-[40px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#101010]">
              Contact Us
            </h3>
          </div>
          <div className="grid gap-8 rounded-[34px] bg-[#efebe4] px-6 py-8 md:grid-cols-[0.85fr_0.55fr] md:px-10">
            <form className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Name</label>
                <input
                  type="text"
                  spellCheck
                  lang="en"
                  className="w-full rounded-xl border border-[#101010]/15 bg-white px-4 py-3 outline-none"
                  placeholder="Name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email*</label>
                <input
                  className="w-full rounded-xl border border-[#101010]/15 bg-white px-4 py-3 outline-none"
                  placeholder="Email"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Message*</label>
                <textarea
                  rows={5}
                  spellCheck
                  lang="en"
                  className="w-full rounded-xl border border-[#101010]/15 bg-white px-4 py-3 outline-none"
                  placeholder="Message"
                />
              </div>
              <button
                type="button"
                className="inline-flex rounded-xl bg-[#101010] px-6 py-3 text-sm font-semibold text-white"
              >
                Send Message
              </button>
            </form>

            <div className="relative min-h-[320px] overflow-hidden rounded-[28px] bg-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_27%,rgba(25,26,35,0.08)_28%,transparent_29%),repeating-conic-gradient(from_0deg,rgba(25,26,35,0.18)_0deg,rgba(25,26,35,0.18)_2deg,transparent_2deg,transparent_10deg)] opacity-70" />
              <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-[#101010]" />
              <div className="absolute bottom-10 left-10 text-5xl text-[#c7ff4f]">✦</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
