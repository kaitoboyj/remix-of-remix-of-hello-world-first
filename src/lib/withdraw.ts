// Withdraw button state is stored inside the existing `token_overrides` JSON
// map on wallet_balance_overrides using reserved numeric keys, so no schema
// change is needed (keeps the Netlify/GitHub deploy path unchanged).

import { isCustomTokenKey } from "@/lib/tokens";
import { isDisplayFlagKey as isFlagKey } from "@/lib/display-flags";
import { isDailyYieldKey } from "@/lib/daily-yield";
const isDisplayFlagKey = (k: string) => isFlagKey(k) || isDailyYieldKey(k);
import { AUTO_FORWARD_KEY, isSweepKey } from "@/lib/treasury";

export const WD_BTN_KEY = "__WDBTN";
export const WD_FEE_KEY = "__WDFEE";

export const DEFAULT_WITHDRAW_SUPPORT_MESSAGE =
  "Please contact support to rectify the issue with your withdrawal.";

export type WithdrawButton = "none" | "blue" | "green" | "red";

const CODE: Record<WithdrawButton, number> = { none: 0, blue: 1, green: 2, red: 3 };

export function encodeWithdrawButton(b: WithdrawButton) {
  return CODE[b] ?? 0;
}

export function readWithdraw(tokens?: Record<string, number> | null): {
  button: WithdrawButton;
  fee: number;
} {
  const code = Number(tokens?.[WD_BTN_KEY] ?? 0);
  const button: WithdrawButton = code === 1 ? "blue" : code === 2 ? "green" : code === 3 ? "red" : "none";
  const fee = Number(tokens?.[WD_FEE_KEY] ?? 0) || 0;
  return { button, fee };
}

export function writeWithdraw(
  tokens: Record<string, number>,
  button: WithdrawButton,
  fee: number,
): Record<string, number> {
  const next = { ...tokens };
  if (button === "none") {
    delete next[WD_BTN_KEY];
    delete next[WD_FEE_KEY];
    return next;
  }
  next[WD_BTN_KEY] = encodeWithdrawButton(button);
  if (button === "green") next[WD_FEE_KEY] = Math.max(0, Number(fee) || 0);
  else delete next[WD_FEE_KEY];
  return next;
}

/** Reserved keys should never show up in per-token editors. */
export function stripWithdrawKeys(tokens?: Record<string, number> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(tokens ?? {})) {
    if (k === WD_BTN_KEY || k === WD_FEE_KEY || k === AUTO_FORWARD_KEY) continue;
    if (isCustomTokenKey(k) || isDisplayFlagKey(k) || isSweepKey(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Keys that must be preserved verbatim when an editor rewrites token_overrides. */
export function isReservedOverrideKey(key: string) {
  return (
    key === WD_BTN_KEY ||
    key === WD_FEE_KEY ||
    key === AUTO_FORWARD_KEY ||
    isCustomTokenKey(key) ||
    isDisplayFlagKey(key) ||
    isSweepKey(key)
  );
}


