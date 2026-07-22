"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  createDefaultSession,
  fetchAppSession,
  readAppSession,
  signOutAppSession,
  type AppSession,
} from "@/lib/app-session";

const navItems = [
  { label: "Features", href: "/#features" },
  { label: "How it Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Sample Report", href: "/report?demo=1" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTitleId = useId();
  const [session, setSession] = useState<AppSession>(() => createDefaultSession());

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme");
    localStorage.removeItem("ux-audit-theme");
  }, []);

  useEffect(() => {
    setSession(readAppSession());
    void fetchAppSession().then(setSession).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  async function handleSignOut() {
    const next = await signOutAppSession();
    setSession(next);
  }

  return (
    <header className="nav">
      <div className="container">
        <div className="navInner">
          <Link className="brand" href="/">
            <span className="wordmark">
              UX Aud<span className="wordmarkAccent">i</span>t
            </span>
          </Link>

          <nav className="navLinks" aria-label="Primary">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="navLink">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="navCtas">
            <Link className="btnSecondary" href="/report">
              Previous report
            </Link>
            {session.email === "guest@local.test" ? (
              <Link className="btnSecondary" href="/sign-in?returnTo=/audit">
                Sign In
              </Link>
            ) : (
              <button
                type="button"
                className="btnSecondary"
                onClick={handleSignOut}
              >
                {session.email} · Sign Out
              </button>
            )}
            <Link className="btnPrimary" href="/audit">
              Start Audit <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              className="hamburger"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="mobile-menu"
          className="menuOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={menuTitleId}
          onClick={() => setMenuOpen(false)}
        >
          <div className="menuPanel" onClick={(e) => e.stopPropagation()}>
            <div className="menuTop">
              <div id={menuTitleId} className="menuTitle">
                Menu
              </div>
              <button
                type="button"
                className="hamburger"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <svg
                  aria-hidden="true"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="menuLinks" aria-label="Mobile primary">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="menuLink"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="menuCtas">
              <Link
                className="btnPrimary"
                href="/audit"
                onClick={() => setMenuOpen(false)}
              >
                Start Audit <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
