const FIELDS = [
  "autoCaptureOnNavigation",
  "includeScreenshotDataUrl",
  "maxVisibleTextLength",
  "maxButtons",
  "maxLinks",
  "maxForms",
  "maxTables",
  "maxNavigationLabels",
];

function setMessage(message, tone = "info") {
  const node = document.getElementById("settingsMessage");
  node.textContent = message;
  node.dataset.tone = tone;
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: "UX_AUDIT_GET_STATE" });
  if (!response?.ok) {
    setMessage(response?.error || "Could not load settings.", "error");
    return;
  }

  const settings = response.settings || {};
  for (const field of FIELDS) {
    const input = document.getElementById(field);
    if (!input) continue;
    if (input.type === "checkbox") {
      input.checked = !!settings[field];
    } else {
      input.value = settings[field] ?? "";
    }
  }
}

document.getElementById("saveSettings").addEventListener("click", async () => {
  const settings = {};
  for (const field of FIELDS) {
    const input = document.getElementById(field);
    if (!input) continue;
    settings[field] = input.type === "checkbox" ? input.checked : Number(input.value);
  }

  const response = await chrome.runtime.sendMessage({
    type: "UX_AUDIT_SAVE_SETTINGS",
    settings,
  });

  if (!response?.ok) {
    setMessage(response?.error || "Could not save settings.", "error");
    return;
  }

  setMessage("Settings saved.", "success");
});

loadSettings();
