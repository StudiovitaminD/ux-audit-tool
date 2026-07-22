const STORAGE_KEYS = {
  state: "uxAuditExtensionState",
  settings: "uxAuditExtensionSettings",
};

const DEFAULT_SETTINGS = {
  autoCaptureOnNavigation: false,
  includeScreenshotDataUrl: true,
  maxVisibleTextLength: 4000,
  maxButtons: 40,
  maxLinks: 40,
  maxForms: 30,
  maxTables: 20,
  maxNavigationLabels: 30,
};

async function getSettings() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[STORAGE_KEYS.settings] || {}),
  };
}

async function getState() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.state);
  return (
    stored[STORAGE_KEYS.state] || {
      running: false,
      captures: [],
      startedAt: null,
      tabId: null,
      tabUrl: "",
      journey: {
        enabled: false,
        events: [],
      },
    }
  );
}

async function setState(nextState) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.state]: nextState,
  });
  return nextState;
}

function summarizeDom(payload) {
  const heading = (payload.headings || []).filter(Boolean).slice(0, 2).join(" · ");
  const buttons = (payload.buttons || []).filter(Boolean).slice(0, 4).join(", ");
  const tables = (payload.tables || []).filter(Boolean).slice(0, 2).join(", ");
  return [heading, buttons ? `Buttons: ${buttons}` : "", tables ? `Tables: ${tables}` : ""]
    .filter(Boolean)
    .join(" | ");
}

function guessScreenType(payload) {
  const url = String(payload.url || "").toLowerCase();
  const title = String(payload.title || "").toLowerCase();
  const headings = Array.isArray(payload.headings)
    ? payload.headings.join(" ").toLowerCase()
    : "";
  const combined = `${url} ${title} ${headings}`;

  if (combined.includes("login") || combined.includes("sign in")) return "login";
  if (combined.includes("dashboard") || combined.includes("home")) return "dashboard";
  if (combined.includes("setting")) return "settings";
  if (combined.includes("report")) return "report";
  if (payload.tables?.length) return "data_grid";
  if (payload.forms?.length) return "form";
  if (payload.navigationLabels?.length) return "navigation";
  return "other";
}

async function captureVisibleScreenshot(windowId, includeScreenshotDataUrl) {
  if (!includeScreenshotDataUrl) return "";
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  } catch {
    return "";
  }
}

async function captureCurrentTab(tabId, captureReason = "manual_capture") {
  const tab = await chrome.tabs.get(tabId);
  const settings = await getSettings();

  const payload = await chrome.tabs.sendMessage(tabId, {
    type: "UX_AUDIT_CAPTURE_PAGE",
    payload: {
      settings,
      captureReason,
    },
  });

  const screenshotUrl = await captureVisibleScreenshot(tab.windowId, settings.includeScreenshotDataUrl);
  const state = await getState();

  const capture = {
    ...payload,
    captureReason,
    capturedAt: new Date().toISOString(),
    url: payload?.url || tab.url || "",
    title: payload?.title || tab.title || "Captured page",
    screenTypeLabel: payload?.screenTypeLabel || guessScreenType(payload || {}),
    domSummary: payload?.domSummary || summarizeDom(payload || {}),
    screenshotUrl,
  };

  const nextState = {
    ...state,
    captures: [...(state.captures || []), capture],
    lastCapturedAt: capture.capturedAt,
    lastCaptureReason: captureReason,
    running: true,
    tabId,
    tabUrl: capture.url,
  };

  if (nextState.journey?.enabled) {
    nextState.journey = {
      ...nextState.journey,
      events: [
        ...(nextState.journey.events || []),
        {
          type: "capture",
          at: capture.capturedAt,
          url: capture.url,
          title: capture.title,
          reason: captureReason,
        },
      ],
    };
  }

  await setState(nextState);
  return capture;
}

async function startAudit(tabId, options = {}) {
  const tab = await chrome.tabs.get(tabId);
  const nextState = {
    running: true,
    captures: [],
    startedAt: new Date().toISOString(),
    tabId,
    tabUrl: tab.url || "",
    journey: {
      enabled: !!options.journeyEnabled,
      events: [
        {
          type: "start",
          at: new Date().toISOString(),
          url: tab.url || "",
          title: tab.title || "",
        },
      ],
    },
  };
  await setState(nextState);
  return nextState;
}

async function stopAudit() {
  const state = await getState();
  const nextState = {
    ...state,
    running: false,
    finishedAt: new Date().toISOString(),
  };
  await setState(nextState);
  return nextState;
}

async function clearAudit() {
  await setState({
    running: false,
    captures: [],
    startedAt: null,
    tabId: null,
    tabUrl: "",
    journey: {
      enabled: false,
      events: [],
    },
  });
}

async function updateJourneyEnabled(enabled) {
  const state = await getState();
  const nextState = {
    ...state,
    journey: {
      enabled: !!enabled,
      events: state.journey?.events || [],
    },
  };
  await setState(nextState);
  return nextState;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
  });
  const state = await getState();
  await setState(state);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === "UX_AUDIT_START") {
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) throw new Error("No active tab found.");
      const state = await startAudit(tabId, message.options || {});
      return { ok: true, state };
    }

    if (message?.type === "UX_AUDIT_STOP") {
      const state = await stopAudit();
      return { ok: true, state };
    }

    if (message?.type === "UX_AUDIT_CLEAR") {
      await clearAudit();
      return { ok: true };
    }

    if (message?.type === "UX_AUDIT_CAPTURE") {
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) throw new Error("No active tab found.");
      const capture = await captureCurrentTab(tabId, message.captureReason || "manual_capture");
      return { ok: true, capture };
    }

    if (message?.type === "UX_AUDIT_UPDATE_JOURNEY") {
      const state = await updateJourneyEnabled(message.enabled);
      return { ok: true, state };
    }

    if (message?.type === "UX_AUDIT_EXPORT") {
      const state = await getState();
      return {
        ok: true,
        json: JSON.stringify(state.captures || [], null, 2),
        captures: state.captures || [],
        state,
      };
    }

    if (message?.type === "UX_AUDIT_GET_STATE") {
      const state = await getState();
      const settings = await getSettings();
      return { ok: true, state, settings };
    }

    if (message?.type === "UX_AUDIT_SAVE_SETTINGS") {
      const nextSettings = {
        ...(await getSettings()),
        ...(message.settings || {}),
      };
      await chrome.storage.local.set({
        [STORAGE_KEYS.settings]: nextSettings,
      });
      return { ok: true, settings: nextSettings };
    }

    return { ok: false, error: "Unknown message type." };
  };

  run()
    .then((result) => sendResponse(result))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extension error.",
      }),
    );

  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;

  const state = await getState();
  const settings = await getSettings();

  if (!state.running || !state.tabId || state.tabId !== tabId) return;
  if (!state.journey?.enabled || !settings.autoCaptureOnNavigation) return;
  if (!tab.url || tab.url.startsWith("chrome://")) return;

  try {
    await captureCurrentTab(tabId, "navigation_autocapture");
  } catch {
    const nextState = await getState();
    await setState({
      ...nextState,
      journey: {
        ...(nextState.journey || { enabled: true, events: [] }),
        events: [
          ...((nextState.journey && nextState.journey.events) || []),
          {
            type: "capture_error",
            at: new Date().toISOString(),
            url: tab.url || "",
            title: tab.title || "",
            reason: "navigation_autocapture_failed",
          },
        ],
      },
    });
  }
});
