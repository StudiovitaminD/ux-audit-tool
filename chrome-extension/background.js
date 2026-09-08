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

async function captureFullPageScreenshot(tabId, windowId, includeScreenshotDataUrl) {
  if (!includeScreenshotDataUrl) return "";
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
    await chrome.debugger.sendCommand({ tabId }, "Page.enable");
    const metrics = await chrome.debugger.sendCommand({ tabId }, "Page.getLayoutMetrics");
    const contentSize = metrics?.contentSize || metrics?.cssContentSize;
    const width = Math.max(1, Math.ceil(Number(contentSize?.width || 1)));
    const height = Math.max(1, Math.ceil(Number(contentSize?.height || 1)));
    const result = await chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", {
      format: "jpeg",
      quality: 65,
      captureBeyondViewport: true,
      fromSurface: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    await chrome.debugger.detach({ tabId });
    return result?.data ? `data:image/jpeg;base64,${result.data}` : "";
  } catch {
    try { await chrome.debugger.detach({ tabId }); } catch {}
    try { return await chrome.tabs.captureVisibleTab(windowId, { format: "png" }); } catch {}
    return "";
  }
}

async function captureCurrentTab(tabId, captureReason = "manual_capture") {
  const tab = await chrome.tabs.get(tabId);
  const settings = await getSettings();

  let payload;
  try {
    payload = await chrome.tabs.sendMessage(tabId, {
      type: "UX_AUDIT_CAPTURE_PAGE",
      payload: {
        settings,
        captureReason,
      },
    });
  } catch {
    // A tab opened before the extension was reloaded may not have content.js yet.
    // The screenshot is still useful, so keep capture working with tab metadata.
    payload = {
      url: tab.url || "",
      title: tab.title || "Captured page",
      headings: [],
      visibleText: "",
      buttons: [],
      links: [],
      forms: [],
      tables: [],
      navigationLabels: [],
      dropdownModalState: "none",
      domSummary: "",
    };
  }

  const screenshotUrl = await captureFullPageScreenshot(tabId, tab.windowId, settings.includeScreenshotDataUrl);
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
      // Keep the large image in extension storage; never return it through the
      // popup message channel, which has a hard 64 MiB limit.
      const { screenshotUrl: _screenshotUrl, ...captureSummary } = capture;
      return { ok: true, capture: captureSummary };
    }

    if (message?.type === "UX_AUDIT_RENAME_LAST_CAPTURE") {
      const state = await getState();
      if (!state.captures?.length) throw new Error("Capture a page first.");
      const captures = state.captures.slice();
      captures[captures.length - 1] = { ...captures[captures.length - 1], title: String(message.name || "Captured page") };
      await setState({ ...state, captures });
      return { ok: true };
    }

    if (message?.type === "UX_AUDIT_SEND_TO_FORM") {
      const state = await getState();
      if (!state.captures?.length) throw new Error("Capture at least one page first.");
      const tabs = await chrome.tabs.query({});
      const target = tabs.find((tab) => tab.id && tab.url && /\/audit(?:\?|$)/.test(tab.url));
      if (!target?.id) throw new Error("Open the audit form before sending captures.");
      for (const capture of state.captures) {
        const screenshotUrl = String(capture.screenshotUrl || "");
        const captureMeta = { ...capture };
        delete captureMeta.screenshotUrl;
        await chrome.tabs.sendMessage(target.id, {
          type: "UX_AUDIT_IMPORT_CAPTURE_START",
          capture: captureMeta,
        });
        const chunkSize = 1024 * 1024;
        for (let offset = 0; offset < screenshotUrl.length; offset += chunkSize) {
          await chrome.tabs.sendMessage(target.id, {
            type: "UX_AUDIT_IMPORT_CAPTURE_CHUNK",
            chunk: screenshotUrl.slice(offset, offset + chunkSize),
          });
        }
        await chrome.tabs.sendMessage(target.id, { type: "UX_AUDIT_IMPORT_CAPTURE_END" });
      }
      await clearAudit();
      return { ok: true };
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
      const stateForPopup = {
        ...state,
        captures: (state.captures || []).map(({ screenshotUrl: _screenshotUrl, ...capture }) => capture),
      };
      return { ok: true, state: stateForPopup, settings };
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
