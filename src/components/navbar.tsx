"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createDefaultSession,
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
  const [session, setSession] = useState<AppSession>(() => createDefaultSession());
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    localStorage.removeItem("theme");
    localStorage.removeItem("ux-audit-theme");
  }, []);

  useEffect(() => {
    const storageSnapshot = window.localStorage.getItem(SESSION_STORAGE_KEY);
    void fetchAppSession({ expectedStorageValue: storageSnapshot })
      .then((next) => {
        if (window.localStorage.getItem(SESSION_STORAGE_KEY) === storageSnapshot) {
          setSession(next);
        }
        setSessionLoaded(true);
      })
      .catch(() => undefined);

    const syncSession = () => {
      setSession(readAppSession());
      setSessionLoaded(true);
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
    router.replace("/sign-in");
    router.refresh();
  }

  const isGuest = session.email === "guest@local.test";
  const displayName =
    session.name?.trim() ||
    (session.email && session.email !== "guest@local.test"
      ? session.email.split("@")[0].replace(/[._-]+/g, " ")
      : "");

  return (
    <header className="fixed inset-x-0 top-0 z-50 w-full bg-[#f6f1e8] px-16 pt-5 text-[#191919]">
      <div className="mx-auto flex max-w-none items-center justify-between gap-6 rounded-full border border-[#101010]/10 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-bold tracking-[-0.03em] text-[#191919]">
          <img
            src="/tool%20logo.svg"
            alt="UX Audit Tool"
            className="h-8 w-8 shrink-0 object-contain"
            draggable={false}
          />
          <span>Design AID Audit</span>
        </Link>

        <div className="hidden items-center gap-3 lg:flex">
          {isGuest ? (
            <Link
              href="/sign-in?returnTo=/report"
              className="inline-flex items-center rounded-full border border-[#191919]/12 bg-white px-4 py-2 text-sm font-medium text-[#191919] transition"
            >
              Sign in
            </Link>
          ) : (
            <div className="inline-flex items-center text-sm font-medium">
              <span className="text-[#191919]">{displayName}</span>
              <span className="mx-2 text-[#191919]/35">|</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-[#ff4d3a] transition hover:text-[#ff4d3a]/85"
              >
                Log out
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
}
