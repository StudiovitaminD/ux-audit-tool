"use client";

import Image from "next/image";
import Link from "next/link";

import companyLogo from "../../../Company logo.png";
import companyLogo1 from "../../../Company logo-1.png";
import companyLogo2 from "../../../Company logo-2.png";
import companyLogo3 from "../../../Company logo-3.png";
import companyLogo4 from "../../../Company logo-4.png";
import companyLogo5 from "../../../Company logo-5.png";

const logos = [
  { src: companyLogo, alt: "Company logo" },
  { src: companyLogo1, alt: "Company logo 1" },
  { src: companyLogo2, alt: "Company logo 2" },
  { src: companyLogo3, alt: "Company logo 3" },
  { src: companyLogo4, alt: "Company logo 4" },
  { src: companyLogo5, alt: "Company logo 5" },
];

export function LandingHero() {
  return (
    <section className="relative w-full overflow-hidden bg-[color:var(--surface)] text-[#161616]">
      <div className="mx-auto max-w-[1440px] px-16 pt-[152px] pb-12 sm:pb-16 lg:pb-20">
        <div
          className="grid items-center gap-5 lg:grid-cols-[0.92fr_1.08fr]"
          data-reveal
        >
          <div className="max-w-[580px]">
            <h1
              className="max-w-[15ch] text-[clamp(3.25rem,5.9vw,5.9rem)] leading-[0.92] tracking-[-0.03em] text-[#101010]"
            >
              <span className="block whitespace-nowrap">Navigating the</span>
              <span className="block whitespace-nowrap">digital landscape</span>
              <span className="block whitespace-nowrap">for success</span>
            </h1>

            <p className="mt-6 w-full max-w-none text-[17px] font-normal leading-8 tracking-[-0.02em] text-[#5b5b5b]">
              Our digital UX audit platform helps teams spot friction fast, turn findings into
              action, and present executive-ready recommendations.
            </p>

            <div className="mt-8">
              <Link
                href="/audit"
                className="inline-flex h-12 items-center rounded-full bg-[#101010] px-7 text-[15px] font-semibold text-white shadow-[0_16px_36px_rgba(16,16,16,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1b1b1b]"
              >
                Start quick audit
              </Link>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[620px]">
              <video
                className="h-auto w-full object-contain"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="UX audit dashboard animation"
              >
                <source src="/Hero Video.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8" data-reveal>
          <div className="overflow-hidden">
            <div className="tickerTrack flex w-max items-center gap-14">
              {[...logos, ...logos].map((logo, index) => (
                <div
                  key={`${logo.alt}-${index}`}
                  className="flex min-w-[180px] items-center justify-center opacity-90"
                >
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    className="h-10 w-auto object-contain sm:h-11"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
