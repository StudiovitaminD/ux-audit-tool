"use client";

import { useEffect, useState } from "react";
import { AdminDashboard, type AdminDashboardProps } from "@/components/admin/admin-dashboard";

type AdminDashboardClientProps = {
  session: {
    email: string;
    name: string;
  };
};

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
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

  if (error) {
    return (
      <div className="rounded-[32px] border border-[color:var(--cream-dark)] bg-white p-6 text-sm text-[color:var(--ink-muted)]">
        {error}
      </div>
    );
  }

  if (!data) return <DashboardSkeleton />;

  return <AdminDashboard {...data} />;
}
