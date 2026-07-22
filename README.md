# UX Audit Tool

AI-assisted UX audit platform for marketing websites and ecommerce products, built with Next.js 14.

It collects public-page evidence, uploaded screenshots, browser-extension JSON captures, and optional guided/browser evidence, then generates:

- bucket-by-bucket audit answers
- scorecards and pillar scores
- executive summary, narrative summary, findings, roadmap
- exportable `PDF`, `DOCX`, and `PPTX` reports

## What the app does

- Runs structured UX audits across multiple audit buckets
- Supports public website audits without requiring login flows
- Lets reviewers edit AI answers before exporting the final report
- Supports gated/free vs paid audit experiences
- Stores audit/report data through server-side APIs and Firebase-backed flows

## Core product areas

- `/` — landing page
- `/audit` — multi-step intake and audit launch flow
- `/report` — live/generated report experience
- `/pricing` — pricing page
- `/sign-in` — sign-in page
- `/sign-up` — sign-up page

## Tech stack

- `Next.js 14` App Router
- `React 18`
- `TypeScript`
- `Tailwind CSS`
- `Firebase Admin`
- `OpenRouter` model routing
- `PptxGenJS` for PowerPoint export
- `@react-pdf/renderer` for PDF workflows
- `playwright-core` for browser-backed evidence paths

## Model routing

Current tier-based model setup:

- **Free users** → `nvidia/nemotron-3-super-120b-a12b:free`
- **Paid users** → `openai/gpt-4.1-mini`

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create local env files

Use your local environment files and set the keys your deployment mode needs.

Common variables used in this project include:

```bash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_FALLBACK_MODEL=
OPENROUTER_MAX_TOKENS=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

NEXT_PUBLIC_PROCESSOR=
WORKER_URL=
WORKER_SECRET=
N8N_WEBHOOK_URL=
N8N_WEBHOOK_SECRET=
```

There is also a worker example file at:

- `worker/.env.example`

### 3. Run the app

```bash
npm run dev
```

Open:

- [http://localhost:3000](http://localhost:3000)

## Build

```bash
npm run build
```

## Related docs

- `docs/report-export-flow.md` — how report rendering stays aligned across live, print, PDF, DOCX, and PPTX flows
- `chrome-extension/README.md` — browser extension capture setup and usage

## Main APIs

- `POST /api/audit`
- `POST /api/audit/process`
- `POST /api/audit/callback`
- `GET /api/report/[id]`
- `GET /api/report/[id]/pdf`
- `GET /api/report/[id]/docx`
- `GET /api/report/[id]/pptx`
- `POST /api/account/session`

## Important folders

- `src/app` — app routes and API routes
- `src/components/audit` — audit intake UI
- `src/components/report` — multi-page report UI
- `src/lib` — audit engine, evidence collection, report shaping, access control
- `chrome-extension` — browser extension capture workflow
- `worker` — worker-side config/examples

## Notes

- SaaS audit support is still evolving and may be admin/internal only depending on deployment configuration.
- Public website and ecommerce audits are designed to work directly from captured evidence, even without browser-session login flows.
- Export output should match the current report state, including user-edited answers.

## Repo status

This repository contains an active product build, not a starter template. Expect ongoing iteration in:

- audit evidence collection
- scoring and report synthesis
- report export fidelity
- gated access and pricing flows
