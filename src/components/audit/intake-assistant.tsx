"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import type { AuditPayload } from "@/lib/audit-types";

function deepMerge<T>(base: T, patch: unknown): T {
  if (!patch || typeof patch !== "object") return base;
  if (!base || typeof base !== "object") return patch as T;
  if (Array.isArray(base)) return patch as T;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    const bv = (out as Record<string, unknown>)[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      bv &&
      typeof bv === "object" &&
      !Array.isArray(bv)
    ) {
      (out as Record<string, unknown>)[k] = deepMerge(bv, v);
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out as T;
}

export function IntakeAssistant({
  payload,
  setPayload,
  placement = "fixed",
}: {
  payload: AuditPayload;
  setPayload: React.Dispatch<React.SetStateAction<AuditPayload>>;
  placement?: "fixed" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const transcript = payload.artifacts.notes || "";
  const canExtract = transcript.trim().length > 0 && !busy;
  const hasTranscript = transcript.trim().length > 0 || Boolean(fileName);
  const triggerLabel = hasTranscript ? "View meeting transcript" : "Upload meeting transcript";

  const helperText = useMemo(
    () =>
      "Upload a meeting transcript (.txt) or paste it here, then click “Fill form from transcript”.",
    [],
  );

  async function extractFromTranscript() {
    if (!transcript.trim()) {
      setError("Paste or upload a transcript first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/intake/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, current: payload }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as Record<string, unknown>).error)
            : "Transcript extraction failed.";
        throw new Error(msg);
      }
      const patch =
        data && typeof data === "object" && "patch" in data
          ? (data as Record<string, unknown>).patch
          : null;
      setPayload((p) => deepMerge(p, patch));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        className={
          placement === "fixed"
            ? "fixed bottom-5 right-5 z-[9999]"
            : "mt-6 flex justify-start"
        }
      >
        <Button
          type="button"
          className={
            placement === "fixed"
              ? "inline-flex items-center gap-3 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-xl hover:opacity-95"
              : "inline-flex w-full max-w-sm items-center justify-center gap-3 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 px-5 py-4 text-sm font-semibold text-white shadow-lg hover:opacity-95 sm:w-auto"
          }
          onClick={() => setOpen(true)}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 16V4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M8 8l4-4 4 4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 20h16"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span className="whitespace-nowrap">{triggerLabel}</span>
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[9999]">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-1/2 top-1/2 w-[min(920px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/90 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4">
              <div className="text-sm font-semibold">Transcript intake</div>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="text-xs text-white/75">{helperText}</div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
                  <input
                    type="file"
                    accept=".txt,.md,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const text = await f.text();
                      setFileName(f.name);
                      setPayload((p) => ({
                        ...p,
                        artifacts: { ...p.artifacts, notes: text },
                      }));
                    }}
                  />
                  Upload transcript
                </label>
                {fileName ? (
                      <div className="text-xs text-white/65">Loaded: {fileName}</div>
                ) : null}
              </div>

              <Textarea
                value={transcript}
                onChange={(e) =>
                  setPayload((p) => ({
                    ...p,
                    artifacts: { ...p.artifacts, notes: e.target.value },
                  }))
                }
                placeholder="Paste transcript here…"
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canExtract}
                  onClick={extractFromTranscript}
                >
                  {busy ? "Working…" : "Fill form from transcript"}
                </Button>
              </div>

              {error ? <div className="text-xs text-red-300">{error}</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
