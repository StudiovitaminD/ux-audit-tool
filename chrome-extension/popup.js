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

  const { state } = response;
  const captures = state.captures || [];
  document.getElementById("captureCount").textContent = `${captures.length} page${captures.length === 1 ? "" : "s"} captured`;
  renderCaptures(captures);
  showFlash("", "info");
}

document.getElementById("capturePage").addEventListener("click", async () => {
  try {
    const tab = await getCurrentTab();
    if (!tab?.id) throw new Error("No active tab found.");

    const response = await send({
      type: "UX_AUDIT_CAPTURE",
      tabId: tab.id,
      captureReason: "manual_capture",
    });
    if (!response?.ok) throw new Error(response?.error || "Could not capture this page.");

    const name = window.prompt("Name this page", response.capture?.title || "Captured page");
    if (name?.trim()) {
      const renamed = await send({ type: "UX_AUDIT_RENAME_LAST_CAPTURE", name: name.trim() });
      if (!renamed?.ok) throw new Error(renamed?.error || "Could not name this capture.");
    }
    showFlash("Full page captured.", "success");
    await refresh();
  } catch (error) {
    showFlash(error instanceof Error ? error.message : "Could not capture this page.", "error");
  }
});

document.getElementById("sendCaptures").addEventListener("click", async () => {
  try {
    const response = await send({ type: "UX_AUDIT_SEND_TO_FORM" });
    if (!response?.ok) throw new Error(response?.error || "Could not send captures to the audit form.");
    showFlash("Captures sent to the audit form.", "success");
  } catch (error) {
    showFlash(error instanceof Error ? error.message : "Could not send captures to the audit form.", "error");
  }
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
