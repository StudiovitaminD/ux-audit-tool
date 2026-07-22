import Link from "next/link";

const productLinks = [
  { label: "Start Audit", href: "/audit" },
  { label: "Sample Report", href: "/report" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "/pricing" },
];

const resourcesLinks = [
  { label: "How it Works", href: "#how-it-works" },
  { label: "Docs", href: "#docs" },
];

const companyLinks = [{ label: "Contact", href: "#docs" }];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="siteFooter" aria-label="Footer">
      <section className="ctaBand" aria-label="CTA band">
        <div className="ctaBandMark" aria-hidden="true">
          A
        </div>
        <div className="container">
          <div className="reveal visible">
            <div className="sectionLabel" style={{ color: "rgba(255,255,255,0.7)" }}>
              Start here
            </div>
            <div className="ctaBandTitle">
              Ready to run an <em style={{ fontStyle: "italic" }}>audit</em>?
            </div>
            <div className="ctaBandBody">
              Upload flows and product context. Get a structured report with severity,
              priorities, and clear next steps.
            </div>
            <Link className="ctaBandBtn" href="/audit">
              Start Audit <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <div className="footerMain">
        <div className="container">
          <div className="footerGrid">
            <div className="footerBrand">
              <Link className="brand" href="/">
                <span className="wordmark">
                  UX Aud<span className="wordmarkAccent">i</span>t
                </span>
              </Link>
              <p className="footerTagline">
                AI-powered UX audits with scores, risk analysis, accessibility
                insights, and conversion-focused recommendations.
              </p>
            </div>

            <div className="footerCol">
              <div className="footerColTitle">Product</div>
              <div className="footerLinks">
                {productLinks.map((l) => (
                  <Link key={l.label} href={l.href} className="footerLink">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="footerCol">
              <div className="footerColTitle">Resources</div>
              <div className="footerLinks">
                {resourcesLinks.map((l) => (
                  <Link key={l.label} href={l.href} className="footerLink">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="footerCol">
              <div className="footerColTitle">Company</div>
              <div className="footerLinks">
                {companyLinks.map((l) => (
                  <Link key={l.label} href={l.href} className="footerLink">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="footerBottom">
            <div>© {year} AI UX Audit Tool</div>
            <div className="footerPowered">
              Powered by n8n
              <span className="footerDot" aria-hidden="true">
                ·
              </span>
              Your workflow
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
