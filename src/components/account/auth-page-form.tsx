"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createDefaultSession,
  fetchAppSession,
  readAppSession,
  signInWithPassword,
  signUpWithPassword,
  type AppSession,
} from "@/lib/app-session";

type AuthPageFormProps = {
  mode: "sign-in" | "sign-up";
};

function normalizeReturnTo(value: string | null) {
  if (!value || !value.trim()) return "/audit";
  if (!value.startsWith("/")) return "/audit";
  if (value.startsWith("//")) return "/audit";
  return value;
}

export function AuthPageForm({ mode }: AuthPageFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<AppSession>(() => createDefaultSession());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get("returnTo")),
    [searchParams],
  );

  useEffect(() => {
    setSession(readAppSession());
    void fetchAppSession()
      .then((next) => {
        setSession(next);
      })
      .catch(() => undefined);
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

    try {
      const next = isSignUp
        ? await signUpWithPassword({ email, name, password })
        : await signInWithPassword({ email, password });
      setSession(next);
      router.replace(returnTo);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  const isSignUp = mode === "sign-up";

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-16">
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-[32px] border border-[color:var(--cream-dark)] bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.06)] sm:p-10">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
            {isSignUp ? "Create your account" : "Welcome back"}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-[color:var(--ink)] sm:text-4xl">
            {isSignUp ? "Sign up to save and unlock reports" : "Sign in to continue your audit"}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--ink-muted)] sm:text-base">
            {isSignUp
              ? "Create a server-backed account to keep your reports, track free usage, and unlock paid access when your email is added to the allowlist."
              : "Use your work email to restore your account session, reopen saved reports, and continue from where you left off."}
          </p>

          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            {isSignUp ? (
              <label className="block">
                <div className="mb-2 text-sm font-medium text-[color:var(--ink)]">Your name</div>
                <input
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/5"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            ) : null}

            <label className="block">
              <div className="mb-2 text-sm font-medium text-[color:var(--ink)]">Work email</div>
              <input
                type="email"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/5"
                placeholder="jane@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="block">
              <div className="mb-2 text-sm font-medium text-[color:var(--ink)]">
                {isSignUp ? "New password" : "Password"}
              </div>
              <input
                type="password"
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/20 focus:ring-2 focus:ring-black/5"
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
              className="btnPrimary w-full justify-center"
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

        <div className="rounded-[32px] border border-[color:var(--cream-dark)] bg-[linear-gradient(180deg,#fff_0%,#faf5ea_100%)] p-8 sm:p-10">
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--ink-muted)]">
            What you get
          </div>
          <div className="mt-6 space-y-4">
            {[
              "Free users can create up to 3 website or ecommerce reports.",
              "Paid users unlock the full report instead of the preview-locked version.",
              "Admin users can access SaaS audits while that flow is still private.",
              "Your session is stored on the server so reports stay tied to your account email.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4 text-sm leading-6 text-[color:var(--ink)]"
              >
                {item}
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-black/8 bg-white/80 p-5 text-sm leading-6 text-[color:var(--ink-muted)]">
            Emails listed in <code>PAID_EMAILS</code> or <code>ADMIN_EMAILS</code> are upgraded
            automatically after sign-in.
          </div>
        </div>
      </div>
    </section>
  );
}
