type CaptureRecord = Record<string, unknown>;

function parseStoredCaptures(value: string) {
  if (!value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item): item is CaptureRecord => Boolean(item) && typeof item === "object");
    if (parsed && typeof parsed === "object") return [parsed as CaptureRecord];
  } catch {}
  return [];
}

function captureKey(capture: CaptureRecord) {
  return [capture.url, capture.viewport, capture.capturedAt, capture.captureReason]
    .map((value) => String(value || ""))
    .join("|");
}

export function mergeExtensionCaptureJson(currentJson: string, incoming: unknown[]) {
  const captures = [...parseStoredCaptures(currentJson)];
  const known = new Set(captures.map(captureKey));

  for (const value of incoming) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const capture = { ...(value as CaptureRecord) };
    // Screenshots are uploaded separately to avoid storing large data URLs in
    // the intake document. All deterministic measurements remain intact.
    delete capture.screenshotUrl;
    const key = captureKey(capture);
    if (known.has(key)) continue;
    known.add(key);
    captures.push(capture);
  }

  return JSON.stringify(captures);
}
