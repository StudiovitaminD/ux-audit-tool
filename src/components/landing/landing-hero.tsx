"use client";

import Image from "next/image";
import Link from "next/link";

import frame14 from "../../../Frame 14.png";
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
    <section className="relative w-full overflow-hidden bg-[#f8f4ed] text-[#161616]">
      <div className="mx-auto max-w-[1440px] px-16 py-12 sm:py-16 lg:py-20">
        <div
          className="grid items-center gap-12 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10"
          data-reveal
        >
          <div className="max-w-[580px]">
            <h1
              className="max-w-[11ch] text-[clamp(3.25rem,6vw,6.1rem)] font-semibold leading-[0.96] tracking-[-0.05em] text-[#111111]"
              style={{ wordSpacing: "0.12em" }}
            >
              <span className="block">Navigating the</span>
              <span className="block">digital landscape</span>
              <span className="block">for success</span>
            </h1>

            <p className="mt-6 max-w-[36ch] text-[17px] leading-8 text-[#5b5b5b]">
              Our digital UX audit platform helps teams spot friction fast, turn
              findings into action, and present executive-ready recommendations.
            </p>

            <div className="mt-8">
              <Link
                href="/audit"
                className="inline-flex h-12 items-center rounded-full bg-[#111111] px-7 text-[15px] font-semibold text-white shadow-[0_16px_36px_rgba(17,17,17,0.16)] transition hover:-translate-y-0.5 hover:bg-[#1d1d1d]"
              >
                Start quick audit
              </Link>
            </div>
          </div>

          <div className="relative flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[720px]">
              <Image
                src={frame14}
                alt="UX audit dashboard illustration"
                priority
                className="h-auto w-full object-contain"
              />
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
