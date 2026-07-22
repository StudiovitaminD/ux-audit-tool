function getStringFromRecord(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
      continue;
    }
    if (value instanceof Error) {
      const message = value.message.trim();
      if (message) return message;
    }
    if (typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const nestedMessage = getStringFromRecord(nested, ["message", "error", "details", "reason"]);
      if (nestedMessage) return nestedMessage;
    }
  }
  return null;
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    const trimmed = error.trim();
    if (trimmed) return trimmed;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message;
    if (error.name) return error.name;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    const directMessage = getStringFromRecord(record, [
      "message",
      "error",
      "details",
      "detail",
      "reason",
      "statusText",
    ]);
    if (directMessage) return directMessage;

    if (Array.isArray(record.issues)) {
      const issues = record.issues
        .map((issue) => {
          if (typeof issue === "string") return issue.trim();
          if (issue && typeof issue === "object") {
            const issueRecord = issue as Record<string, unknown>;
            const issueMessage = getStringFromRecord(issueRecord, ["message", "error", "details", "reason"]);
            if (issueMessage) return issueMessage;
            if (typeof issueRecord.path === "object" && issueRecord.path) {
              const path = Array.isArray(issueRecord.path)
                ? issueRecord.path.join(".")
                : String(issueRecord.path);
              return `Validation failed at ${path}`;
            }
          }
          return null;
        })
        .filter((item): item is string => Boolean(item));
      if (issues.length > 0) return issues.join("; ");
    }

    if (typeof record.cause === "string") {
      const causeMessage = record.cause.trim();
      if (causeMessage) return causeMessage;
    }

    if (typeof record.cause === "object" && record.cause) {
      const causeMessage = getErrorMessage(record.cause);
      if (causeMessage && causeMessage !== "Something went wrong.") return causeMessage;
    }

    if (typeof record.data === "object" && record.data) {
      const dataMessage = getErrorMessage(record.data);
      if (dataMessage && dataMessage !== "Something went wrong.") return dataMessage;
    }

    try {
      const json = JSON.stringify(error);
      if (json && json !== "{}") return json;
    } catch {
      // Ignore JSON serialization failures and fall back below.
    }
  }

  if (error && typeof error === "object" && "status" in (error as Record<string, unknown>)) {
    return "Request failed";
  }

  return "Something went wrong.";
}
