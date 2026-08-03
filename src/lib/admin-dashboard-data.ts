import type {
  AdminAuditRow,
  AdminDashboardMetrics,
  AdminDashboardSeriesPoint,
  AdminPaymentRow,
  AdminUserRow,
} from "@/components/admin/admin-dashboard";
import { getAdminFirestore } from "@/lib/firebase-admin";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toIsoString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value instanceof Date) return value.toISOString();
  return "";
}

function sortDesc(a: string, b: string) {
  const left = Number.isNaN(new Date(a).getTime()) ? 0 : new Date(a).getTime();
  const right = Number.isNaN(new Date(b).getTime()) ? 0 : new Date(b).getTime();
  return right - left;
}

function buildSeries(audits: AdminAuditRow[]): AdminDashboardSeriesPoint[] {
  const days: AdminDashboardSeriesPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dayKey = date.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
    }).format(date);
    const value = audits.filter((audit) => audit.createdAt.slice(0, 10) === dayKey).length;
    days.push({ label, value });
  }

  return days;
}

function mapTone(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("free")) return "#ffb86b";
  if (normalized.includes("paid")) return "#191a23";
  if (normalized.includes("admin")) return "#ff805f";
  if (normalized.includes("complete")) return "#2dd080";
  if (normalized.includes("processing") || normalized.includes("queued") || normalized.includes("created")) {
    return "#f7b655";
  }
  if (normalized.includes("error") || normalized.includes("failed")) return "#f8596e";
  return "#8a8a93";
}

export async function loadAdminDashboardData() {
  const db = getAdminFirestore();
  const [auditSnap, userSnap, paymentSnap] = await Promise.all([
    db.collection("ux_audits").get(),
    db.collection("ux_users").get(),
    db.collection("ux_billing_orders").get(),
  ]);

  const recentAudits = auditSnap.docs
    .map((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      const report = (typeof data.report === "object" && data.report !== null ? (data.report as Record<string, unknown>) : {}) ?? {};
      return {
        id: doc.id,
        createdAt: toIsoString(data.createdAt || data.created_at || data.updatedAt),
        status: readString(data.status) || "queued",
        userEmail: readString(data.user_email || data.userEmail || data.email),
        userRole: readString(data.user_role || data.userRole),
        planType: readString(data.plan_type || data.planType || data.plan),
        productType: readString(data.product_type || data.productType || report.product_type || report.productType),
        overallScore:
          readNumber(data.overall_score) ??
          readNumber(report.overall_score) ??
          readNumber(report.overallScore) ??
          null,
      } satisfies AdminAuditRow;
    })
    .sort((a, b) => sortDesc(a.createdAt, b.createdAt));

  const recentUsers = userSnap.docs
    .map((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        id: doc.id,
        email: readString(data.email),
        name: readString(data.name) || "User",
        role: readString(data.role) || "free",
        plan: readString(data.plan) || "free",
        reportsUsed: readNumber(data.reportsUsed) ?? 0,
        reportLimit: readNumber(data.reportLimit) ?? 0,
        lastLoginAt: toIsoString(data.lastLoginAt || data.updatedAt || data.createdAt),
        paidAt: toIsoString(data.paidAt),
        paymentSource: readString(data.paymentSource),
      } satisfies AdminUserRow;
    })
    .sort((a, b) => sortDesc(a.lastLoginAt || a.paidAt, b.lastLoginAt || b.paidAt));

  const recentPayments = paymentSnap.docs
    .map((doc) => {
      const data = (doc.data() ?? {}) as Record<string, unknown>;
      return {
        id: doc.id,
        email: readString(data.email),
        userId: readString(data.userId),
        plan: readString(data.plan) || "custom",
        reportLimit: readNumber(data.reportLimit) ?? 0,
        amount: readNumber(data.amount) ?? 0,
        currency: readString(data.currency) || "INR",
        status: readString(data.status) || "created",
        createdAt: toIsoString(data.createdAt || data.updatedAt),
        paidAt: toIsoString(data.paidAt),
        paymentSource: readString(data.paymentSource),
      } satisfies AdminPaymentRow;
    })
    .sort((a, b) => sortDesc(a.createdAt || a.paidAt, b.createdAt || b.paidAt));

  const completedAudits = recentAudits.filter((audit) => audit.status === "complete").length;
  const queuedAudits = recentAudits.filter((audit) => ["queued", "processing"].includes(audit.status)).length;
  const paidUsers = recentUsers.filter((user) => user.plan === "paid" && user.role !== "admin").length;
  const adminUsers = recentUsers.filter((user) => user.role === "admin").length;
  const collectedRevenue = recentPayments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amount / 100, 0);
  const scoredAudits = recentAudits
    .map((audit) => audit.overallScore)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageScore = scoredAudits.length
    ? scoredAudits.reduce((sum, score) => sum + score, 0) / scoredAudits.length
    : null;
  const paymentSuccessRate = recentPayments.length
    ? recentPayments.filter((payment) => payment.status === "paid").length / recentPayments.length
    : null;

  const freeUsers = Math.max(0, recentUsers.length - paidUsers - adminUsers);
  const reportSeries = buildSeries(recentAudits);

  return {
    metrics: {
      totalAudits: recentAudits.length,
      completedAudits,
      queuedAudits,
      totalUsers: recentUsers.length,
      paidUsers,
      adminUsers,
      collectedRevenue,
      averageScore,
      paymentSuccessRate,
    } satisfies AdminDashboardMetrics,
    reportSeries,
    planMix: [
      { label: "Free", value: freeUsers, tone: mapTone("free") },
      { label: "Paid", value: paidUsers, tone: mapTone("paid") },
      { label: "Admin", value: adminUsers, tone: mapTone("admin") },
    ],
    statusMix: [
      { label: "Queued", value: recentAudits.filter((audit) => audit.status === "queued").length, tone: mapTone("queued") },
      { label: "Processing", value: recentAudits.filter((audit) => audit.status === "processing").length, tone: mapTone("processing") },
      { label: "Complete", value: completedAudits, tone: mapTone("complete") },
      { label: "Error", value: recentAudits.filter((audit) => audit.status === "error").length, tone: mapTone("error") },
    ],
    recentAudits: recentAudits.slice(0, 8),
    recentUsers: recentUsers.slice(0, 6),
    recentPayments: recentPayments.slice(0, 8),
  };
}
