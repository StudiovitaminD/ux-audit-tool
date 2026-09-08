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
  document.getElementById("captureCount").textContent = `${captures.length} page${captures.length === 1 ? "" : "s"} captured`;
  renderCaptures(captures);
  showFlash("", "info");
}

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

  const name = window.prompt("Name this page", response.capture?.title || "Captured page");
  if (name?.trim()) {
    await send({ type: "UX_AUDIT_RENAME_LAST_CAPTURE", name: name.trim() });
  }
  showFlash("Full page captured.", "success");
  await refresh();
});

document.getElementById("sendCaptures").addEventListener("click", async () => {
  const response = await send({ type: "UX_AUDIT_SEND_TO_FORM" });
  if (!response?.ok) {
    showFlash(response?.error || "Could not send captures to the audit form.", "error");
    return;
  }
  showFlash("Captures sent to the audit form.", "success");
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

refresh();
