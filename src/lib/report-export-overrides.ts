const exportOverrides = new Map<string, unknown>();

export function storeReportExportOverride(report: unknown) {
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  exportOverrides.set(token, report);
  return token;
}

export function consumeReportExportOverride(token: string) {
  const report = exportOverrides.get(token);
  exportOverrides.delete(token);
  return report;
}
