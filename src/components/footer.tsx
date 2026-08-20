import Link from "next/link";

const footerLinks = {
  company: [
    { label: "About", href: "/#features" },
    { label: "Services", href: "/#features" },
    { label: "Use Cases", href: "/report?demo=1" },
    { label: "Pricing", href: "/pricing" },
  ],
  resources: [
    { label: "Start Audit", href: "/audit" },
    { label: "Sample Report", href: "/report?demo=1" },
    { label: "Sign In", href: "/sign-in" },
    { label: "Create Account", href: "/sign-up" },
  ],
};

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative w-full bg-[color:var(--surface)] px-16 pb-12 text-[#191919]">
      <div className="mx-auto max-w-none rounded-[36px] bg-[#101010] px-6 py-8 text-white shadow-[0_30px_80px_rgba(0,0,0,0.14)] md:px-10 md:py-10">
        <div className="flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[320px]">
            <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold tracking-[-0.03em]">
              <img
                src="/Asset%206@2x%201.svg"
                alt="UX"
                className="h-9 w-9 rounded-full bg-white object-contain"
                draggable={false}
              />
              <span>Design AID Audit</span>
            </Link>
            <p className="mt-4 text-sm leading-7 text-white/72">
              Premium AI-powered UX audits for public websites and ecommerce teams who need clearer findings, faster decisions, and cleaner executive reporting.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:min-w-[420px]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff8a1f]">
                Company
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm text-white/78">
                {footerLinks.company.map((link) => (
                  <Link key={link.label} href={link.href} className="transition hover:text-white">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#ff8a1f]">
                Resources
              </div>
              <div className="mt-4 flex flex-col gap-3 text-sm text-white/78">
                {footerLinks.resources.map((link) => (
                  <Link key={link.label} href={link.href} className="transition hover:text-white">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-md bg-[#ff8a1f] px-3 py-1 text-sm font-bold text-[#191919]">
              Contact us
            </div>
            <div className="mt-4 space-y-1 text-sm text-white/75">
              <p>Email: hello@aiuxaudittool.com</p>
              <p>Phone: +91 987 654 3210</p>
              <p>Mumbai, India</p>
            </div>
          </div>

          <div className="rounded-[24px] bg-white/6 p-4 sm:p-5">
            <p className="text-sm font-medium text-white/78">Stay in the loop with product updates</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="Email"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-[#ff8a1f] px-5 py-3 text-sm font-semibold text-[#191919]"
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div>© {year} Design AID Audit Tool. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="transition hover:text-white">Plans</Link>
            <Link href="/sign-in" className="transition hover:text-white">Sign in</Link>
            <Link href="/audit" className="transition hover:text-white">Start audit</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
