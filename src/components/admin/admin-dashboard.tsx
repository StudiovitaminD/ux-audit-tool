import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export type AdminAuditRow = {
  id: string;
  createdAt: string;
  status: string;
  userEmail: string;
  userRole: string;
  planType: string;
  productType: string;
  overallScore: number | null;
};

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  reportsUsed: number;
  reportLimit: number;
  lastLoginAt: string;
  paidAt: string;
  paymentSource: string;
};

export type AdminPaymentRow = {
  id: string;
  email: string;
  userId: string;
  plan: string;
  reportLimit: number;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  paidAt: string;
  paymentSource: string;
};

export type AdminDashboardMetrics = {
  totalAudits: number;
  completedAudits: number;
  queuedAudits: number;
  totalUsers: number;
  paidUsers: number;
  adminUsers: number;
  collectedRevenue: number;
  averageScore: number | null;
  paymentSuccessRate: number | null;
};

export type AdminDashboardSeriesPoint = {
  label: string;
  value: number;
};

export type AdminDashboardProps = {
  session: {
    email: string;
    name: string;
  };
  metrics: AdminDashboardMetrics;
  reportSeries: AdminDashboardSeriesPoint[];
  planMix: Array<{ label: string; value: number; tone: string }>;
  statusMix: Array<{ label: string; value: number; tone: string }>;
  recentAudits: AdminAuditRow[];
  recentUsers: AdminUserRow[];
  recentPayments: AdminPaymentRow[];
};

function cx(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function scoreClass(score: number | null) {
  if (score === null) return "bg-[#ece7df] text-[#7a6d5e]";
  if (score >= 80) return "bg-[#e4f6ea] text-[#1f7f47]";
  if (score >= 60) return "bg-[#fff3d8] text-[#9a6600]";
  return "bg-[#fde8e8] text-[#b03a3a]";
}

function statusClass(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "complete" || normalized === "paid") {
    return "bg-[#e4f6ea] text-[#1f7f47]";
  }
  if (normalized === "processing" || normalized === "queued" || normalized === "created") {
    return "bg-[#fff3d8] text-[#9a6600]";
  }
  if (normalized === "error" || normalized === "failed") {
    return "bg-[#fde8e8] text-[#b03a3a]";
  }
  return "bg-[#ece7df] text-[#65594d]";
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--ink-muted)]">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--ink)]">
        {value}
      </div>
      <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]">{note}</p>
    </Card>
  );
}

function ProgressBarChart({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: AdminDashboardSeriesPoint[];
}) {
  const maxValue = Math.max(1, ...data.map((point) => point.value));
  return (
    <Card className="p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
      <CardHeader title={title} description={description} />
      <div className="mt-6 grid h-72 grid-cols-[repeat(auto-fit,minmax(20px,1fr))] items-end gap-3">
        {data.map((point) => (
          <div key={point.label} className="flex h-full flex-col justify-end gap-2">
            <div className="flex flex-1 items-end justify-center">
              <div
                className="w-full rounded-t-2xl bg-[linear-gradient(180deg,#191a23_0%,#ff805f_100%)] shadow-[0_12px_24px_rgba(25,26,35,0.12)]"
                style={{ height: `${Math.max(8, (point.value / maxValue) * 100)}%` }}
                aria-hidden="true"
              />
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-[color:var(--ink)]">{point.value}</div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--ink-muted)]">
                {point.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DonutCard({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: Array<{ label: string; value: number; tone: string }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient =
    total > 0
      ? data
          .map((item) => {
            const start = cursor;
            const portion = (item.value / total) * 100;
            cursor += portion;
            return `${item.tone} ${start}% ${cursor}%`;
          })
          .join(", ")
      : "#ece7df 0% 100%";

  return (
    <Card className="p-6 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
      <CardHeader title={title} description={description} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[180px_1fr] lg:items-center">
        <div className="mx-auto flex w-[180px] flex-col items-center">
          <div
            className="relative grid h-[180px] w-[180px] place-items-center rounded-full"
            style={{ background: `conic-gradient(${gradient})` }}
          >
            <div className="grid h-[110px] w-[110px] place-items-center rounded-full border border-[color:var(--cream-dark)] bg-white text-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ink-muted)]">
                  Total
                </div>
                <div className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--ink)]">
                  {total}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {data.map((item) => {
            const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.label} className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--cream-dark)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ background: item.tone }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium text-[color:var(--ink)]">{item.label}</span>
                </div>
                <div className="text-sm font-semibold text-[color:var(--ink-muted)]">
                  {item.value} • {percentage}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function TableShell({
  title,
  description,
  children,
  right,
}: {
  title: string;
  description: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <Card className="p-0 shadow-[0_20px_60px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[color:var(--cream-dark)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--ink-muted)]">
              {title}
            </div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--ink-muted)]">{description}</p>
          </div>
          {right ? <div>{right}</div> : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

function StatusPill({ value }: { value: string }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        statusClass(value),
      )}
    >
      {value || "—"}
    </span>
  );
}

export function AdminDashboard({
  session,
  metrics,
  reportSeries,
  planMix,
  statusMix,
  recentAudits,
  recentUsers,
  recentPayments,
}: AdminDashboardProps) {
  const maxStatusValue = Math.max(1, ...statusMix.map((entry) => entry.value));
  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total audits"
          value={formatDecimal(metrics.totalAudits)}
          note={`${formatDecimal(metrics.completedAudits)} completed and ${formatDecimal(metrics.queuedAudits)} still in progress.`}
        />
        <MetricCard
          label="Active accounts"
          value={formatDecimal(metrics.totalUsers)}
          note={`${formatDecimal(metrics.paidUsers)} paid accounts and ${formatDecimal(metrics.adminUsers)} admin accounts.`}
        />
        <MetricCard
          label="Collected revenue"
          value={formatCurrency(metrics.collectedRevenue)}
          note={`Based on paid billing orders currently stored in Firestore.`}
        />
        <MetricCard
          label="Average score"
          value={metrics.averageScore === null ? "—" : `${formatDecimal(metrics.averageScore)} / 100`}
          note={`Across the available audit records in the system.`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <ProgressBarChart
          title="Report volume over the last 14 days"
          description="Daily audit creation volume helps us see whether usage is growing, flat, or slowing down."
          data={reportSeries}
        />
        <DonutCard
          title="Account and billing mix"
          description="A quick view of how many users are on each access tier."
          data={planMix}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <TableShell
          title="Recent reports"
          description="The latest audits help us understand what is being generated, for whom, and at what quality."
        >
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[color:var(--cream-dark)] text-left">
              <thead className="bg-[color:var(--cream)]/50 text-xs uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">
                <tr>
                  <th className="px-6 py-4 font-semibold">Created</th>
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Type</th>
                  <th className="px-6 py-4 font-semibold">Score</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--cream-dark)] bg-white text-sm">
                {recentAudits.length ? (
                  recentAudits.map((audit) => (
                    <tr key={audit.id} className="hover:bg-[color:var(--cream)]/30">
                      <td className="px-6 py-4 text-[color:var(--ink-muted)]">{formatDate(audit.createdAt)}</td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-[color:var(--ink)]">{audit.userEmail || "—"}</div>
                        <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                          {audit.userRole || "free"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[color:var(--ink-muted)]">{audit.productType || "—"}</td>
                      <td className="px-6 py-4">
                        <span
                          className={cx(
                            "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                            scoreClass(audit.overallScore),
                          )}
                        >
                          {audit.overallScore === null ? "—" : `${formatDecimal(audit.overallScore)} / 100`}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <StatusPill value={audit.status || "queued"} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-6 py-8 text-sm text-[color:var(--ink-muted)]" colSpan={5}>
                      No audit records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TableShell>

        <div className="space-y-6">
          <TableShell
            title="Latest accounts"
            description="Accounts show who is paying, who is testing free access, and when they last touched the product."
          >
            <div className="divide-y divide-[color:var(--cream-dark)]">
              {recentUsers.length ? (
                recentUsers.map((user) => (
                  <div key={user.id} className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-[color:var(--ink)]">{user.email || "—"}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                          {user.name || "User"}
                        </div>
                      </div>
                      <StatusPill value={user.role || user.plan || "free"} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl bg-[color:var(--cream)] px-3 py-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                          Plan
                        </div>
                        <div className="mt-1 font-semibold text-[color:var(--ink)]">
                          {user.plan || "free"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[color:var(--cream)] px-3 py-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-[color:var(--ink-faint)]">
                          Limits
                        </div>
                        <div className="mt-1 font-semibold text-[color:var(--ink)]">
                          {user.reportsUsed} / {user.reportLimit}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-[color:var(--ink-faint)]">
                      Last login {formatDate(user.lastLoginAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-8 text-sm text-[color:var(--ink-muted)]">No accounts yet.</div>
              )}
            </div>
          </TableShell>

          <TableShell
            title="Status split"
            description="What the current audit queue looks like across the live workspace."
          >
            <div className="space-y-3 p-6">
              {statusMix.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[color:var(--ink)]">{item.label}</span>
                    <span className="font-semibold text-[color:var(--ink-muted)]">{item.value}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-[color:var(--cream)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(4, Math.round((item.value / maxStatusValue) * 100))}%`,
                        background: item.tone,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </TableShell>
        </div>
      </section>

      <TableShell
        title="Recent payments"
        description="Razorpay orders show which plans are being purchased and whether payments completed successfully."
        right={
          <ButtonLink href="/pricing" variant="secondary" size="sm">
            Open pricing
          </ButtonLink>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[color:var(--cream-dark)] text-left">
            <thead className="bg-[color:var(--cream)]/50 text-xs uppercase tracking-[0.16em] text-[color:var(--ink-muted)]">
              <tr>
                <th className="px-6 py-4 font-semibold">Created</th>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold">Plan</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--cream-dark)] bg-white text-sm">
              {recentPayments.length ? (
                recentPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-[color:var(--cream)]/30">
                    <td className="px-6 py-4 text-[color:var(--ink-muted)]">{formatDate(payment.createdAt)}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-[color:var(--ink)]">{payment.email || "—"}</div>
                      <div className="text-xs text-[color:var(--ink-faint)]">
                        {payment.paymentSource || "razorpay"}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[color:var(--ink-muted)]">
                      {payment.plan || "custom"} • {payment.reportLimit}
                    </td>
                    <td className="px-6 py-4 font-semibold text-[color:var(--ink)]">
                      {formatCurrency(payment.amount / 100)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill value={payment.status || "created"} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-6 py-8 text-sm text-[color:var(--ink-muted)]" colSpan={5}>
                    No payment orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </TableShell>
    </div>
  );
}
