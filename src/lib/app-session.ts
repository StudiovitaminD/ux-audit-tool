import {
  FREE_REPORT_LIMIT,
  getLockedSectionsForAccess,
  getModelTierForRole,
  getReportAccessLevel,
  type AppRole,
  type PlanType,
} from "@/lib/access-control";

export const SESSION_STORAGE_KEY = "ux_audit:app_session_v1";
export const SESSION_CHANGE_EVENT = "ux-audit:session-changed";
const LOCAL_ADMIN_EMAILS = new Set(["innovation@vitamin-d.in"]);

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
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
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

export function buildOptimisticAppSession(input: {
  email: string;
  name?: string | null;
  plan?: PlanType | null;
}) {
  const email = input.email.trim().toLowerCase();
  const role = LOCAL_ADMIN_EMAILS.has(email) ? "admin" : "free";
  const plan = role === "admin" ? "paid" : input.plan ?? "free";

  return createDefaultSession({
    email,
    name: input.name?.trim() || undefined,
    role,
    plan,
    reportsUsed: 0,
    reportLimit: role === "admin" ? Number.POSITIVE_INFINITY : FREE_REPORT_LIMIT,
  });
}

export async function fetchAppSession(options?: { expectedStorageValue?: string | null }) {
  const expectedStorageValue =
    options && "expectedStorageValue" in options ? options.expectedStorageValue : null;
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
    if (
      typeof window !== "undefined" &&
      (expectedStorageValue === null || window.localStorage.getItem(SESSION_STORAGE_KEY) === expectedStorageValue)
    ) {
      writeAppSession(data.session);
    }
    return createDefaultSession(data.session);
  }
  if (typeof window !== "undefined") {
    const storedRaw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (storedRaw) {
      try {
        const stored = JSON.parse(storedRaw) as Partial<AppSession>;
        if (stored.email && stored.email !== "guest@local.test") {
          return createDefaultSession(stored);
        }
      } catch {
        // Ignore malformed cache and fall through to guest fallback.
      }
    }
  }
  const fallback = createDefaultSession();
  if (
    typeof window !== "undefined" &&
    (expectedStorageValue === null || window.localStorage.getItem(SESSION_STORAGE_KEY) === expectedStorageValue)
  ) {
    writeAppSession(fallback);
  }
  return fallback;
}

export async function signUpWithPassword(input: {
  email: string;
  name: string;
  password: string;
  plan?: "free" | "paid" | null;
  reportLimit?: number | null;
}) {
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
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
}

export function getAppSessionRequestHeaders() {
  if (typeof window === "undefined") return {} as Record<string, string>;

  try {
    const session = readAppSession();
    if (session.email === "guest@local.test") return {} as Record<string, string>;
    const headers: Record<string, string> = {};
    headers["x-ux-audit-session"] = encodeURIComponent(JSON.stringify(session));
    return headers;
  } catch {
    return {} as Record<string, string>;
  }
}

export function incrementReportUsage(session: AppSession) {
  const next =
    session.role === "admin"
      ? session
      : { ...session, reportsUsed: session.reportsUsed + 1 };
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
  if (session.role === "admin" || session.role === "free") return null;
  return Math.max(0, session.reportLimit - session.reportsUsed);
}
