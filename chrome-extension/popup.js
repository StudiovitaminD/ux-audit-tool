async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function showFlash(message, tone = "info") {
  const node = document.getElementById("flashMessage");
  node.textContent = message;
  node.dataset.tone = tone;
}

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

function renderCaptures(captures) {
  const list = document.getElementById("capturesList");
  if (!captures.length) {
    list.className = "capture-list empty";
    list.textContent = "No captures yet.";
    return;
  }

  list.className = "capture-list";
  list.innerHTML = captures
    .map(
      (capture, index) => `
        <div class="capture-item">
          <div class="capture-index">${index + 1}</div>
          <div class="capture-meta">
            <div class="capture-title">${capture.title || "Captured page"}</div>
            <div class="capture-subtitle">${capture.screenTypeLabel || "other"} · ${capture.captureReason || "manual_capture"}</div>
            <div class="capture-url">${capture.url || ""}</div>
          </div>
        </div>
      `,
    )
    .join("");
}

async function refresh() {
  const response = await send({ type: "UX_AUDIT_GET_STATE" });
  if (!response?.ok) {
    showFlash(response?.error || "Could not load extension state.", "error");
    return;
  }

  const { state, settings } = response;
  const captures = state.captures || [];
  document.getElementById("sessionStatus").textContent = state.running
    ? `Running on tab ${state.tabId || "—"}`
    : "Not started";
  document.getElementById("captureCount").textContent = `${captures.length} page${captures.length === 1 ? "" : "s"} captured`;
  document.getElementById("journeyToggle").checked = !!state.journey?.enabled;
  renderCaptures(captures);

  if (settings?.autoCaptureOnNavigation && state.journey?.enabled) {
    showFlash("Journey recording is enabled with auto-capture on navigation.", "info");
  } else {
    showFlash("", "info");
  }
}

document.getElementById("startAudit").addEventListener("click", async () => {
  const tab = await getCurrentTab();
  if (!tab?.id) {
    showFlash("No active tab found.", "error");
    return;
  }

  const journeyEnabled = document.getElementById("journeyToggle").checked;
  const response = await send({
    type: "UX_AUDIT_START",
    tabId: tab.id,
    options: { journeyEnabled },
  });

  if (!response?.ok) {
    showFlash(response?.error || "Could not start the audit session.", "error");
    return;
  }

  showFlash("Audit session started.", "success");
  await refresh();
});

document.getElementById("capturePage").addEventListener("click", async () => {
  const tab = await getCurrentTab();
  if (!tab?.id) {
    showFlash("No active tab found.", "error");
    return;
  }

  const response = await send({
    type: "UX_AUDIT_CAPTURE",
    tabId: tab.id,
    captureReason: "manual_capture",
  });

  if (!response?.ok) {
    showFlash(response?.error || "Could not capture this page.", "error");
    return;
  }

  showFlash("Page captured.", "success");
  await refresh();
});

document.getElementById("stopAudit").addEventListener("click", async () => {
  const response = await send({ type: "UX_AUDIT_STOP" });
  if (!response?.ok) {
    showFlash(response?.error || "Could not stop the audit session.", "error");
    return;
  }
  showFlash("Audit session stopped.", "success");
  await refresh();
});

document.getElementById("clearCaptures").addEventListener("click", async () => {
  const response = await send({ type: "UX_AUDIT_CLEAR" });
  if (!response?.ok) {
    showFlash(response?.error || "Could not clear captures.", "error");
    return;
  }
  showFlash("Captured evidence cleared.", "success");
  await refresh();
});

document.getElementById("copyJson").addEventListener("click", async () => {
  const response = await send({ type: "UX_AUDIT_EXPORT" });
  if (!response?.ok) {
    showFlash(response?.error || "Could not export capture JSON.", "error");
    return;
  }
  await navigator.clipboard.writeText(response.json || "[]");
  showFlash("Capture JSON copied. Paste it into the app.", "success");
});

document.getElementById("downloadJson").addEventListener("click", async () => {
  const response = await send({ type: "UX_AUDIT_EXPORT" });
  if (!response?.ok) {
    showFlash(response?.error || "Could not export capture JSON.", "error");
    return;
  }

  const blob = new Blob([response.json || "[]"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url,
    filename: `ux-audit-captures-${Date.now()}.json`,
    saveAs: true,
  });
  showFlash("Capture JSON download started.", "success");
});

document.getElementById("openOptions").addEventListener("click", async () => {
  await chrome.runtime.openOptionsPage();
});

document.getElementById("journeyToggle").addEventListener("change", async (event) => {
  await send({
    type: "UX_AUDIT_UPDATE_JOURNEY",
    enabled: event.target.checked,
  });
  await refresh();
});

refresh();
