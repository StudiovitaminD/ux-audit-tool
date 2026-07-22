import chromium from "@sparticuz/chromium";
import {
  chromium as pwChromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright-core";
import { getAdminFirestore } from "@/lib/firebase-admin";

type BrowserStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

export type BrowserProviderName = "local_playwright" | "browserbase";
export type AuditAccessMode =
  | "auto_login"
  | "manual_browser_login"
  | "use_saved_session"
  | "internal_routes_only"
  | "screenshot_upload_only"
  | "browser_extension_capture";

export type StoredAuthState = {
  id: string;
  domain: string;
  state: BrowserStorageState;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
};

export type BrowserSessionMeta = {
  provider: BrowserProviderName;
  sessionId?: string;
  replayUrl?: string;
  liveUrl?: string;
};

export type BrowserProvider = {
  name: BrowserProviderName;
  createSession(): Promise<BrowserSessionMeta>;
  connect(meta: BrowserSessionMeta): Promise<Browser>;
  closeSession(meta: BrowserSessionMeta): Promise<void>;
  getSessionReplayUrl(meta: BrowserSessionMeta): string;
  createOrReuseContext(browser: Browser, storageState?: BrowserStorageState | null): Promise<BrowserContext>;
  saveAuthState(domain: string, storageState: BrowserStorageState): Promise<StoredAuthState | null>;
  loadAuthState(domain: string): Promise<StoredAuthState | null>;
  runWithPage<T>(
    options: { domain: string; storageState?: BrowserStorageState | null },
    fn: (page: Page, context: BrowserContext, meta: BrowserSessionMeta) => Promise<T>,
  ): Promise<T>;
};

export function getBrowserProviderDiagnostics() {
  const browserbaseEnabledEnv = process.env.BROWSERBASE_ENABLED === "true";
  const browserbaseApiKeyPresent = Boolean(process.env.BROWSERBASE_API_KEY);
  const browserbaseProjectIdPresent = Boolean(process.env.BROWSERBASE_PROJECT_ID);
  const browserbaseReady =
    browserbaseEnabledEnv &&
    browserbaseApiKeyPresent &&
    browserbaseProjectIdPresent;

  let browserProviderFallbackReason = "";
  if (!browserbaseEnabledEnv) {
    browserProviderFallbackReason = "BROWSERBASE_ENABLED is not true.";
  } else if (!browserbaseApiKeyPresent) {
    browserProviderFallbackReason = "BROWSERBASE_API_KEY is missing.";
  } else if (!browserbaseProjectIdPresent) {
    browserProviderFallbackReason = "BROWSERBASE_PROJECT_ID is missing.";
  }

  return {
    browserbaseEnabledEnv,
    browserbaseApiKeyPresent,
    browserbaseProjectIdPresent,
    requestedBrowserProvider: browserbaseReady ? "browserbase" : "local_playwright",
    browserProviderFallbackReason,
  };
}

function normalizeDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "unknown-domain";
  }
}

function authSessionRef(domain: string) {
  return getAdminFirestore().collection("ux_auth_sessions").doc(domain);
}

async function saveAuthStateForDomain(domain: string, storageState: BrowserStorageState) {
  const now = new Date().toISOString();
  const ref = authSessionRef(domain);
  const payload: StoredAuthState = {
    id: domain,
    domain,
    state: storageState,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
  };
  const snap = await ref.get();
  if (snap.exists) {
    await ref.set(
      {
        state: storageState,
        updatedAt: now,
      },
      { merge: true },
    );
    const merged = (await ref.get()).data() as StoredAuthState | undefined;
    return merged ?? payload;
  }
  await ref.set(payload, { merge: true });
  return payload;
}

async function loadAuthStateForDomain(domain: string) {
  const snap = await authSessionRef(domain).get();
  if (!snap.exists) return null;
  const data = snap.data() as StoredAuthState | undefined;
  if (!data?.state || typeof data.state !== "object") return null;
  return data;
}

class LocalPlaywrightProvider implements BrowserProvider {
  readonly name = "local_playwright" as const;

  async createSession(): Promise<BrowserSessionMeta> {
    return { provider: this.name };
  }

  async connect(_meta?: BrowserSessionMeta): Promise<Browser> {
    void _meta;
    const executablePath = await chromium.executablePath();
    return pwChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }

  async closeSession(_meta?: BrowserSessionMeta): Promise<void> {
    void _meta;
  }

  getSessionReplayUrl() {
    return "";
  }

  async createOrReuseContext(browser: Browser, storageState?: BrowserStorageState | null) {
    return browser.newContext({
      viewport: { width: 1400, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36",
      storageState: storageState ?? undefined,
    });
  }

  async saveAuthState(domain: string, storageState: BrowserStorageState) {
    return saveAuthStateForDomain(domain, storageState);
  }

  async loadAuthState(domain: string) {
    return loadAuthStateForDomain(domain);
  }

  async runWithPage<T>(
    options: { domain: string; storageState?: BrowserStorageState | null },
    fn: (page: Page, context: BrowserContext, meta: BrowserSessionMeta) => Promise<T>,
  ) {
    const meta = await this.createSession();
    const browser = await this.connect(meta);
    const context = await this.createOrReuseContext(browser, options.storageState);
    const page = await context.newPage();
    try {
      return await fn(page, context, meta);
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      await this.closeSession(meta);
    }
  }
}

class BrowserbaseProvider implements BrowserProvider {
  readonly name = "browserbase" as const;

  private get enabled() {
    return (
      process.env.BROWSERBASE_ENABLED === "true" &&
      !!process.env.BROWSERBASE_API_KEY &&
      !!process.env.BROWSERBASE_PROJECT_ID
    );
  }

  async createSession(): Promise<BrowserSessionMeta> {
    if (!this.enabled) throw new Error("Browserbase is not configured");
    const apiKey = process.env.BROWSERBASE_API_KEY!;
    const projectId = process.env.BROWSERBASE_PROJECT_ID!;
    const response = await fetch("https://www.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bb-api-key": apiKey,
      },
      body: JSON.stringify({
        projectId,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Browserbase session creation failed (${response.status}): ${text}`);
    }
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const sessionId =
      (typeof data?.id === "string" && data.id) ||
      (typeof data?.sessionId === "string" && data.sessionId) ||
      "";
    if (!sessionId) throw new Error("Browserbase session id missing");
    const replayUrl =
      (typeof data?.replayUrl === "string" && data.replayUrl) ||
      `https://www.browserbase.com/sessions/${sessionId}`;
    const liveUrl = (typeof data?.debugUrl === "string" && data.debugUrl) || replayUrl;
    return {
      provider: this.name,
      sessionId,
      replayUrl,
      liveUrl,
    };
  }

  async connect(meta: BrowserSessionMeta): Promise<Browser> {
    if (!meta.sessionId) throw new Error("Browserbase session id missing for connect");
    const apiKey = process.env.BROWSERBASE_API_KEY!;
    const wsEndpoint = `wss://connect.browserbase.com?apiKey=${encodeURIComponent(apiKey)}&sessionId=${encodeURIComponent(meta.sessionId)}`;
    return pwChromium.connectOverCDP(wsEndpoint, { timeout: 60_000 });
  }

  async closeSession(meta: BrowserSessionMeta): Promise<void> {
    if (!meta.sessionId || !this.enabled) return;
    const apiKey = process.env.BROWSERBASE_API_KEY!;
    await fetch(`https://www.browserbase.com/v1/sessions/${encodeURIComponent(meta.sessionId)}`, {
      method: "DELETE",
      headers: { "x-bb-api-key": apiKey },
    }).catch(() => {});
  }

  getSessionReplayUrl(meta: BrowserSessionMeta) {
    return meta.replayUrl || meta.liveUrl || "";
  }

  async createOrReuseContext(browser: Browser, storageState?: BrowserStorageState | null) {
    const contexts = browser.contexts();
    if (contexts.length > 0) {
      return contexts[0]!;
    }
    return browser.newContext({
      viewport: { width: 1400, height: 900 },
      storageState: storageState ?? undefined,
    });
  }

  async saveAuthState(domain: string, storageState: BrowserStorageState) {
    return saveAuthStateForDomain(domain, storageState);
  }

  async loadAuthState(domain: string) {
    return loadAuthStateForDomain(domain);
  }

  async runWithPage<T>(
    options: { domain: string; storageState?: BrowserStorageState | null },
    fn: (page: Page, context: BrowserContext, meta: BrowserSessionMeta) => Promise<T>,
  ) {
    const meta = await this.createSession();
    const browser = await this.connect(meta);
    const context = await this.createOrReuseContext(browser, options.storageState);
    const page = await context.newPage();
    try {
      return await fn(page, context, meta);
    } finally {
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      await this.closeSession(meta);
    }
  }
}

export function createBrowserProvider() {
  const {
    browserbaseEnabledEnv,
    browserbaseApiKeyPresent,
    browserbaseProjectIdPresent,
  } = getBrowserProviderDiagnostics();
  const browserbaseEnabled =
    browserbaseEnabledEnv &&
    browserbaseApiKeyPresent &&
    browserbaseProjectIdPresent;
  return browserbaseEnabled ? new BrowserbaseProvider() : new LocalPlaywrightProvider();
}

export async function saveContextAuthState(
  provider: BrowserProvider,
  productUrl: string,
  context: BrowserContext,
) {
  const domain = normalizeDomain(productUrl);
  const state = (await context.storageState()) as BrowserStorageState;
  return provider.saveAuthState(domain, state);
}

export async function loadContextAuthState(provider: BrowserProvider, productUrl: string) {
  const domain = normalizeDomain(productUrl);
  return provider.loadAuthState(domain);
}

export function productDomain(productUrl: string) {
  return normalizeDomain(productUrl);
}
