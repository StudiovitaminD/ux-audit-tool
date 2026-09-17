"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminDashboard, type AdminDashboardProps } from "@/components/admin/admin-dashboard";
import { type AdminAuditModelChoice, DEFAULT_ADMIN_AUDIT_MODEL_CHOICE } from "@/lib/admin-model-types";

type AdminDashboardClientProps = {
  session: {
    email: string;
    name: string;
  };
};

function DashboardSkeleton() {
  return (
    <div className="space-y-8 p-5 sm:p-8 lg:p-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-[148px] rounded-[28px] border border-[color:var(--cream-dark)] bg-white/80 p-6">
            <div className="h-3 w-24 rounded-full bg-[color:var(--cream)]" />
            <div className="mt-4 h-8 w-20 rounded-full bg-[color:var(--cream)]" />
            <div className="mt-3 h-4 w-full rounded-full bg-[color:var(--cream)]/80" />
          </div>
        ))}
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="h-[360px] rounded-[28px] border border-[color:var(--cream-dark)] bg-white/80 p-6">
          <div className="h-3 w-36 rounded-full bg-[color:var(--cream)]" />
          <div className="mt-4 h-4 w-2/3 rounded-full bg-[color:var(--cream)]/80" />
          <div className="mt-8 h-64 rounded-[24px] bg-[color:var(--cream)]/70" />
        </div>
        <div className="h-[360px] rounded-[28px] border border-[color:var(--cream-dark)] bg-white/80 p-6">
          <div className="h-3 w-32 rounded-full bg-[color:var(--cream)]" />
          <div className="mt-4 h-4 w-2/3 rounded-full bg-[color:var(--cream)]/80" />
          <div className="mt-8 h-64 rounded-[24px] bg-[color:var(--cream)]/70" />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="h-[360px] rounded-[28px] border border-[color:var(--cream-dark)] bg-white/80 p-6" />
        <div className="space-y-6">
          <div className="h-[280px] rounded-[28px] border border-[color:var(--cream-dark)] bg-white/80 p-6" />
          <div className="h-[280px] rounded-[28px] border border-[color:var(--cream-dark)] bg-white/80 p-6" />
        </div>
      </div>
    </div>
  );
}

export function AdminDashboardClient({ session }: AdminDashboardClientProps) {
  const [data, setData] = useState<AdminDashboardProps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingChoice, setSavingChoice] = useState(false);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [auditModelChoice, setAuditModelChoice] = useState<AdminAuditModelChoice>(
    DEFAULT_ADMIN_AUDIT_MODEL_CHOICE,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/admin/dashboard", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | ({ error?: string } & Partial<AdminDashboardProps>)
          | null;

        if (!response.ok || !payload) {
          throw new Error(payload?.error || "Failed to load dashboard.");
        }
        if (cancelled) return;
        setData({
          session,
          auditModelChoice:
            payload.auditModelChoice === "free" || payload.auditModelChoice === "paid"
              ? payload.auditModelChoice
              : DEFAULT_ADMIN_AUDIT_MODEL_CHOICE,
          metrics: payload.metrics!,
          reportSeries: payload.reportSeries!,
          planMix: payload.planMix!,
          statusMix: payload.statusMix!,
          recentAudits: payload.recentAudits!,
          recentUsers: payload.recentUsers!,
          recentPayments: payload.recentPayments!,
        });
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (data?.auditModelChoice) {
      setAuditModelChoice(data.auditModelChoice);
    }
  }, [data?.auditModelChoice]);

  const hasChanges = useMemo(
    () => Boolean(data && auditModelChoice !== data.auditModelChoice),
    [auditModelChoice, data],
  );

  async function saveAuditModelChoice(nextChoice: AdminAuditModelChoice) {
    setChoiceError(null);
    setSavingChoice(true);
    try {
      const response = await fetch("/api/admin/dashboard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditModelChoice: nextChoice }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; auditModelChoice?: AdminAuditModelChoice } | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error || "Failed to update model choice.");
      }
      setAuditModelChoice(payload.auditModelChoice || nextChoice);
      setData((prev) =>
        prev
          ? {
              ...prev,
              auditModelChoice: payload.auditModelChoice || nextChoice,
            }
          : prev,
      );
    } catch (saveError) {
      setChoiceError(saveError instanceof Error ? saveError.message : "Failed to update model choice.");
    } finally {
      setSavingChoice(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-[32px] border border-[color:var(--cream-dark)] bg-white p-6 text-sm text-[color:var(--ink-muted)]">
        {error}
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  return (
    <div>
      {choiceError ? (
        <div className="mx-5 mt-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-8 lg:mx-10">
          {choiceError}
        </div>
      ) : null}
      <AdminDashboard {...data} auditModelChoice={auditModelChoice} />
      <div className="mx-5 mb-5 rounded-[30px] bg-white p-6 sm:mx-8 sm:mb-8 lg:mx-10 lg:mb-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[#111]">
              AI model tier
            </div>
            <p className="mt-1 text-sm text-[#8d8d88]">
              Choose which model tier new admin audits should use.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(["free", "paid"] as const).map((choice) => {
              const active = auditModelChoice === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => {
                    setAuditModelChoice(choice);
                    void saveAuditModelChoice(choice);
                  }}
                  disabled={savingChoice}
                  className={[
                    "rounded-full border px-5 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "border-[#111] bg-[#111] text-white"
                      : "border-[#e4e4e1] bg-[#f7f7f5] text-[#111] hover:bg-[#eeeeeb]",
                    savingChoice ? "opacity-60" : "",
                  ].join(" ")}
                >
                  {choice === "free" ? "Free" : "Paid"}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3 text-xs text-[#aaa]">
          {hasChanges ? "Saving… please wait" : "Changes are saved automatically."}
        </div>
      </div>
    </div>
  );
}
