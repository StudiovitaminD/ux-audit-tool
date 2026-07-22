## AI UX Audit Tool (Next.js + optional n8n)

Clean Next.js (App Router) frontend for submitting UX audit context and generating UX audit reports. By default, the backend processes audits directly; n8n is optional.

### Getting started

```bash
npm run dev
```

Open `http://localhost:3000`.

### Environment variables

- Copy `.env.local.example` → `.env.local`
- Set:
  - `OPENROUTER_API_KEY=...`
  - PDF is generated in-code (no PDFShift)
  - `FIREBASE_PROJECT_ID=...`
  - `FIREBASE_CLIENT_EMAIL=...`
  - `FIREBASE_PRIVATE_KEY=...` (replace `\n` newlines correctly)
  - `NEXT_PUBLIC_PROCESSOR=next` for backend-only processing
  - optionally configure `N8N_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET` only if you want n8n orchestration

### Pages

- `/` landing page
- `/audit` multi-section audit intake form
- `/report` report view (reads last webhook response from `sessionStorage`)

### API

The form submits to `POST /api/audit`, which creates the audit job in Firebase.

- In `NEXT_PUBLIC_PROCESSOR=next` mode, the report page drives `POST /api/audit/process` until the full report is complete.
- In `NEXT_PUBLIC_PROCESSOR=n8n` mode, `POST /api/audit` triggers your n8n webhook instead.

If your n8n workflow expects a different schema, update `src/lib/audit-types.ts` → `toWebhookPayload()`.
