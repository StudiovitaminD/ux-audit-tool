"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  SESSION_CHANGE_EVENT,
  buildOptimisticAppSession,
  fetchAppSession,
  readAppSession,
  SESSION_STORAGE_KEY,
  writeAppSession,
  signOutAppSession,
  type AppSession,
} from "@/lib/app-session";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Pricing", href: "/pricing" },
  { label: "Sample Report", href: "/report?demo=1" },
];

export function Navbar() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [session, setSession] = useState<AppSession>(() => readAppSession());

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme");
    localStorage.removeItem("ux-audit-theme");
  }, []);

  useEffect(() => {
    const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
    setSession(readAppSession());
    void fetchAppSession({ expectedStorageValue: storageSnapshot })
      .then((next) => {
        if (window.localStorage.getItem(SESSION_STORAGE_KEY) === storageSnapshot) {
          setSession(next);
        }
      })
      .catch(() => undefined);

    const syncSession = () => {
      setSession(readAppSession());
    };
    window.addEventListener("storage", syncSession);
    window.addEventListener(SESSION_CHANGE_EVENT, syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener(SESSION_CHANGE_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  async function handleSignOut() {
    const next = buildOptimisticAppSession({ email: "guest@local.test" });
    setSession(next);
    writeAppSession(next);
    void signOutAppSession().catch(() => undefined);
    setMenuOpen(false);
    router.replace("/");
    router.refresh();
  }

  const isGuest = session.email === "guest@local.test";
  const showAdminLink = session.role === "admin";
  const visibleNavItems = showAdminLink
    ? [...navItems, { label: "Dashboard", href: "/admin" }]
    : navItems;

  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full bg-[#f6f1e8] px-16 pt-5 text-[#191919]">
      <div className="mx-auto flex max-w-none items-center justify-between gap-6 rounded-full border border-[#101010]/10 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-[-0.03em] text-[#191919]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#101010] text-xs font-semibold text-white">
            UX
          </span>
          <span>AI UX Audit</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-[#4d4d4d] lg:flex">
          {visibleNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-[#191919]">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {isGuest ? (
            <Link
              href="/sign-in?returnTo=/audit"
              className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
            >
              Sign in
            </Link>
          ) : (
            <>
              <Link
                href="/report"
                className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
              >
                Previous report
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
              >
                Sign out
              </button>
            </>
          )}

          <Link
            href="/audit"
            className="inline-flex items-center rounded-full bg-[#101010] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          >
            Start audit <span className="ml-1.5" aria-hidden="true">→</span>
          </Link>
        </div>

        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#101010]/12 bg-white text-[#101010] lg:hidden"
        >
          <span className="text-lg leading-none">{menuOpen ? "×" : "≡"}</span>
        </button>
      </div>

      {menuOpen ? (
        <div className="mx-auto mt-3 max-w-none rounded-[28px] border border-[#101010]/10 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.08)] lg:hidden">
          <div className="flex flex-col gap-4 text-sm font-medium text-[#101010]">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-2xl border border-[#191919]/8 px-4 py-3"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {isGuest ? (
              <Link
                href="/sign-in?returnTo=/audit"
                onClick={() => setMenuOpen(false)}
                className="inline-flex justify-center rounded-full border border-[#191919]/12 bg-white px-4 py-3 text-sm font-medium text-[#191919]"
              >
                Sign in
              </Link>
            ) : (
              <>
                <Link
                  href="/report"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex justify-center rounded-full border border-[#191919]/12 bg-white px-4 py-3 text-sm font-medium text-[#191919]"
                >
                  Previous report
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex justify-center rounded-full border border-[#191919]/12 bg-white px-4 py-3 text-sm font-medium text-[#191919]"
                >
                  Sign out
                </button>
              </>
            )}

            {showAdminLink ? (
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="inline-flex justify-center rounded-full border border-[#191919]/12 bg-white px-4 py-3 text-sm font-medium text-[#191919]"
              >
                Admin
              </Link>
            ) : null}

            <Link
              href="/audit"
              onClick={() => setMenuOpen(false)}
              className="inline-flex justify-center rounded-full bg-[#191919] px-5 py-3 text-sm font-semibold text-white"
            >
              Start audit <span className="ml-1.5" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
