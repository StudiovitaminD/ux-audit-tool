"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  SESSION_CHANGE_EVENT,
  SESSION_STORAGE_KEY,
  fetchAppSession,
  readAppSession,
  reportsRemaining,
  type AppSession,
} from "@/lib/app-session";

function roleLabel(session: AppSession) {
  if (session.email === "guest@local.test") return "Guest";
  if (session.role === "admin") return "Admin";
  if (session.plan === "paid") return "Paid";
  return "Free";
}

export function AuditAccessPanel() {
  const [session, setSession] = useState<AppSession>(() => readAppSession());

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

  const remaining = useMemo(() => reportsRemaining(session), [session]);

  return (
    <div className="rounded-[var(--radius)] border border-[color:var(--cream-dark)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold tracking-[0.18em] text-[color:var(--ink-muted)] uppercase">
            Access
          </div>
          <div className="mt-2 text-lg font-semibold text-[color:var(--ink)]">
            {roleLabel(session)} audit access
          </div>
          <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
            {session.email === "guest@local.test"
              ? "Create an account and sign in before running audits."
              : session.role === "admin"
              ? "Full access to SaaS, ecommerce, and marketing website audits."
              : session.plan === "paid"
                ? "Full access to marketing website and ecommerce audits with complete reports."
                : "Free audits include preview-only reports with premium sections locked until upgrade."}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--cream-dark)] bg-[color:var(--cream)] px-4 py-3 text-sm">
          <div className="text-[color:var(--ink-muted)]">Plan</div>
          <div className="mt-1 font-semibold text-[color:var(--ink)]">{roleLabel(session)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-[color:var(--cream-dark)] bg-[color:var(--cream)]/50 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">Available audits</div>
          <div className="mt-2 text-sm font-medium text-[color:var(--ink)]">
            {session.email === "guest@local.test"
              ? "Sign in required"
              : session.role === "admin"
              ? "SaaS, ecommerce, marketing website"
              : "Ecommerce, marketing website"}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--cream-dark)] bg-[color:var(--cream)]/50 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">Reports remaining</div>
          <div className="mt-2 text-sm font-medium text-[color:var(--ink)]">
            {session.email === "guest@local.test"
              ? "Sign in to activate a plan"
              : remaining === null
                ? "Unlimited"
                : `${remaining} of ${session.reportLimit} reports left`}
          </div>
        </div>
        <div className="rounded-2xl border border-[color:var(--cream-dark)] bg-[color:var(--cream)]/50 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">Report access</div>
          <div className="mt-2 text-sm font-medium text-[color:var(--ink)]">
            {session.email === "guest@local.test"
              ? "Sign in required"
              : session.plan === "paid" || session.role === "admin"
              ? "Full report + exports"
              : "Overview + executive summary preview"}
          </div>
        </div>
      </div>

      {session.plan === "free" && session.role !== "admin" ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/pricing" className="btnSecondary">
            View plans
          </Link>
          <Link href="/sign-up?returnTo=/pricing" className="btnPrimary">
            Upgrade account
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function ReportAccessPanel({
  reportAccessLevel,
  lockedSections,
}: {
  reportAccessLevel: string;
  lockedSections: string[];
}) {
  if (reportAccessLevel !== "free_preview") return null;

  const prettyNames = lockedSections.map((item) =>
    item
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" "),
  );

  return (
    <div className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <div className="text-sm font-semibold tracking-[0.18em] uppercase text-amber-800">
        Preview Report
      </div>
      <div className="mt-2 text-lg font-semibold">
        This is a free preview of the audit.
      </div>
      <div className="mt-2 text-sm text-amber-900/80">
        Unlock the full report to access deeper synthesis, competitor analysis, AI bucket answers, critical findings, roadmap pages, and exports.
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {prettyNames.map((label) => (
          <span
            key={label}
            className="inline-flex rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900"
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/pricing" className="btnSecondary">
          View plans
        </Link>
        <Link href="/sign-up?returnTo=/pricing" className="btnPrimary">
          Unlock full report
        </Link>
      </div>
    </div>
  );
}
