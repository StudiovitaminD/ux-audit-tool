(function registerContentScript() {
  if (window.__uxAuditExtensionRegistered) return;
  window.__uxAuditExtensionRegistered = true;

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function unique(values, limit) {
    const seen = new Set();
    const out = [];
    for (const item of values) {
      const next = cleanText(item);
      if (!next) continue;
      const key = next.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(next);
      if (out.length >= limit) break;
    }
    return out;
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function textFromElements(selector, limit) {
    const values = Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .map((element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          return element.labels?.[0]?.innerText || element.placeholder || element.name;
        }
        return element.textContent || "";
      });
    return unique(values, limit);
  }

  function extractForms(limit) {
    const labels = textFromElements("label", limit);
    const placeholders = Array.from(
      document.querySelectorAll("input, textarea, select"),
    )
      .filter(isVisible)
      .map((element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          return element.placeholder || element.name || element.id;
        }
        if (element instanceof HTMLSelectElement) {
          return element.name || element.id;
        }
        return "";
      });
    return unique([...labels, ...placeholders], limit);
  }

  function extractTables(limit) {
    const values = [];
    document.querySelectorAll("table").forEach((table) => {
      if (!isVisible(table)) return;
      const headers = Array.from(table.querySelectorAll("th"))
        .map((th) => cleanText(th.textContent || ""))
        .filter(Boolean);
      if (headers.length) {
        values.push(headers.join(" | "));
      } else {
        const caption = cleanText(table.querySelector("caption")?.textContent || "");
        if (caption) values.push(caption);
      }
    });
    return unique(values, limit);
  }

  function extractNavigationLabels(limit) {
    const navValues = [];
    document.querySelectorAll("nav, [role='navigation'], aside").forEach((container) => {
      if (!isVisible(container)) return;
      const labels = Array.from(container.querySelectorAll("a, button, [role='menuitem'], [role='tab']"))
        .map((element) => cleanText(element.textContent || ""))
        .filter(Boolean);
      navValues.push(...labels);
    });
    return unique(navValues, limit);
  }

  function extractDropdownState() {
    const openDialog = document.querySelector("dialog[open], [role='dialog'], [aria-modal='true']");
    if (openDialog && isVisible(openDialog)) {
      return cleanText(openDialog.textContent || "dialog_open").slice(0, 160);
    }

    const expandedControl = Array.from(
      document.querySelectorAll("[aria-expanded='true'], [data-state='open'], .open, .is-open"),
    ).find(isVisible);

    if (expandedControl) {
      return cleanText(expandedControl.textContent || "dropdown_open").slice(0, 160);
    }

    return "none";
  }

  function extractVisibleText(limit) {
    const candidates = Array.from(document.querySelectorAll("main, [role='main'], body"))
      .filter(isVisible)
      .map((element) => cleanText(element.textContent || ""))
      .filter(Boolean);
    return cleanText(candidates.join(" ").slice(0, limit));
  }

  function buildDomSummary(payload) {
    const summary = [
      payload.headings?.[0] ? `Heading: ${payload.headings[0]}` : "",
      payload.buttons?.length ? `${payload.buttons.length} visible buttons` : "",
      payload.links?.length ? `${payload.links.length} visible links` : "",
      payload.forms?.length ? `${payload.forms.length} form cues` : "",
      payload.tables?.length ? `${payload.tables.length} table cues` : "",
      payload.navigationLabels?.length ? `${payload.navigationLabels.length} navigation labels` : "",
      payload.dropdownModalState && payload.dropdownModalState !== "none"
        ? `Overlay state: ${payload.dropdownModalState}`
        : "",
    ].filter(Boolean);

    return summary.join(" · ");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "UX_AUDIT_CAPTURE_PAGE") return;

    const settings = message.payload?.settings || {};
    const headings = unique(
      [
        ...textFromElements("h1", 4),
        ...textFromElements("h2", 6),
        ...textFromElements("h3", 6),
      ],
      10,
    );
    const buttons = textFromElements("button, [role='button'], input[type='submit']", settings.maxButtons || 40);
    const links = textFromElements("a", settings.maxLinks || 40);
    const forms = extractForms(settings.maxForms || 30);
    const tables = extractTables(settings.maxTables || 20);
    const navigationLabels = extractNavigationLabels(settings.maxNavigationLabels || 30);
    const visibleText = extractVisibleText(settings.maxVisibleTextLength || 4000);
    const dropdownModalState = extractDropdownState();

    const payload = {
      url: window.location.href,
      title: document.title || headings[0] || "Captured page",
      screenTypeLabel: "",
      headings,
      visibleText,
      buttons,
      links,
      forms,
      tables,
      navigationLabels,
      dropdownModalState,
      domSummary: "",
    };

    payload.domSummary = buildDomSummary(payload);
    sendResponse(payload);
  });
})();
