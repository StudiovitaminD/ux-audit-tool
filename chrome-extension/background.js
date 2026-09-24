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
  maxAuditPages: 8,
  captureMobileViewport: true,
  testSafeInteractions: true,
};

const MOBILE_VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };
let runnerPromise = null;

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

function isTrustedAuditAppUrl(value) {
  try {
    const url = new URL(value || "");
    return url.hostname === "ux-audit-tool-iota.vercel.app" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function injectAuditBridgeIntoOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !isTrustedAuditAppUrl(tab.url)) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["axe.min.js", "content.js"] });
    } catch {}
  }
}

// Unpacked-extension reloads do not re-run manifest content scripts in tabs
// that are already open. Inject the bridge when this service worker starts.
void injectAuditBridgeIntoOpenTabs();

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

function normalizedHostname(value) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function isAuditableUrl(value, origin) {
  try {
    const url = new URL(value);
    return normalizedHostname(url.href) === normalizedHostname(origin)
      && ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function normalizedPageUrl(value) {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}

async function updateRunnerState(patch) {
  const state = await getState();
  const nextState = { ...state, ...patch };
  await setState(nextState);
  if (state.tabId) {
    try {
      await sendToAuditTab(state.tabId, { type: "UX_AUDIT_RUNNER_STATUS", state: nextState.runner || null });
    } catch {}
  }
  return nextState;
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const initial = await chrome.tabs.get(tabId);
  if (initial.status === "complete") return initial;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("The page did not finish loading in time."));
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function setMobileEmulation(tabId, enabled) {
  try {
    await chrome.debugger.attach({ tabId }, "1.3");
  } catch (error) {
    if (!String(error?.message || error).includes("already attached")) throw error;
  }
  if (enabled) {
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setDeviceMetricsOverride", MOBILE_VIEWPORT);
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  } else {
    await chrome.debugger.sendCommand({ tabId }, "Emulation.clearDeviceMetricsOverride");
    await chrome.debugger.sendCommand({ tabId }, "Emulation.setTouchEmulationEnabled", { enabled: false });
    try { await chrome.debugger.detach({ tabId }); } catch {}
  }
}

async function runnerStatus(tabId, patch) {
  const state = await getState();
  const runner = { ...(state.runner || {}), ...patch, updatedAt: new Date().toISOString() };
  await setState({ ...state, runner });
  try { await sendToAuditTab(tabId, { type: "UX_AUDIT_RUNNER_STATUS", state: runner }); } catch {}
  return runner;
}

async function runVisibleAudit(tabId, options = {}) {
  const startingTab = await chrome.tabs.get(tabId);
  if (!startingTab.url || !/^https?:/.test(startingTab.url)) throw new Error("Open an http or https website before starting the audit.");
  const settings = await getSettings();
  const origin = new URL(startingTab.url).origin;
  const requestedUrls = Array.isArray(options.targetUrls) ? options.targetUrls : [];
  const queue = Array.from(new Set([startingTab.url, ...requestedUrls]
    .filter((url) => isAuditableUrl(url, origin))
    .map(normalizedPageUrl)));
  const visited = new Set();
  await startAudit(tabId, { journeyEnabled: true });
  await runnerStatus(tabId, { status: "running", phase: "starting", current: 0, total: 1, message: "Preparing visible audit", origin });

  try {
    while (queue.length && visited.size < settings.maxAuditPages) {
      const liveState = await getState();
      if (liveState.runner?.status === "stopped") break;
      while ((await getState()).runner?.status === "paused") await new Promise((resolve) => setTimeout(resolve, 500));

      const url = queue.shift();
      if (!url || visited.has(url) || !isAuditableUrl(url, origin)) continue;
      visited.add(url);
      await runnerStatus(tabId, {
        status: "running",
        phase: "navigating",
        current: visited.size,
        total: Math.min(settings.maxAuditPages, visited.size + queue.length),
        message: `Opening ${new URL(url).pathname || "/"}`,
      });
      await chrome.tabs.update(tabId, { url, active: true });
      await waitForTabComplete(tabId);
      await new Promise((resolve) => setTimeout(resolve, 700));

      await runnerStatus(tabId, { phase: "checking", message: "Checking structure, accessibility, keyboard and performance" });
      const inspection = await sendToAuditTab(tabId, {
        type: "UX_AUDIT_RUN_DETERMINISTIC_CHECKS",
        payload: { testSafeInteractions: settings.testSafeInteractions },
      });
      for (const link of inspection?.internalLinks || []) {
        if (queue.length + visited.size >= settings.maxAuditPages) break;
        const normalized = normalizedPageUrl(link);
        if (!visited.has(normalized) && !queue.includes(normalized) && isAuditableUrl(normalized, origin)) queue.push(normalized);
      }

      await runnerStatus(tabId, { phase: "capturing_desktop", message: "Capturing desktop evidence" });
      const desktop = await captureCurrentTab(tabId, options.captureReason || "visible_runner_desktop");
      const stateAfterDesktop = await getState();
      const captures = stateAfterDesktop.captures.slice();
      captures[captures.length - 1] = { ...desktop, viewport: "desktop", automatedChecks: inspection };
      await setState({ ...stateAfterDesktop, captures });

      if (settings.captureMobileViewport) {
        await runnerStatus(tabId, { phase: "capturing_mobile", message: "Checking the mobile viewport" });
        try {
          await setMobileEmulation(tabId, true);
          await new Promise((resolve) => setTimeout(resolve, 700));
          const mobileInspection = await sendToAuditTab(tabId, {
            type: "UX_AUDIT_RUN_DETERMINISTIC_CHECKS",
            payload: { testSafeInteractions: false },
          });
          const mobile = await captureCurrentTab(tabId, options.captureReason || "visible_runner_mobile");
          const stateAfterMobile = await getState();
          const mobileCaptures = stateAfterMobile.captures.slice();
          mobileCaptures[mobileCaptures.length - 1] = { ...mobile, viewport: "mobile", automatedChecks: mobileInspection };
          await setState({ ...stateAfterMobile, captures: mobileCaptures });
        } catch (error) {
          const stateAfterFailure = await getState();
          await setState({
            ...stateAfterFailure,
            runner: {
              ...(stateAfterFailure.runner || {}),
              mobileWarning: error instanceof Error ? error.message : "Mobile emulation was unavailable.",
            },
          });
        } finally {
          try { await setMobileEmulation(tabId, false); } catch {}
        }
      }
    }

    const state = await getState();
    const stopped = state.runner?.status === "stopped";
    await runnerStatus(tabId, {
      status: stopped ? "stopped" : "complete",
      phase: stopped ? "stopped" : "complete",
      current: visited.size,
      total: visited.size,
      message: stopped ? "Audit stopped" : `Audit complete: ${visited.size} pages checked`,
    });
    await stopAudit();
  } catch (error) {
    try { await setMobileEmulation(tabId, false); } catch {}
    await runnerStatus(tabId, { status: "error", phase: "error", message: error instanceof Error ? error.message : "Audit runner failed" });
    throw error;
  }
}

async function runTargetedRecapture(tabId, tasks) {
  const startingTab = await chrome.tabs.get(tabId);
  if (!startingTab.url || !/^https?:/.test(startingTab.url)) throw new Error("Open the audited website before starting follow-up capture.");
  const origin = new URL(startingTab.url).origin;
  await startAudit(tabId, { journeyEnabled: true });
  // One page visit can test several criteria. The previous URL-and-kind grouping
  // revisited the same page repeatedly, making a 24-task follow-up look endless.
  const batches = [];
  const batchByUrl = new Map();
  for (const task of tasks) {
    if (!task?.targetUrl || !isAuditableUrl(task.targetUrl, origin)) continue;
    const key = normalizedPageUrl(task.targetUrl);
    const existing = batchByUrl.get(key);
    if (existing) existing.tasks.push(task);
    else {
      const batch = { targetUrl: key, tasks: [task] };
      batchByUrl.set(key, batch);
      batches.push(batch);
    }
  }
  if (!batches.length) throw new Error("None of the follow-up tasks has a valid page URL on the audited website.");
  await runnerStatus(tabId, { status: "running", phase: "targeted", current: 0, total: batches.length, message: `Preparing ${batches.length} targeted checks for ${tasks.length} criteria` });

  for (const [index, batch] of batches.entries()) {
    await runnerStatus(tabId, { phase: "targeted", current: index + 1, total: batches.length, message: `Checking ${batch.tasks.length} ${batch.tasks.length === 1 ? "criterion" : "criteria"} on ${new URL(batch.targetUrl).pathname || "/"}` });
    try {
      await withTimeout((async () => {
        const currentTab = await chrome.tabs.get(tabId);
        let currentUrl = "";
        try { currentUrl = normalizedPageUrl(currentTab.url || startingTab.url); } catch {}
        if (currentUrl !== normalizedPageUrl(batch.targetUrl)) {
          await chrome.tabs.update(tabId, { url: batch.targetUrl, active: true });
          await waitForTabComplete(tabId, 15000);
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
        const taskChecks = [];
        for (const task of batch.tasks) {
          try {
            const result = await withTimeout(
              sendToAuditTab(tabId, { type: "UX_AUDIT_RUN_TARGETED_CHECK", payload: { task } }),
              7_000,
              `Timed out while checking ${task.kind || "visual"}.`,
            );
            taskChecks.push({ task, result });
          } catch (error) {
            taskChecks.push({
              task,
              result: {
                tested: false,
                taskId: task.id,
                kind: task.kind || "visual",
                question: task.question || "",
                pageUrl: batch.targetUrl,
                error: error instanceof Error ? error.message : "Targeted check failed.",
              },
            });
          }
        }
        const inspection = await sendToAuditTab(tabId, {
          type: "UX_AUDIT_RUN_DETERMINISTIC_CHECKS",
          payload: { testSafeInteractions: batch.tasks.some((task) => task.kind === "form") },
        });
        // A viewport capture is enough here because the full page was captured
        // during the first pass. Re-stitching every long page made follow-up hang.
        const capture = await captureCurrentTab(tabId, `targeted_${batch.kind}`, false);
        const state = await getState();
        const captures = state.captures.slice();
        captures.splice(captures.length - 1, 1, ...taskChecks.map(({ task: batchTask, result: targetedCheck }, taskIndex) => ({
          ...capture,
          screenshotUrl: taskIndex === 0 ? capture.screenshotUrl : "",
          viewport: "desktop",
          automatedChecks: inspection,
          targetedCheck: {
            ...targetedCheck,
            taskId: batchTask.id,
            question: batchTask.question,
          },
          recaptureTasks: batch.tasks.map((item) => item.id),
          recaptureQuestion: batchTask.question,
          recaptureBucket: batchTask.bucket,
        })));
        await setState({ ...state, captures });
      })(), 25000, `Timed out while checking ${batch.kind} on ${batch.targetUrl}.`);
    } catch (error) {
      const state = await getState();
      const failures = Array.isArray(state.runner?.taskFailures) ? state.runner.taskFailures : [];
      await runnerStatus(tabId, {
        taskFailures: [...failures, ...batch.tasks.map((item) => ({ taskId: item.id, error: error instanceof Error ? error.message : "Targeted check failed" }))],
        message: `Skipped one unavailable check; continuing (${index + 1}/${batches.length})`,
      });
    }
  }
  await runnerStatus(tabId, { status: "complete", phase: "complete", current: batches.length, total: batches.length, message: `Follow-up complete: ${batches.length} browser checks covered ${tasks.length} criteria` });
  await stopAudit();
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
    const [metricsResult] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
        const body = document.body;
        const html = document.documentElement;
        const candidates = [document.scrollingElement, ...document.querySelectorAll('*')]
          .filter((element) => {
            if (!element || element.scrollHeight <= element.clientHeight + 8) return false;
            if (element === document.scrollingElement || element === document.documentElement || element === document.body) return true;
            const style = getComputedStyle(element);
            return (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.clientHeight > 0;
          })
          .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
        const scroller = candidates[0] || document.scrollingElement;
        window.__uxAuditScroller = scroller;
        return {
          width: Math.max(scroller?.scrollWidth || 0, body?.scrollWidth || 0, html.scrollWidth, html.clientWidth),
          height: scroller?.scrollHeight || Math.max(body?.scrollHeight || 0, html.scrollHeight, html.clientHeight),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        };
      } });
    const page = metricsResult?.result;
    if (!page?.width || !page?.height || !page?.viewportHeight) throw new Error("Page dimensions unavailable.");

    await chrome.scripting.executeScript({ target: { tabId }, func: () => {
        const style = document.createElement('style');
        style.id = '__ux_audit_capture_style__';
        style.textContent = '* { animation: none !important; transition: none !important; } [style*="position: fixed"], [style*="position:sticky"] { visibility: hidden !important; }';
        document.documentElement.appendChild(style);
      } });

    const tiles = [];
    for (let y = 0; y < page.height; y += page.viewportHeight) {
      const tileHeight = Math.min(page.viewportHeight, page.height - y);
      const [scrollResult] = await chrome.scripting.executeScript({ target: { tabId }, args: [y], func: (position) => {
          const scroller = window.__uxAuditScroller || document.scrollingElement;
          if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) window.scrollTo(0, position);
          else scroller.scrollTop = position;
          return scroller.scrollTop;
        } });
      await new Promise((resolve) => setTimeout(resolve, 500));
      // captureVisibleTab is intentionally used here: it captures exactly the
      // viewport after scrolling, unlike CDP surface capture on some sites.
      const tile = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 40 });
      if (tile) tiles.push({ data: tile.split(",")[1], y, height: tileHeight });
    }

    await chrome.scripting.executeScript({ target: { tabId }, args: [page.scrollX, page.scrollY], func: (x, y) => {
        document.getElementById('__ux_audit_capture_style__')?.remove();
        const scroller = window.__uxAuditScroller || document.scrollingElement;
        if (scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body) window.scrollTo(x, y);
        else scroller.scrollTop = y;
      } });
    if (!tiles.length) throw new Error("No screenshot tiles captured.");

    const images = [];
    for (const tile of tiles) {
      const response = await fetch(`data:image/jpeg;base64,${tile.data}`);
      images.push(await createImageBitmap(await response.blob()));
    }
    const scale = images[0].width / page.viewportWidth;
    const canvas = new OffscreenCanvas(images[0].width, Math.ceil(page.height * scale));
    const context = canvas.getContext("2d");
    images.forEach((image, index) => context.drawImage(image, 0, tiles[index].y * scale));
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.4 });
    const buffer = await blob.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return `data:image/jpeg;base64,${btoa(binary)}`;
  } catch {
    try { return await chrome.tabs.captureVisibleTab(windowId, { format: "png" }); } catch {}
    return "";
  }
}

async function captureCurrentTab(tabId, captureReason = "manual_capture", fullPage = true) {
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

  let screenshotUrl = "";
  if (settings.includeScreenshotDataUrl) {
    if (fullPage) screenshotUrl = await captureFullPageScreenshot(tabId, tab.windowId, true);
    else {
      try { screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 50 }); } catch {}
    }
  }
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

async function sendToAuditTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, message);
  }
}

async function deliverCapturesToTab(tabId, captures, messageType = "UX_AUDIT_IMPORT_CAPTURE") {
  for (const capture of captures) {
    const screenshotUrl = String(capture.screenshotUrl || "");
    const captureMeta = { ...capture };
    delete captureMeta.screenshotUrl;
    await sendToAuditTab(tabId, { type: "UX_AUDIT_IMPORT_CAPTURE_START", capture: captureMeta, messageType });
    const chunkSize = 1024 * 1024;
    for (let offset = 0; offset < screenshotUrl.length; offset += chunkSize) {
      await sendToAuditTab(tabId, { type: "UX_AUDIT_IMPORT_CAPTURE_CHUNK", chunk: screenshotUrl.slice(offset, offset + chunkSize) });
    }
    await sendToAuditTab(tabId, { type: "UX_AUDIT_IMPORT_CAPTURE_END", messageType });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.settings]: settings,
  });
  const state = await getState();
  await setState(state);
  await injectAuditBridgeIntoOpenTabs();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (message?.type === "UX_AUDIT_START") {
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) throw new Error("No active tab found.");
      const state = await startAudit(tabId, message.options || {});
      return { ok: true, state };
    }

    if (message?.type === "UX_AUDIT_RUN_VISIBLE") {
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) throw new Error("No active tab found.");
      if (runnerPromise) throw new Error("An audit is already running.");
      runnerPromise = runVisibleAudit(tabId)
        .catch(() => undefined)
        .finally(() => { runnerPromise = null; });
      return { ok: true, started: true };
    }

    if (message?.type === "UX_AUDIT_RUN_TARGETED_RECAPTURE") {
      if (!isTrustedAuditAppUrl(sender.url || sender.tab?.url)) throw new Error("Targeted capture requests are accepted only from Design AID Audit.");
      if (runnerPromise) throw new Error("An audit is already running.");
      const tasks = Array.isArray(message.tasks) ? message.tasks : [];
      if (!tasks.length) throw new Error("No follow-up capture tasks were provided.");
      const reportTabId = sender.tab?.id;
      if (!reportTabId) throw new Error("Keep the report tab open during follow-up capture.");
      const targetUrls = Array.from(new Set(tasks.map((task) => String(task?.targetUrl || "")).filter(Boolean)));
      const targetOrigin = targetUrls[0] ? new URL(targetUrls[0]).origin : "";
      const tabs = await chrome.tabs.query({});
      const targetTab = tabs.find((tab) => {
        if (!tab.id || !tab.url) return false;
        return !targetOrigin || normalizedHostname(tab.url) === normalizedHostname(targetOrigin);
      });
      if (!targetTab?.id) throw new Error("Open the audited website in a tab before starting follow-up capture.");
      runnerPromise = (async () => {
        await runTargetedRecapture(targetTab.id, tasks);
        const state = await getState();
        const captures = state.captures || [];
        await deliverCapturesToTab(reportTabId, captures, "UX_AUDIT_RECAPTURE_RESULT");
        await sendToAuditTab(reportTabId, { type: "UX_AUDIT_RECAPTURE_COMPLETE", count: captures.length });
        await clearAudit();
      })().catch(async (error) => {
        try {
          await sendToAuditTab(reportTabId, {
            type: "UX_AUDIT_RECAPTURE_ERROR",
            error: error instanceof Error ? error.message : "Follow-up capture failed.",
          });
        } catch {}
      }).finally(() => { runnerPromise = null; });
      return { ok: true, started: true };
    }

    if (message?.type === "UX_AUDIT_RUNNER_CONTROL") {
      const state = await getState();
      const action = String(message.action || "");
      if (!["pause", "resume", "stop"].includes(action)) throw new Error("Unknown runner action.");
      const status = action === "pause" ? "paused" : action === "resume" ? "running" : "stopped";
      const nextState = await updateRunnerState({ runner: { ...(state.runner || {}), status, message: action === "pause" ? "Audit paused" : action === "resume" ? "Audit resumed" : "Stopping audit" } });
      return { ok: true, state: nextState };
    }

    if (message?.type === "UX_AUDIT_STOP") {
      const state = await stopAudit();
      return { ok: true, state };
    }

    if (message?.type === "UX_AUDIT_CLEAR") {
      await clearAudit();
      return { ok: true };
    }

    if (message?.type === "UX_AUDIT_REMOVE_CAPTURE") {
      const state = await getState();
      const index = Number(message.index);
      if (!Number.isInteger(index) || index < 0 || index >= (state.captures || []).length) {
        throw new Error("Capture not found.");
      }
      await setState({
        ...state,
        captures: state.captures.filter((_, captureIndex) => captureIndex !== index),
      });
      const updatedState = await getState();
      if (updatedState.captures.length !== state.captures.length - 1) {
        throw new Error("The capture could not be removed.");
      }
      return { ok: true, remaining: updatedState.captures.length };
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
      await deliverCapturesToTab(target.id, state.captures);
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
  if (["running", "paused"].includes(state.runner?.status)) return;
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
