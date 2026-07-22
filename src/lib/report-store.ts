const KEY = "ux_audit:last_report";

export function saveLastReport(report: unknown) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(report));
  } catch {
    // ignore (storage may be unavailable)
  }
}

export function loadLastReport<T = unknown>(): T | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearLastReport() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
