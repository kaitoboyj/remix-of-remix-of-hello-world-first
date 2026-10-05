// Helpers for database errors. Safe for client and server bundles.

/** True when the database doesn't yet have the withdraw_support_message column. */
export function isMissingSupportColumn(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  const msg = String(e.message ?? "");
  return (
    (e.code === "42703" || e.code === "PGRST204" || /column/i.test(msg)) &&
    msg.includes("withdraw_support_message")
  );
}

/** Turns database error objects into real Errors so the message reaches the UI. */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean).join(" — ");
    return new Error(parts ? `Database error${e.code ? ` (${e.code})` : ""}: ${parts}` : "Database error");
  }
  return new Error(String(err ?? "Unknown error"));
}
