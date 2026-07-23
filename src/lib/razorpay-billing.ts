import crypto from "crypto";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { promoteAccountToPaid } from "@/lib/account-server";

export type CheckoutPlan = "starter" | "custom";

const BILLING_ORDERS_COLLECTION = "ux_billing_orders";
const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} env var`);
  }
  return value;
}

function getKeyId() {
  return requiredEnv("RAZORPAY_KEY_ID");
}

function getKeySecret() {
  return requiredEnv("RAZORPAY_KEY_SECRET");
}

function normalizePlan(value: unknown): CheckoutPlan {
  return value === "starter" ? "starter" : "custom";
}

function normalizeReportLimit(value: unknown, plan: CheckoutPlan) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return plan === "starter" ? 10 : 20;
  }
  const rounded = Math.floor(parsed);
  if (plan === "starter") return 10;
  return Math.max(20, rounded);
}

function toPaise(amountInRupees: number) {
  return Math.max(1, Math.round(amountInRupees * 100));
}

function extractRazorpayErrorMessage(data: Record<string, unknown> | null) {
  const error = data?.error;
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.description === "string" && errorRecord.description.trim()) {
      return errorRecord.description.trim();
    }
    if (typeof errorRecord.message === "string" && errorRecord.message.trim()) {
      return errorRecord.message.trim();
    }
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return "Unable to create order.";
}

async function writePendingOrder(params: {
  orderId: string;
  userId: string;
  email: string;
  plan: CheckoutPlan;
  reportLimit: number;
  amount: number;
  currency: string;
  next: string;
}) {
  const db = getAdminFirestore();
  await db.collection(BILLING_ORDERS_COLLECTION).doc(params.orderId).set({
    userId: params.userId,
    email: params.email,
    plan: params.plan,
    reportLimit: params.reportLimit,
    amount: params.amount,
    currency: params.currency,
    next: params.next,
    status: "created",
    paymentSource: "razorpay",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function createRazorpayOrder(params: {
  userId: string;
  email: string;
  plan: CheckoutPlan;
  reportLimit: number;
  next: string;
}) {
  const plan = normalizePlan(params.plan);
  const reportLimit = normalizeReportLimit(params.reportLimit, plan);
  const amountInRupees = plan === "starter" ? 10 : reportLimit * 0.75;
  const amount = toPaise(amountInRupees);
  const payload = {
    amount,
    currency: "INR",
    receipt: `ux-${params.userId}-${Date.now()}`,
    payment_capture: 1,
    notes: {
      userId: params.userId,
      email: params.email,
      plan,
      reportLimit: String(reportLimit),
      next: params.next,
      paymentSource: "razorpay",
    },
  };

  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${getKeyId()}:${getKeySecret()}`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !data) {
    throw new Error(extractRazorpayErrorMessage(data));
  }

  const orderId = typeof data.id === "string" ? data.id : "";
  if (!orderId) {
    throw new Error("Razorpay order id is missing.");
  }

  await writePendingOrder({
    orderId,
    userId: params.userId,
    email: params.email,
    plan,
    reportLimit,
    amount,
    currency: "INR",
    next: params.next,
  });

  return {
    keyId: getKeyId(),
    orderId,
    amount,
    currency: "INR",
    plan,
    reportLimit,
    next: params.next,
  };
}

export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const expected = crypto
    .createHmac("sha256", getKeySecret())
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  const actual = params.signature.trim();
  if (!actual) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
}

export async function confirmRazorpayPayment(params: {
  orderId: string;
  paymentId: string;
  signature: string;
  currentUserId: string;
}) {
  const db = getAdminFirestore();
  const ref = db.collection(BILLING_ORDERS_COLLECTION).doc(params.orderId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Payment order not found.");
  }

  const order = (snap.data() ?? {}) as Record<string, unknown>;
  const storedUserId = typeof order.userId === "string" ? order.userId : "";
  if (!storedUserId || storedUserId !== params.currentUserId) {
    throw new Error("This payment does not belong to the signed-in account.");
  }

  const status = typeof order.status === "string" ? order.status : "created";
  if (status === "paid") {
    return {
      reportLimit: normalizeReportLimit(order.reportLimit, normalizePlan(order.plan)),
      paymentStatus: "paid" as const,
    };
  }

  if (!verifyRazorpaySignature(params)) {
    throw new Error("Payment signature verification failed.");
  }

  const plan = normalizePlan(order.plan);
  const reportLimit = normalizeReportLimit(order.reportLimit, plan);
  const paymentSource = "razorpay_checkout";

  await ref.set(
    {
      status: "paid",
      paymentId: params.paymentId,
      signature: params.signature,
      paidAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentSource,
    },
    { merge: true },
  );

  const session = await promoteAccountToPaid({
    userId: storedUserId,
    reportLimit,
    source: paymentSource,
  });

  return {
    reportLimit,
    session,
    paymentStatus: "paid" as const,
  };
}
