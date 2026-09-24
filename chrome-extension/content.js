(function registerContentScript() {
  if (window.__uxAuditExtensionRegistered) return;
  window.__uxAuditExtensionRegistered = true;

  let pendingImport = null;
  let pendingImportType = "UX_AUDIT_IMPORT_CAPTURE";

  // Execute authenticated planner requests in the report tab. No API key is
  // distributed to the extension or the audited website.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "UX_AUDIT_GUIDE_REQUEST") return;
    if (!["ux-audit-tool-iota.vercel.app", "localhost", "127.0.0.1"].includes(location.hostname)) return;
    fetch(`/api/audit/${encodeURIComponent(message.reportId)}/capture-guide`, {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message.payload), signal: AbortSignal.timeout(110000),
    }).then(async (response) => {
      const body = await response.json();
      sendResponse(response.ok ? body : { error: body.error || "Guide unavailable" });
    }).catch((error) => sendResponse({ error: String(error.message || error) }));
    return true;
  });

  let guideControls = [];
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "UX_AUDIT_GUIDE_SNAPSHOT") {
      guideControls = Array.from(document.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea, summary, [tabindex]"))
        .filter((element) => isVisible(element) && !element.closest("#__ux_audit_runner__")).slice(0, 40);
      sendResponse({ url: location.href, text: cleanText(document.body.innerText).slice(0, 6000),
        controls: guideControls.map((element, index) => ({ index, tag: element.tagName, name: accessibleName(element), type: element.getAttribute("type") })) });
    }
    if (message?.type === "UX_AUDIT_GUIDE_ACTION") {
      const control = guideControls[message.decision?.target];
      if (!control?.isConnected) { sendResponse({ error: "Control is no longer present" }); return; }
      if (message.decision.action === "focus") control.focus({ preventScroll: false });
      else if (message.decision.action === "scroll") control.scrollIntoView({ block: "center" });
      else { sendResponse({ error: "Unsupported action" }); return; }
      sendResponse({ tested: true, method: message.decision.action, control: accessibleName(control) });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "UX_AUDIT_IMPORT_CAPTURE_START") {
      pendingImport = { ...message.capture, screenshotUrl: "" };
      pendingImportType = message.messageType || "UX_AUDIT_IMPORT_CAPTURE";
      return;
    }
    if (message?.type === "UX_AUDIT_IMPORT_CAPTURE_CHUNK" && pendingImport) {
      pendingImport.screenshotUrl += String(message.chunk || "");
      return;
    }
    if (message?.type === "UX_AUDIT_IMPORT_CAPTURE_END" && pendingImport) {
      window.postMessage({
        source: "ux-audit-extension",
        type: pendingImportType,
        captures: [pendingImport],
      }, "*");
      pendingImport = null;
      pendingImportType = "UX_AUDIT_IMPORT_CAPTURE";
      return;
    }
    if (message?.type === "UX_AUDIT_RECAPTURE_ERROR" || message?.type === "UX_AUDIT_RECAPTURE_COMPLETE") {
      window.postMessage({ source: "ux-audit-extension", type: message.type, error: message.error }, "*");
      return;
    }
    if (message?.type === "UX_AUDIT_IMPORT_CAPTURES" || message?.type === "UX_AUDIT_IMPORT_CAPTURE") {
      window.postMessage({
        source: "ux-audit-extension",
        type: message.type,
        captures: message.captures || (message.capture ? [message.capture] : []),
      }, "*");
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "ux-audit-app") return;
    if (!["ux-audit-tool-iota.vercel.app", "localhost", "127.0.0.1"].includes(location.hostname)) return;
    if (event.data.type === "UX_AUDIT_EXTENSION_PING") {
      window.postMessage({
        source: "ux-audit-extension",
        type: "UX_AUDIT_EXTENSION_READY",
        version: chrome.runtime.getManifest().version,
      }, "*");
      return;
    }
    if (event.data.type !== "UX_AUDIT_RUN_TARGETED_RECAPTURE") return;
    chrome.runtime.sendMessage({
      type: "UX_AUDIT_RUN_TARGETED_RECAPTURE",
      tasks: Array.isArray(event.data.tasks) ? event.data.tasks : [],
      reportId: event.data.reportId || "",
    }).then((response) => {
      window.postMessage({
        source: "ux-audit-extension",
        type: "UX_AUDIT_RECAPTURE_STARTED",
        ok: Boolean(response?.ok),
        error: response?.error || "",
      }, "*");
    }).catch((error) => {
      window.postMessage({
        source: "ux-audit-extension",
        type: "UX_AUDIT_RECAPTURE_STARTED",
        ok: false,
        error: error instanceof Error ? error.message : "Extension unavailable.",
      }, "*");
    });
  });

  if (["ux-audit-tool-iota.vercel.app", "localhost", "127.0.0.1"].includes(location.hostname)) {
    window.postMessage({
      source: "ux-audit-extension",
      type: "UX_AUDIT_EXTENSION_READY",
      version: chrome.runtime.getManifest().version,
    }, "*");
  }

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

  function accessibleName(element) {
    return cleanText(
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.labels?.[0]?.innerText ||
      element.textContent ||
      element.getAttribute("alt") ||
      element.getAttribute("name") ||
      "",
    );
  }

  function setNativeFieldValue(field, value) {
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : field instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(field, value);
    else field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function safeTextValue(field) {
    const identity = cleanText(`${field.name || ""} ${field.id || ""} ${field.placeholder || ""} ${accessibleName(field)}`).toLowerCase();
    const type = String(field.type || "text").toLowerCase();
    let value = type === "email" || /e-?mail/.test(identity)
      ? "ux-audit@example.com"
      : type === "tel" || /phone|mobile|telephone/.test(identity)
        ? "5550101234"
        : type === "url" || /website|url/.test(identity)
          ? "https://example.com"
          : type === "date"
            ? new Date().toISOString().slice(0, 10)
            : type === "number"
              ? String(Math.max(Number(field.min) || 1, 1))
              : /first.?name/.test(identity)
                ? "UX"
                : /last.?name/.test(identity)
                  ? "Audit"
                  : /name/.test(identity)
                    ? "UX Audit Test"
                    : /company|organisation|organization/.test(identity)
                      ? "UX Audit Test"
                      : /message|comment|description|details|query|enquiry/.test(identity)
                        ? "Automated UX audit test submission."
                        : "UX audit test";
    const maxLength = Number(field.maxLength);
    if (maxLength > 0) value = value.slice(0, maxLength);
    const minLength = Number(field.minLength);
    if (minLength > 0 && value.length < minLength) value = `${value}${" test".repeat(Math.ceil((minLength - value.length) / 5))}`.slice(0, maxLength > 0 ? maxLength : minLength);
    return value;
  }

  function fillFormWithSafeTestData(form) {
    const filledFields = [];
    const radioGroups = new Set();
    const fields = Array.from(form.elements).filter((field) => isVisible(field) && !field.disabled);
    for (const field of fields) {
      if (field instanceof HTMLSelectElement) {
        if (field.value) continue;
        const option = Array.from(field.options).find((item) => !item.disabled && item.value);
        if (!option) continue;
        setNativeFieldValue(field, option.value);
        filledFields.push(accessibleName(field) || field.name || "select");
        continue;
      }
      if (field instanceof HTMLTextAreaElement) {
        if (field.value.trim()) continue;
        setNativeFieldValue(field, safeTextValue(field));
        filledFields.push(accessibleName(field) || field.name || "textarea");
        continue;
      }
      if (!(field instanceof HTMLInputElement)) continue;
      const type = String(field.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "reset", "image", "file", "password"].includes(type)) continue;
      if (type === "checkbox") {
        if (field.required && !field.checked) {
          field.click();
          filledFields.push(accessibleName(field) || field.name || "checkbox");
        }
        continue;
      }
      if (type === "radio") {
        const group = field.name || `radio-${filledFields.length}`;
        if (radioGroups.has(group) || form.querySelector(`input[type="radio"][name="${CSS.escape(field.name)}"]:checked`)) continue;
        field.click();
        radioGroups.add(group);
        filledFields.push(accessibleName(field) || field.name || "radio option");
        continue;
      }
      if (field.value.trim()) continue;
      setNativeFieldValue(field, safeTextValue(field));
      filledFields.push(accessibleName(field) || field.name || type);
    }
    return filledFields;
  }

  function visibleAuditableForms() {
    return Array.from(document.forms).filter((form) =>
      isVisible(form) || Array.from(form.elements).some((field) => isVisible(field)),
    );
  }

  function parseColor(value) {
    const match = String(value || "").match(/[\d.]+/g);
    if (!match || match.length < 3) return null;
    return match.slice(0, 4).map(Number);
  }

  function luminance(color) {
    const rgb = color.slice(0, 3).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrastRatio(foreground, background) {
    const fg = parseColor(foreground);
    const bg = parseColor(background);
    if (!fg || !bg || (bg[3] !== undefined && bg[3] < 1)) return null;
    const first = luminance(fg);
    const second = luminance(bg);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  }

  async function deterministicChecks(testSafeInteractions) {
    const focusables = Array.from(document.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    )).filter(isVisible);
    const unlabeledControls = focusables
      .filter((element) => !accessibleName(element))
      .slice(0, 20)
      .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`);
    const imagesWithoutAlt = Array.from(document.images)
      .filter(isVisible)
      .filter((image) => !image.hasAttribute("alt"))
      .slice(0, 20)
      .map((image) => image.currentSrc || image.src || "image");
    const inputsWithoutLabels = Array.from(document.querySelectorAll("input, select, textarea"))
      .filter(isVisible)
      .filter((element) => !accessibleName(element))
      .slice(0, 20)
      .map((element) => element.getAttribute("name") || element.id || element.tagName.toLowerCase());
    const headingLevels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter(isVisible)
      .map((heading) => Number(heading.tagName.slice(1)));
    const headingSkips = headingLevels.filter((level, index) => index > 0 && level > headingLevels[index - 1] + 1).length;
    const contrastSamples = Array.from(document.querySelectorAll("p, li, label, button, a, h1, h2, h3"))
      .filter(isVisible)
      .slice(0, 120)
      .map((element) => {
        const style = getComputedStyle(element);
        const ratio = contrastRatio(style.color, style.backgroundColor);
        return ratio === null ? null : { text: cleanText(element.textContent).slice(0, 80), ratio: Math.round(ratio * 100) / 100 };
      })
      .filter(Boolean);
    const lowContrastSamples = contrastSamples.filter((sample) => sample.ratio < 4.5).slice(0, 20);
    const interactiveStates = [];
    const formStates = [];
    const landmarks = document.querySelectorAll("main, nav, aside, header, footer, [role='main'], [role='navigation'], [role='complementary'], [role='banner'], [role='contentinfo']").length;
    const forms = Array.from(document.forms);
    const fields = Array.from(document.querySelectorAll("input, select, textarea")).filter(isVisible);
    const animations = document.getAnimations ? document.getAnimations().filter((animation) => animation.playState === "running").length : 0;
    let axeResult = null;
    if (globalThis.axe?.run) {
      try {
        const result = await globalThis.axe.run(document, { resultTypes: ["violations", "passes"] });
        axeResult = {
          tested: true,
          violations: result.violations.length,
          critical: result.violations.filter((item) => item.impact === "critical").length,
          serious: result.violations.filter((item) => item.impact === "serious").length,
          passes: result.passes.length,
          rules: result.violations.slice(0, 20).map((item) => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length })),
        };
      } catch {
        axeResult = { tested: false, violations: 0, critical: 0, serious: 0, passes: 0, rules: [] };
      }
    }

    if (testSafeInteractions) {
      const safeControls = Array.from(document.querySelectorAll(
        "summary, button[aria-expanded], [role='tab'], button[aria-controls]",
      ))
        .filter(isVisible)
        .filter((element) => !element.closest("form") || (element.getAttribute("type") || "button").toLowerCase() === "button")
        .filter((element) => !/delete|remove|pay|buy|purchase|submit|send|save|confirm|log out|sign out/i.test(accessibleName(element)))
        .slice(0, 8);
      for (const control of safeControls) {
        const before = control.getAttribute("aria-expanded") || control.getAttribute("aria-selected") || "closed";
        try {
          control.focus({ preventScroll: true });
          control.click();
          const after = control.getAttribute("aria-expanded") || control.getAttribute("aria-selected") || "changed";
          interactiveStates.push({ control: accessibleName(control) || control.tagName.toLowerCase(), before, after, result: before !== after ? "state_changed" : "activated" });
        } catch {
          interactiveStates.push({ control: accessibleName(control) || control.tagName.toLowerCase(), before, after: before, result: "blocked" });
        }
      }

      for (const form of visibleAuditableForms().slice(0, 3)) {
        const formText = cleanText(`${form.getAttribute("aria-label") || ""} ${form.textContent || ""}`).slice(0, 180);
        const sensitive = Boolean(form.querySelector("input[type='password'], input[type='file'], input[autocomplete*='cc-'], input[name*='card' i], input[name*='payment' i]"));
        const destructive = /pay|purchase|buy|delete|remove|publish|logout|log out|close account|place order|confirm order/i.test(formText);
        if (sensitive || destructive) {
          formStates.push({ form: formText || "Form", result: "blocked_by_safety_policy" });
          continue;
        }
        const approved = window.confirm(`Design AID wants to fill this form with safe test data and submit it once to capture its validation or result state:\n\n${formText || "Unnamed form"}\n\nAllow this one submission?`);
        if (!approved) {
          formStates.push({ form: formText || "Form", result: "user_denied" });
          continue;
        }
        const beforeUrl = location.href;
        const beforeText = cleanText(document.querySelector("[role='alert'], [role='status'], [aria-live]")?.textContent || "");
        try {
          const filledFields = fillFormWithSafeTestData(form);
          const submitter = Array.from(form.elements).find((field) =>
            (field instanceof HTMLButtonElement || field instanceof HTMLInputElement) &&
            ["submit", "image"].includes(String(field.type || "submit").toLowerCase()) &&
            !field.disabled,
          );
          form.requestSubmit(submitter || undefined);
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const afterText = cleanText(document.querySelector("[role='alert'], [role='status'], [aria-live]")?.textContent || "");
          const invalidFields = Array.from(form.querySelectorAll(":invalid")).map((field) => accessibleName(field) || field.getAttribute("name") || field.tagName.toLowerCase()).slice(0, 12);
          formStates.push({
            form: formText || "Form",
            result: invalidFields.length ? "validation_observed" : location.href !== beforeUrl ? "navigation_observed" : "submitted",
            invalidFields,
            filledFields,
            statusBefore: beforeText,
            statusAfter: afterText,
          });
        } catch {
          formStates.push({ form: formText || "Form", result: "submission_failed" });
        }
      }
    }

    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const internalLinks = Array.from(document.querySelectorAll("a[href]"))
      .map((anchor) => anchor.href)
      .filter((href) => {
        try { return new URL(href).origin === location.origin; } catch { return false; }
      });
    const activeBefore = document.activeElement;
    const keyboardSamples = focusables.slice(0, 20).map((element) => {
      try { element.focus({ preventScroll: true }); } catch {}
      return { name: accessibleName(element) || element.tagName.toLowerCase(), focusable: document.activeElement === element };
    });
    try { activeBefore?.focus?.({ preventScroll: true }); } catch {}

    return {
      testedAt: new Date().toISOString(),
      pageUrl: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      accessibility: {
        focusableCount: focusables.length,
        unlabeledControls,
        imagesWithoutAlt,
        inputsWithoutLabels,
        headingSkips,
        documentLanguage: document.documentElement.lang || "",
        pageTitlePresent: Boolean(document.title.trim()),
        landmarks,
      },
      keyboard: {
        testedCount: keyboardSamples.length,
        reachableCount: keyboardSamples.filter((sample) => sample.focusable).length,
        samples: keyboardSamples,
      },
      contrast: { testedCount: contrastSamples.length, lowContrastSamples },
      responsive: {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      },
      performance: navigation ? {
        domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
        loadMs: Math.round(navigation.loadEventEnd),
        responseMs: Math.round(navigation.responseEnd),
        resourceCount: resources.length,
        transferBytes: Math.round(resources.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0)),
      } : null,
      interactions: interactiveStates,
      forms: {
        formCount: forms.length,
        requiredFields: fields.filter((field) => field.required || field.getAttribute("aria-required") === "true").length,
        unlabeledFields: inputsWithoutLabels.length,
        statusRegions: document.querySelectorAll("[role='status'], [role='alert'], [aria-live]").length,
        testedStates: formStates,
      },
      motion: {
        animationsDetected: animations,
        reducedMotionMatched: matchMedia("(prefers-reduced-motion: reduce)").matches,
      },
      axe: axeResult,
      internalLinks: unique(internalLinks, 80),
    };
  }

  function pageGeometry() {
    const elements = Array.from(document.body.querySelectorAll("*")).filter(isVisible).slice(0, 2500);
    const clipped = elements.filter((element) => {
      const style = getComputedStyle(element);
      return ["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2;
    });
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      clippedElements: clipped.slice(0, 20).map((element) => accessibleName(element) || element.tagName.toLowerCase()),
    };
  }

  async function targetedCheck(task) {
    const question = cleanText(task?.question || "");
    const kind = String(task?.kind || "visual");
    const result = { tested: false, taskId: String(task?.id || ""), kind, question, pageUrl: location.href, testedAt: new Date().toISOString() };

    if (kind === "zoom" || kind === "text_spacing") {
      const style = document.createElement("style");
      style.id = "__ux_audit_targeted_style__";
      if (kind === "zoom") {
        style.textContent = "html { zoom: 2 !important; }";
      } else {
        style.textContent = "* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }";
      }
      document.documentElement.appendChild(style);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const geometry = pageGeometry();
      style.remove();
      return { ...result, tested: true, method: kind === "zoom" ? "200_percent_layout_zoom" : "wcag_text_spacing_override", ...geometry };
    }

    if (kind === "performance") {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance.getEntriesByType("resource");
      const images = Array.from(document.images);
      const scripts = Array.from(document.scripts).filter((script) => script.src);
      const shifts = performance.getEntriesByType("layout-shift");
      return {
        ...result,
        tested: Boolean(navigation),
        method: "performance_api",
        domContentLoadedMs: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
        loadMs: navigation ? Math.round(navigation.loadEventEnd) : null,
        responseMs: navigation ? Math.round(navigation.responseEnd) : null,
        resourceCount: resources.length,
        transferBytes: Math.round(resources.reduce((sum, entry) => sum + Number(entry.transferSize || 0), 0)),
        imageCount: images.length,
        imagesWithoutLazyLoading: images.filter((image) => image.loading !== "lazy" && !image.complete).length,
        scriptCount: scripts.length,
        layoutShiftScore: shifts.reduce((sum, entry) => sum + Number(entry.value || 0), 0),
        ...pageGeometry(),
      };
    }

    if (kind === "motion") {
      const animations = document.getAnimations ? document.getAnimations() : [];
      return {
        ...result,
        tested: true,
        method: "web_animations_api",
        animationsDetected: animations.length,
        runningAnimations: animations.filter((animation) => animation.playState === "running").length,
        durations: animations.map((animation) => Number(animation.effect?.getTiming?.().duration || 0)).filter(Number.isFinite).slice(0, 30),
        reducedMotionMatched: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
    }

    if (kind === "keyboard") {
      const focusables = Array.from(document.querySelectorAll(
        "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
      )).filter(isVisible).slice(0, 20);
      const activeBefore = document.activeElement;
      const samples = focusables.map((element) => {
        try { element.focus({ preventScroll: true }); } catch {}
        return {
          control: accessibleName(element) || element.tagName.toLowerCase(),
          focusable: document.activeElement === element,
        };
      });
      try { activeBefore?.focus?.({ preventScroll: true }); } catch {}
      return { ...result, tested: samples.length > 0, method: "keyboard_focus_probe", samples };
    }

    if (kind === "responsive") {
      return { ...result, tested: true, method: "responsive_layout_probe", ...pageGeometry() };
    }

    if (kind === "form") {
      const forms = visibleAuditableForms();
      return {
        ...result,
        tested: forms.length > 0,
        method: "form_structure_probe",
        formCount: forms.length,
        requiredFieldCount: forms.reduce((count, form) => count + form.querySelectorAll("[required], [aria-required='true']").length, 0),
        statusRegionCount: document.querySelectorAll("[role='status'], [role='alert'], [aria-live]").length,
      };
    }

    if (kind === "interaction") {
      const controls = Array.from(document.querySelectorAll("button, [role='button'], summary, [aria-expanded], [role='tab']"))
        .filter(isVisible)
        .filter((element) => !element.closest("form, #__ux_audit_runner__"))
        .filter((element) => !/delete|remove|pay|buy|purchase|submit|send|save|confirm|log out|sign out/i.test(accessibleName(element)))
        .slice(0, 5);
      const samples = [];
      for (const control of controls) {
        const before = cleanText(document.body.innerText).slice(0, 5000);
        const started = performance.now();
        control.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        samples.push({
          control: accessibleName(control) || control.tagName.toLowerCase(),
          responseMs: Math.round(performance.now() - started),
          stateChanged: before !== cleanText(document.body.innerText).slice(0, 5000),
          disabledAfterAction: Boolean(control.disabled || control.getAttribute("aria-disabled") === "true"),
        });
      }
      return { ...result, tested: samples.length > 0, method: "safe_control_activation", samples };
    }

    // A screenshot plus visible DOM evidence is valid for visual-only criteria.
    return { ...result, tested: true, method: "visual_capture", ...pageGeometry() };
  }

  function ensureRunnerOverlay() {
    let host = document.getElementById("__ux_audit_runner__");
    if (host) return host;
    host = document.createElement("aside");
    host.id = "__ux_audit_runner__";
    host.setAttribute("aria-live", "polite");
    host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;width:320px;padding:16px;border:1px solid #262626;border-radius:18px;background:#fffdf8;color:#171717;box-shadow:0 18px 55px rgba(0,0,0,.24);font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif";
    host.innerHTML = `<strong style="display:block;font-size:16px">Design AID visible audit</strong><div data-runner-message style="margin-top:6px;color:#625f58">Preparing checks…</div><div style="height:6px;margin-top:12px;border-radius:99px;background:#e7e1d8;overflow:hidden"><div data-runner-progress style="width:4%;height:100%;background:#f05d3d;transition:width .3s ease"></div></div><div style="display:flex;gap:8px;margin-top:12px"><button data-runner-pause type="button" style="padding:7px 12px;border:1px solid #bbb;border-radius:999px;background:white;color:#171717">Pause</button><button data-runner-stop type="button" style="padding:7px 12px;border:1px solid #d33;border-radius:999px;background:white;color:#a11">Stop</button></div>`;
    host.querySelector("[data-runner-pause]").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      const paused = button.dataset.paused === "true";
      button.dataset.paused = paused ? "false" : "true";
      button.textContent = paused ? "Pause" : "Resume";
      await chrome.runtime.sendMessage({ type: "UX_AUDIT_RUNNER_CONTROL", action: paused ? "resume" : "pause" });
    });
    host.querySelector("[data-runner-stop]").addEventListener("click", () => chrome.runtime.sendMessage({ type: "UX_AUDIT_RUNNER_CONTROL", action: "stop" }));
    document.documentElement.appendChild(host);
    return host;
  }

  function renderRunnerStatus(state) {
    const host = ensureRunnerOverlay();
    host.querySelector("[data-runner-message]").textContent = state?.message || "Running audit checks";
    const total = Math.max(1, Number(state?.total || 1));
    const current = Math.max(0, Number(state?.current || 0));
    host.querySelector("[data-runner-progress]").style.width = `${Math.min(100, Math.max(4, current / total * 100))}%`;
    if (["complete", "stopped", "error"].includes(state?.status)) {
      host.querySelector("[data-runner-pause]").hidden = true;
      host.querySelector("[data-runner-stop]").hidden = true;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "UX_AUDIT_RUNNER_STATUS") {
      renderRunnerStatus(message.state || {});
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "UX_AUDIT_RUN_DETERMINISTIC_CHECKS") {
      deterministicChecks(Boolean(message.payload?.testSafeInteractions))
        .then(sendResponse)
        .catch((error) => sendResponse({ error: error instanceof Error ? error.message : "Checks failed", internalLinks: [] }));
      return true;
    }
    if (message?.type === "UX_AUDIT_RUN_TARGETED_CHECK") {
      targetedCheck(message.payload?.task || {})
        .then(sendResponse)
        .catch((error) => sendResponse({ tested: false, error: error instanceof Error ? error.message : "Targeted check failed" }));
      return true;
    }
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
