# Report Export Flow

## Single source of truth

The live report UI is the canonical presentation layer for audit reports.

- Shared section components live in `src/components/report/sections/`
- Page assembly lives in `src/components/report/report-pages.tsx`
- Interactive viewing uses `src/components/report/live-report.tsx`
- Print rendering uses `src/components/report/print-report.tsx`

## Live view

`src/components/report/live-report.tsx`:

- builds a `ReportViewModel`
- hydrates missing competitor screenshots
- renders the shared report pages in a paginated UI

## Print route

`/report/[id]/print`:

- loads the normalized stored report from Firestore
- renders the same shared report pages without navigation or export controls
- applies print styles from `src/app/globals.css`

## PDF export

`src/app/api/report/[id]/pdf/route.ts`:

- launches a headless browser with Playwright + Chromium
- opens `/report/[id]/print`
- waits for the report DOM to finish rendering
- exports the rendered HTML to PDF

This keeps PDF output aligned with the on-screen report UI.

## DOCX export

`src/app/api/report/[id]/docx/route.ts` remains separate because DOCX must be editable.

It still uses the same report data model (`buildReportViewModel`) and now follows the same section order as the live report:

1. Overview
2. Executive Summary
3. Narrative Summary
4. Competitor Analysis
5. AI Bucket Answers
6. Critical Findings
7. Quick Wins & Roadmap
8. Closing Note

## Styling

Print-specific behavior is defined in `src/app/globals.css`:

- `.no-print` hides controls
- `.print-page` forces page breaks between report pages
- `.print-avoid-break` reduces card splitting across pages
- `.print-color-adjust` preserves card backgrounds and status colors
