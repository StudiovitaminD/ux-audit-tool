"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  SESSION_CHANGE_EVENT,
  SESSION_STORAGE_KEY,
  buildOptimisticAppSession,
  fetchAppSession,
  readAppSession,
  signInWithPassword,
  signUpWithPassword,
  writeAppSession,
  type AppSession,
} from "@/lib/app-session";

type AuthPageFormProps = {
  mode: "sign-in" | "sign-up";
};

function normalizePlan(value: string | null) {
  return value === "paid" || value === "free" ? value : null;
}

function normalizeReportLimit(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.floor(parsed));
}

function normalizeReturnTo(value: string | null) {
  if (!value || !value.trim()) return "/report";
  if (!value.startsWith("/")) return "/report";
  if (value.startsWith("//")) return "/report";
  return value;
}

export function AuthPageForm({ mode }: AuthPageFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<AppSession>(() => readAppSession());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get("returnTo")),
    [searchParams],
  );
  const selectedPlan = useMemo(
    () => normalizePlan(searchParams.get("plan")),
    [searchParams],
  );
  const selectedReportLimit = useMemo(
    () => normalizeReportLimit(searchParams.get("reportLimit")),
    [searchParams],
  );

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
    if (session.email !== "guest@local.test") {
      router.replace(returnTo);
    }
  }, [returnTo, router, session.email]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const previousSession = session;
    const optimisticSession = buildOptimisticAppSession({
      email,
      name: isSignUp ? name : undefined,
      plan: isSignUp ? selectedPlan : null,
    });
    setSession(optimisticSession);
    writeAppSession(optimisticSession);

    try {
      const next = isSignUp
        ? await signUpWithPassword({
            email,
            name,
            password,
            plan: selectedPlan,
            reportLimit: selectedReportLimit,
          })
        : await signInWithPassword({ email, password });
      setSession(next);
      writeAppSession(next);
      router.replace(returnTo);
      router.refresh();
    } catch (submitError) {
      setSession(previousSession);
      writeAppSession(previousSession);
      setError(submitError instanceof Error ? submitError.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  const isSignUp = mode === "sign-up";

  return (
    <section className="flex h-full w-full items-center justify-center px-6">
      <div className="w-full max-w-[550px]">
        <div className="rounded-[32px] border border-[color:var(--cream-dark)] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)] sm:p-10">
          <div className="mb-8 flex items-center justify-center gap-3 text-[color:var(--ink)]">
            <img
              src="/tool%20logo.svg"
              alt="Design AID Audit"
              className="h-12 w-12 shrink-0 object-contain"
              draggable={false}
            />
            <span className="text-[26px] font-bold tracking-[-0.04em] sm:text-[30px]">
              Design AID Audit
            </span>
          </div>
          <h2 className="text-center">
            {isSignUp ? "Sign up to save and unlock reports" : "Sign in to continue your audit"}
          </h2>
          {isSignUp && selectedReportLimit ? (
            <div className="mt-5 rounded-2xl border border-black/8 bg-[color:var(--cream)]/40 px-4 py-3 text-sm leading-6 text-[color:var(--ink)]">
              Selected plan: <span className="font-semibold">{selectedReportLimit} reports</span>
              {selectedPlan === "paid" ? " on the paid plan." : "."} Your account will be capped at this volume after checkout.
            </div>
          ) : null}

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {isSignUp ? (
              <label className="block">
                <h3 className="mb-2">Your name</h3>
                <input
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[14px] outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/5"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            ) : null}

            <label className="block">
              <h3 className="mb-2">Work email</h3>
              <input
                type="email"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[14px] outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/5"
                placeholder="jane@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="block">
              <h3 className="mb-2">
                {isSignUp ? "New password" : "Password"}
              </h3>
              <input
                type="password"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-[14px] outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/5"
                placeholder={isSignUp ? "Create a new password" : "Enter your password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="btnPrimary authSubmitButton w-full justify-center"
              disabled={busy}
            >
              {busy
                ? isSignUp
                  ? "Creating account…"
                  : "Signing in…"
                : isSignUp
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          <div className="mt-5 text-sm text-[color:var(--ink-muted)]">
            {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
            <Link
              href={`${isSignUp ? "/sign-in" : "/sign-up"}?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-medium text-[color:var(--ink)] underline underline-offset-4"
            >
              {isSignUp ? "Sign in" : "Sign up"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
