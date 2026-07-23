import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  FREE_REPORT_LIMIT,
  getAllowedProductTypes,
  getLockedSectionsForAccess,
  getModelTierForRole,
  getReportAccessLevel,
  type AppRole,
  type PlanType,
} from "@/lib/access-control";

export const ACCOUNT_SESSION_COOKIE = "ux_audit_session";
const SESSION_COLLECTION = "ux_user_sessions";
const USER_COLLECTION = "ux_users";

export type AccountSession = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  plan: PlanType;
  reportsUsed: number;
  reportLimit: number;
  allowedProductTypes: string[];
  reportAccessLevel: ReturnType<typeof getReportAccessLevel>;
  lockedSections: string[];
  modelTier: string;
};

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, stored] = storedHash.split(":");
  if (!salt || !stored) return false;
  const computed = scryptSync(password, salt, 64);
  const storedBuffer = Buffer.from(stored, "hex");
  if (computed.length !== storedBuffer.length) return false;
  return timingSafeEqual(computed, storedBuffer);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function emailHash(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 24);
}

function adminEmailSet() {
  return new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function paidEmailSet() {
  return new Set(
    String(process.env.PAID_EMAILS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function resolveRoleAndPlan(email: string): { role: AppRole; plan: PlanType } {
  const normalized = normalizeEmail(email);
  if (adminEmailSet().has(normalized)) return { role: "admin", plan: "paid" };
  if (paidEmailSet().has(normalized)) return { role: "paid", plan: "paid" };
  return { role: "free", plan: "free" };
}

export function sessionFromUserRecord(userId: string, rec: Record<string, unknown>): AccountSession {
  const email = typeof rec.email === "string" ? rec.email : "";
  const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : "User";
  const role = (typeof rec.role === "string" ? rec.role : "free") as AppRole;
  const plan = (typeof rec.plan === "string" ? rec.plan : "free") as PlanType;
  const reportsUsed = typeof rec.reportsUsed === "number" ? rec.reportsUsed : 0;
  const reportLimit = typeof rec.reportLimit === "number" ? rec.reportLimit : FREE_REPORT_LIMIT;
  const reportAccessLevel = getReportAccessLevel(plan);
  return {
    id: userId,
    email,
    name,
    role,
    plan,
    reportsUsed,
    reportLimit,
    allowedProductTypes: getAllowedProductTypes(role),
    reportAccessLevel,
    lockedSections: getLockedSectionsForAccess(reportAccessLevel),
    modelTier: getModelTierForRole(role, plan),
  };
}

async function createSessionForUser(args: { userId: string; email: string }) {
  const db = getAdminFirestore();
  const sessionId = randomUUID();
  const sessionRef = db.collection(SESSION_COLLECTION).doc(sessionId);
  const now = new Date().toISOString();
  await sessionRef.set({
    userId: args.userId,
    email: args.email,
    createdAt: now,
    updatedAt: now,
  });

  const snap = await db.collection(USER_COLLECTION).doc(args.userId).get();
  return {
    sessionId,
    session: sessionFromUserRecord(args.userId, (snap.data() ?? {}) as Record<string, unknown>),
  };
}

export async function signUpAccount(params: {
  email: string;
  name: string;
  password: string;
}) {
  const email = normalizeEmail(params.email);
  const name = params.name.trim() || email.split("@")[0] || "User";
  const db = getAdminFirestore();
  const userId = emailHash(email);
  const userRef = db.collection(USER_COLLECTION).doc(userId);
  const roleAndPlan = resolveRoleAndPlan(email);
  const now = new Date().toISOString();
  const passwordHash = hashPassword(params.password);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const existing = (userSnap.data() ?? {}) as Record<string, unknown>;
    if (userSnap.exists && typeof existing.passwordHash === "string" && existing.passwordHash.trim()) {
      throw new Error("Account already exists. Please sign in.");
    }

    tx.set(
      userRef,
      {
        email,
        name,
        role: existing.role ?? roleAndPlan.role,
        plan: existing.plan ?? roleAndPlan.plan,
        reportsUsed: existing.reportsUsed ?? 0,
        reportLimit: existing.reportLimit ?? FREE_REPORT_LIMIT,
        passwordHash,
        createdAt: existing.createdAt ?? now,
        updatedAt: now,
        lastLoginAt: now,
      },
      { merge: true },
    );
  });

  return createSessionForUser({ userId, email });
}

export async function promoteAccountToPaid(params: {
  userId: string;
  reportLimit: number;
  source?: string;
}) {
  const db = getAdminFirestore();
  const ref = db.collection(USER_COLLECTION).doc(params.userId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Account not found.");
  }

  const current = (snap.data() ?? {}) as Record<string, unknown>;
  const reportLimit = Math.max(1, Math.floor(params.reportLimit));
  await ref.set(
      {
        role: (typeof current.role === "string" && current.role === "admin" ? current.role : "paid"),
        plan: "paid",
        reportLimit,
        updatedAt: new Date().toISOString(),
        paymentSource: params.source ?? "razorpay",
        paidAt: new Date().toISOString(),
      },
      { merge: true },
    );

  const updated = await ref.get();
  return sessionFromUserRecord(params.userId, (updated.data() ?? {}) as Record<string, unknown>);
}

export async function signInAccount(params: { email: string; password: string }) {
  const email = normalizeEmail(params.email);
  const db = getAdminFirestore();
  const userId = emailHash(email);
  const userRef = db.collection(USER_COLLECTION).doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new Error("Account not found. Please sign up first.");
  }

  const rec = (userSnap.data() ?? {}) as Record<string, unknown>;
  const passwordHash = typeof rec.passwordHash === "string" ? rec.passwordHash : "";
  if (!passwordHash) {
    throw new Error("This account does not have a password yet. Please sign up again.");
  }
  if (!verifyPassword(params.password, passwordHash)) {
    throw new Error("Invalid email or password.");
  }

  await userRef.set(
    {
      updatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
    { merge: true },
  );

  return createSessionForUser({ userId, email });
}

export function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";").map((item) => item.trim());
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === name) return decodeURIComponent(value);
  }
  return null;
}

export async function getAccountSessionFromRequest(req: Request): Promise<AccountSession | null> {
  const sid = getCookie(req, ACCOUNT_SESSION_COOKIE);
  if (!sid) return null;
  const db = getAdminFirestore();
  const sessionSnap = await db.collection(SESSION_COLLECTION).doc(sid).get();
  if (!sessionSnap.exists) return null;
  const sessionData = (sessionSnap.data() ?? {}) as Record<string, unknown>;
  const userId = typeof sessionData.userId === "string" ? sessionData.userId : "";
  if (!userId) return null;
  const userSnap = await db.collection(USER_COLLECTION).doc(userId).get();
  if (!userSnap.exists) return null;
  return sessionFromUserRecord(userId, (userSnap.data() ?? {}) as Record<string, unknown>);
}

export async function clearAccountSession(sessionId: string) {
  const db = getAdminFirestore();
  await db.collection(SESSION_COLLECTION).doc(sessionId).delete().catch(() => undefined);
}

export async function incrementServerSideReportUsage(userId: string) {
  const db = getAdminFirestore();
  const ref = db.collection(USER_COLLECTION).doc(userId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const rec = (snap.data() ?? {}) as Record<string, unknown>;
    const role = (typeof rec.role === "string" ? rec.role : "free") as AppRole;
    if (role === "admin") return;
    const reportsUsed = typeof rec.reportsUsed === "number" ? rec.reportsUsed : 0;
    tx.set(
      ref,
      {
        reportsUsed: reportsUsed + 1,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}
