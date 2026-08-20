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

export function Navbar() {
  const router = useRouter();
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

  async function handleSignOut() {
    const next = buildOptimisticAppSession({ email: "guest@local.test" });
    setSession(next);
    writeAppSession(next);
    void signOutAppSession().catch(() => undefined);
    router.replace("/report");
    router.refresh();
  }

  const isGuest = session.email === "guest@local.test";

  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full bg-[#f6f1e8] px-16 pt-5 text-[#191919]">
      <div className="mx-auto flex max-w-none items-center justify-between gap-6 rounded-full border border-[#101010]/10 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.03em] text-[#191919]">
          <img
            src="/Asset%206@2x%201.png"
            alt="UX"
            className="h-9 w-9 object-contain"
            draggable={false}
          />
          <span>Design AID Audit</span>
        </Link>

        <div className="hidden items-center gap-3 lg:flex">
          {session.role === "admin" ? (
            <Link
              href="/admin"
              className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
            >
              Dashboard
            </Link>
          ) : null}
          <Link
            href="/report"
            className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
          >
            Reports
          </Link>
          {isGuest ? (
            <Link
              href="/sign-in?returnTo=/audit"
              className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
            >
              Sign in
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition hover:-translate-y-0.5"
            >
              Log out
            </button>
          )}

          <Link
            href="/audit"
            className="inline-flex items-center rounded-full bg-[#101010] px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5"
          >
            Start audit <span className="ml-1.5" aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
