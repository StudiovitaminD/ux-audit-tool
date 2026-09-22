# UX Audit Capture Chrome Extension

This folder contains a real Chrome extension for the UX audit app.

## What it does

- Starts an audit session on the current tab
- Captures the current page into the JSON format already accepted by the app
- Optionally records a journey
- Optionally auto-captures on navigation
- Exports JSON that can be pasted into `Browser extension evidence (JSON)` in the intake form
- Runs a visible, same-origin audit that users can watch, pause, or stop
- Discovers internal pages and captures desktop and mobile evidence
- Records deterministic accessibility, keyboard, contrast, responsive, and performance checks
- Safely tests tabs, menus, accordions, and disclosure controls without submitting forms
- Receives unresolved criteria from the report and runs one targeted follow-up capture pass
- Runs question-specific 200% zoom, WCAG text-spacing, performance, responsive-layout, motion, and safe interaction probes during targeted follow-up
- Tags each follow-up result to the exact bucket and question so unrelated captures cannot be used as evidence
- Returns follow-up evidence to the same audit so only affected buckets are reviewed again

## Install locally in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repo’s `chrome-extension` folder

## How to use

1. Open the product you want to audit
2. Open the extension popup
3. Click **Run visible audit** to let the extension inspect same-domain pages in front of you
4. Watch the on-page panel, or pause and stop the runner at any time
5. If you prefer manual capture while moving through the product:
   - open **Settings**
   - enable **Auto-capture when the audited tab finishes navigation**
   - keep **Record journey** enabled in the popup
6. Click **Capture full page** on any additional important states
7. Open the audit form and click **Send to audit form**

If the first AI review still has unsupported questions, keep the report and audited website tabs open. Click **Run follow-up capture** on the report. The extension visibly checks the requested states and sends the new evidence back to that report automatically.

## Safety policy

- Navigation is restricted to the website origin where the audit started.
- Ordinary forms are submitted only after the user approves that specific submission.
- Forms containing passwords, payment fields, purchases, deletion, publishing, logout, or account changes are permanently blocked.
- Controls with destructive, payment, save, submit, send, confirmation, or logout labels are never activated.
- Only tabs, accordions, menus, summaries, and disclosure controls are eligible for safe interaction checks.
- The user can pause or stop the runner from the page overlay or extension popup.

## JSON shape

Each capture includes fields already supported by the app:

- `url`
- `title`
- `screenTypeLabel`
- `headings`
- `visibleText`
- `buttons`
- `links`
- `forms`
- `tables`
- `navigationLabels`
- `dropdownModalState`
- `domSummary`
- `screenshotUrl`

`screenshotUrl` is stored as a data URL by default so the app can immediately use it as evidence.
