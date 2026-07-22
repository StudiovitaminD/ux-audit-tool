import {
  FREE_REPORT_LIMIT,
  getLockedSectionsForAccess,
  getModelTierForRole,
  getReportAccessLevel,
  type AppRole,
  type PlanType,
} from "@/lib/access-control";

const STORAGE_KEY = "ux_audit:app_session_v1";

export type AppSession = {
  id: string;
  email: string;
  name?: string;
  role: AppRole;
  plan: PlanType;
  reportsUsed: number;
  reportLimit: number;
};

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `guest_${Date.now()}`;
}

export function createDefaultSession(overrides?: Partial<AppSession>): AppSession {
  return {
    id: randomId(),
    email: "guest@local.test",
    role: "free",
    plan: "free",
    reportsUsed: 0,
    reportLimit: FREE_REPORT_LIMIT,
    ...overrides,
  };
}

export function readAppSession(): AppSession {
  if (typeof window === "undefined") return createDefaultSession();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fallback = createDefaultSession();
      writeAppSession(fallback);
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<AppSession>;
    return createDefaultSession(parsed);
  } catch {
    const fallback = createDefaultSession();
    writeAppSession(fallback);
    return fallback;
  }
}

export async function fetchAppSession() {
  const response = await fetch("/api/account/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { session?: AppSession | null } | null;
  if (!response.ok) {
    throw new Error("Failed to fetch account session.");
  }
  if (data?.session) {
    writeAppSession(data.session);
    return createDefaultSession(data.session);
  }
  const fallback = readAppSession();
  return fallback;
}

export async function signUpWithPassword(input: { email: string; name: string; password: string }) {
  const response = await fetch("/api/account/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => null)) as
    | { session?: AppSession; error?: string }
    | null;
  if (!response.ok || !data?.session) {
    throw new Error(data?.error || "Sign-up failed.");
  }
  const session = createDefaultSession(data.session);
  writeAppSession(session);
  return session;
}

export async function signInWithPassword(input: { email: string; password: string }) {
  const response = await fetch("/api/account/session", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  const data = (await response.json().catch(() => null)) as
    | { session?: AppSession; error?: string }
    | null;
  if (!response.ok || !data?.session) {
    throw new Error(data?.error || "Sign-in failed.");
  }
  const session = createDefaultSession(data.session);
  writeAppSession(session);
  return session;
}

export async function signOutAppSession() {
  await fetch("/api/account/session", {
    method: "DELETE",
    credentials: "include",
  }).catch(() => undefined);
  const fallback = createDefaultSession();
  writeAppSession(fallback);
  return fallback;
}

export function writeAppSession(session: AppSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function incrementReportUsage(session: AppSession) {
  const next =
    session.role === "free"
      ? { ...session, reportsUsed: session.reportsUsed + 1 }
      : session;
  writeAppSession(next);
  return next;
}

export function sessionAccessPayload(session: AppSession) {
  const accessLevel = getReportAccessLevel(session.plan);
  return {
    user_id: session.id,
    user_email: session.email,
    user_role: session.role,
    plan_type: session.plan,
    report_access_level: accessLevel,
    locked_sections: getLockedSectionsForAccess(accessLevel),
    model_tier: getModelTierForRole(session.role, session.plan),
    reports_used: session.reportsUsed,
    report_limit: session.reportLimit,
  };
}

export function auditUserAccessFromSession(session: AppSession) {
  const accessLevel = getReportAccessLevel(session.plan);
  return {
    userId: session.id,
    email: session.email,
    role: session.role,
    plan: session.plan,
    reportAccessLevel: accessLevel,
    lockedSections: getLockedSectionsForAccess(accessLevel),
    modelTier: getModelTierForRole(session.role, session.plan),
    reportsUsed: session.reportsUsed,
    reportLimit: session.reportLimit,
  };
}

export function reportsRemaining(session: AppSession) {
  if (session.role === "paid" || session.role === "admin") return null;
  return Math.max(0, session.reportLimit - session.reportsUsed);
}
