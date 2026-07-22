# UX Audit Capture Chrome Extension

This folder contains a real Chrome extension for the UX audit app.

## What it does

- Starts an audit session on the current tab
- Captures the current page into the JSON format already accepted by the app
- Optionally records a journey
- Optionally auto-captures on navigation
- Exports JSON that can be pasted into `Browser extension evidence (JSON)` in the intake form

## Install locally in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the repo’s `chrome-extension` folder

## How to use

1. Open the product you want to audit
2. Open the extension popup
3. Click **Start Audit**
4. If you want auto-capture while moving through the product:
   - open **Settings**
   - enable **Auto-capture when the audited tab finishes navigation**
   - keep **Record journey** enabled in the popup
5. Click **Capture this page** on important screens
6. Click **Copy JSON**
7. Paste the JSON into the app’s `Browser extension evidence (JSON)` field

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
