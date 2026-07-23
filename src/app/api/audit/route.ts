import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { IntakeSchema } from "@/lib/audit-engine";
import { canCreateReport, canAccessProductType } from "@/lib/access-control";
import {
  getAccountSessionFromRequest,
  incrementServerSideReportUsage,
} from "@/lib/account-server";
import {
  buildStoredIntakePreview,
  findLargestObjectKeys,
} from "@/lib/intake-storage";
import { storeFullIntakeBlob } from "@/lib/intake-storage.server";

export const runtime = "nodejs";
// ADDED: allow longer serverless execution on Vercel (plan-dependent)
export const maxDuration = 300;

function stripInlineAssets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripInlineAssets);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && /^data:(image|video|application)\//i.test(value)) {
      return "";
    }
    return value;
  }

  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(rec)) {
    if (
      (key === "dataUrl" || key === "data_url" || key === "image") &&
      typeof child === "string" &&
      /^data:(image|video|application)\//i.test(child)
    ) {
      continue;
    }
    out[key] = stripInlineAssets(child);
  }
  return out;
}

function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map(removeUndefinedDeep)
      .filter((item) => item !== undefined);
  }
  if (!value || typeof value !== "object") return value;

  const rec = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(rec)) {
    const cleaned = removeUndefinedDeep(child);
    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }
  return out;
}

function stripNonPersistentIntakeFields(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const rec = { ...(value as Record<string, unknown>) };

  delete rec.selected_bucket_questions;
  delete rec.question_bank_version;
  delete rec.reportId;

  return rec;
}

function toPlainJsonDeep(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => toPlainJsonDeep(item));
  }

  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(rec)) {
      out[key] = toPlainJsonDeep(child);
    }
    return out;
  }

  return String(value);
}

function collectFirestoreSuspiciousPaths(
  value: unknown,
  path = "intake",
  parentIsArray = false,
  acc: string[] = [],
): string[] {
  if (value === undefined) {
    acc.push(`${path} (undefined)`);
    return acc;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    acc.push(`${path} (non-finite number)`);
    return acc;
  }

  if (typeof value === "function" || typeof value === "symbol") {
    acc.push(`${path} (${typeof value})`);
    return acc;
  }

  if (Array.isArray(value)) {
    if (parentIsArray) {
      acc.push(`${path} (nested array)`);
    }
    value.forEach((item, index) => {
      collectFirestoreSuspiciousPaths(item, `${path}[${index}]`, true, acc);
    });
    return acc;
  }

  if (!value || typeof value !== "object") return acc;

  const proto = Object.getPrototypeOf(value);
  if (proto && proto !== Object.prototype && proto !== null && !(value instanceof Date)) {
    acc.push(`${path} (non-plain object: ${proto.constructor?.name || "unknown"})`);
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectFirestoreSuspiciousPaths(child, `${path}.${key}`, false, acc);
  }

  return acc;
}

export async function POST(req: Request) {
  try {
    const accountSession = await getAccountSessionFromRequest(req);
    if (!accountSession) {
      return NextResponse.json(
        { error: "Please sign in or sign up before creating an audit." },
        { status: 401 },
      );
    }
    const raw = await req.json();
    const cleaned = removeUndefinedDeep(
      stripNonPersistentIntakeFields(stripInlineAssets(IntakeSchema.parse(raw))),
    );
    const body = toPlainJsonDeep(cleaned);
    const bodyRecord = body as Record<string, unknown>;
    const userAccess =
      bodyRecord && typeof bodyRecord.user_access === "object"
        ? (bodyRecord.user_access as Record<string, unknown>)
        : {};
    const resolvedProductType =
      typeof bodyRecord.product_type === "string" ? bodyRecord.product_type : "";

    if (!canAccessProductType(accountSession.role, resolvedProductType)) {
      return NextResponse.json(
        { error: "Your current plan does not have access to this audit type." },
        { status: 403 },
      );
    }

    const usageGate = canCreateReport({
      role: accountSession.role,
      reportsUsed: accountSession.reportsUsed,
      reportLimit: accountSession.reportLimit,
    });
      if (!usageGate.allowed) {
        return NextResponse.json(
        { error: `This plan includes ${accountSession.reportLimit} reports. Upgrade to unlock more audits.` },
        { status: 403 },
      );
    }

    const db = getAdminFirestore();
    const ref = db.collection("ux_audits").doc();
    const createdAt = new Date().toISOString();
    const intakePreview =
      body && typeof body === "object"
        ? buildStoredIntakePreview(body as Record<string, unknown>, {
            submittedAt: createdAt,
            auditId: ref.id,
          })
        : {};
    const serializedIntake = JSON.stringify(body);
    const serializedIntakeBytes = Buffer.byteLength(serializedIntake, "utf8");
    const previewBytes = Buffer.byteLength(JSON.stringify(intakePreview), "utf8");
    const largestKeys = findLargestObjectKeys(body).slice(0, 10);

    try {
      const storageResult = await storeFullIntakeBlob(ref.id, body as Record<string, unknown>);
      if (!storageResult.ok) {
        return Response.json(
          {
            error: "Failed to persist audit intake",
            debug: {
              serializedIntakeBytes,
              previewBytes,
              largestKeys,
              storageStrategy: storageResult.storageStrategy,
              blobUploadSucceeded: false,
              blobUploadError: storageResult.error || storageResult.storageError || "Unknown storage error",
              suspiciousPaths: collectFirestoreSuspiciousPaths(body).slice(0, 20),
              topLevelKeys:
                body && typeof body === "object" ? Object.keys(body as Record<string, unknown>) : [],
            },
          },
          { status: 400 },
        );
      }

      await ref.set({
        createdAt,
        status: "queued",
        intake_preview: intakePreview,
        intake_blob: storageResult.blob,
        intake_size_bytes: storageResult.bytes,
        audit_id: ref.id,
        created_by:
          accountSession?.id || (typeof userAccess.user_id === "string" ? userAccess.user_id : ""),
        user_email:
          accountSession?.email ||
          (typeof userAccess.user_email === "string" ? userAccess.user_email : ""),
        user_role:
          accountSession?.role ||
          (typeof userAccess.user_role === "string" ? userAccess.user_role : "free"),
        plan_type:
          accountSession?.plan ||
          (typeof userAccess.plan_type === "string" ? userAccess.plan_type : "free"),
        report_access_level:
          accountSession?.reportAccessLevel ||
          (typeof userAccess.report_access_level === "string"
            ? userAccess.report_access_level
            : "free_preview"),
        locked_sections:
          accountSession?.lockedSections ||
          (Array.isArray(userAccess.locked_sections) ? userAccess.locked_sections : []),
        model_tier:
          accountSession?.modelTier ||
          (typeof userAccess.model_tier === "string" ? userAccess.model_tier : "free_limited"),
        free_report_usage:
          accountSession?.reportsUsed ||
          (typeof userAccess.reports_used === "number" ? userAccess.reports_used : 0),
        free_report_limit:
          accountSession?.reportLimit ||
          (typeof userAccess.report_limit === "number" ? userAccess.report_limit : 3),
        progress: {
          bucketIndex: 0,
        },
      });

      if (accountSession?.role !== "admin") {
        await incrementServerSideReportUsage(accountSession.id);
      }
    } catch (writeError) {
      const suspiciousPaths = collectFirestoreSuspiciousPaths(body).slice(0, 20);
      const message =
        writeError instanceof Error ? writeError.message : "Firestore write failed";
      return Response.json(
        {
          error: message,
          debug: {
            serializedIntakeBytes,
            previewBytes,
            largestKeys,
            storageStrategy: "firestore_document",
            blobUploadSucceeded: false,
            blobUploadError: message,
            suspiciousPaths,
            topLevelKeys:
              body && typeof body === "object" ? Object.keys(body as Record<string, unknown>) : [],
          },
        },
        { status: 400 },
      );
    }

    const processor = process.env.NEXT_PUBLIC_PROCESSOR || "next";

    // Backend-only mode: the report page will drive /api/audit/process directly.
    if (processor === "next") {
      return Response.json({ reportId: ref.id, status: "queued" });
    }

    // Optional n8n trigger mode.
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET;
    if (n8nUrl) {
      const payload = {
        ...(body as Record<string, unknown>),
        reportId: ref.id,
      };
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(n8nSecret ? { "x-audit-secret": n8nSecret } : {}),
      };

      const retryDelaysMs = [0, 800, 2000];
      let lastError: string | null = null;

      for (const delay of retryDelaysMs) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 12_000);
          const res = await fetch(n8nUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(t);

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            lastError = `n8n trigger failed (${res.status}): ${text || res.statusText}`;
            continue;
          }

          // record minimal success signal for debugging
          await ref.set(
            {
              n8n: {
                triggeredAt: new Date().toISOString(),
                url: n8nUrl,
              },
            },
            { merge: true },
          );

          lastError = null;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Unknown trigger error";
        }
      }

      if (lastError) {
        await ref.set(
          {
            status: "error",
            error: `Failed to trigger n8n webhook: ${lastError}`,
            n8n: { url: n8nUrl },
          },
          { merge: true },
        );
        return Response.json(
          { error: `Failed to trigger n8n webhook. Check N8N_WEBHOOK_URL and ngrok.` },
          { status: 502 },
        );
      }
    } else {
      await ref.set(
        { status: "error", error: "Missing N8N_WEBHOOK_URL env var." },
        { merge: true },
      );
      return Response.json(
        { error: "Missing N8N_WEBHOOK_URL env var." },
        { status: 500 },
      );
    }

    return Response.json({ reportId: ref.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    return Response.json({ error: message }, { status: 400 });
  }
}
