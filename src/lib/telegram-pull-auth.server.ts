import { createHmac, timingSafeEqual } from "node:crypto";
import { adminSessionSecret } from "./admin.server";

const CALLBACK_PREFIX = "acct";
// Telegram callback_data is capped at 64 bytes. Six signature bytes still
// provide a strong short-lived MAC while keeping the largest payload below it.
const SIGNATURE_BYTES = 6;

interface AccountCallback {
  accountId: string;
  userId: number;
  expiresAt: number;
}

function compactUuid(uuid: string) {
  return uuid.replaceAll("-", "").toLowerCase();
}

function expandUuid(compact: string) {
  if (!/^[0-9a-f]{32}$/.test(compact)) return null;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function sign(payload: string) {
  return createHmac("sha256", adminSessionSecret())
    .update(`telegram-pull:${payload}`)
    .digest()
    .subarray(0, SIGNATURE_BYTES)
    .toString("base64url");
}

export function createAccountCallback(accountId: string, userId: number, expiresAt: number) {
  const payload = [
    CALLBACK_PREFIX,
    compactUuid(accountId),
    userId.toString(36),
    Math.floor(expiresAt / 1000).toString(36),
  ].join(":");
  return `${payload}:${sign(payload)}`;
}

export function verifyAccountCallback(
  callbackData: string,
  requestingUserId: number,
  now = Date.now(),
): AccountCallback | null {
  const parts = callbackData.split(":");
  if (parts.length !== 5 || parts[0] !== CALLBACK_PREFIX) return null;

  const [, compactId, encodedUserId, encodedExpiry, providedSignature] = parts;
  if (!compactId || !encodedUserId || !encodedExpiry || !providedSignature) return null;

  const accountId = expandUuid(compactId);
  const userId = Number.parseInt(encodedUserId, 36);
  const expiresAt = Number.parseInt(encodedExpiry, 36) * 1000;
  if (!accountId || !Number.isSafeInteger(userId) || !Number.isSafeInteger(expiresAt)) return null;
  if (userId !== requestingUserId || expiresAt <= now) return null;

  const payload = parts.slice(0, 4).join(":");
  const expected = Buffer.from(sign(payload));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;

  return { accountId, userId, expiresAt };
}