// Server-only Telegram sender + the decorated alert formats.

const CHAT_ID = process.env["TELEGRAM_CHAT_ID"] || "-1003957750577";

export function esc(s: unknown) {
  return String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

export function truncate(s: unknown, n: number) {
  const v = String(s ?? "");
  return v.length > n ? v.slice(0, n) + "…" : v;
}

export async function sendTelegramMessage(text: string) {
  const token = process.env['TELEGRAM_BOT_TOKEN'];
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) console.error("[telegram] error", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[telegram] fetch failed", err);
    return false;
  }
}

/** Send the same message several times in a row (best effort, sequential). */
export async function sendTelegramRepeated(text: string, times: number) {
  for (let i = 0; i < Math.max(1, Math.min(10, times)); i++) {
    await sendTelegramMessage(text);
  }
}

const STAR_ROW = "⭐".repeat(34);
const CHECK_ROW = "✅".repeat(34);
const SUPPORT_ROW = "⭐✨💬⭐✨💬⭐✨💬⭐✨💬⭐✨💬⭐";

/** New support message from a user — heavily decorated. */
export function supportMessageText(opts: { username: string; address: string; body: string }) {
  return [
    SUPPORT_ROW,
    "🌟💬 <b>NEW SUPPORT MESSAGE</b> 💬🌟",
    SUPPORT_ROW,
    `👤 <b>${esc(truncate(opts.username || "guest", 40))}</b>`,
    `💼 <code>${esc(truncate(opts.address, 128))}</code>`,
    "✉️ <b>Message:</b>",
    `<blockquote>${esc(truncate(opts.body, 1200))}</blockquote>`,
    SUPPORT_ROW,
    "⭐🎉 <b>REPLY IN THE SUPPORT INBOX</b> 🎉⭐",
    SUPPORT_ROW,
  ].join("\n");
}

export interface FundingAlert {
  username: string;
  address: string;
  chain: string;
  symbol: string;
  amount: string;
  usd?: string;
  hash?: string;
  url?: string;
}

export function fundingText(kind: "in" | "out", a: FundingAlert) {
  const head = kind === "in" ? "💰🎉 <b>WALLET FUNDED</b> 🎉💰" : "📤🚀 <b>CRYPTO SENT OUT</b> 🚀📤";
  const lines = [
    head,
    `👤 <b>${esc(truncate(a.username || "guest", 40))}</b>`,
    `💼 <code>${esc(truncate(a.address, 128))}</code>`,
    `⛓️ <b>${esc(truncate(a.chain, 12))}</b>`,
    `${kind === "in" ? "⬇️" : "⬆️"} <b>${esc(truncate(a.amount, 40))} ${esc(truncate(a.symbol, 12))}</b>`,
  ];
  if (a.usd) lines.push(`💵 <b>${esc(truncate(a.usd, 40))}</b>`);
  if (a.hash) lines.push(`🔗 <code>${esc(truncate(a.hash, 96))}</code>`);
  if (a.url) lines.push(`🌐 ${esc(truncate(a.url, 200))}`);
  return lines.join("\n");
}

export function fundingBannerText(kind: "in" | "out", a: FundingAlert) {
  const row = kind === "in" ? STAR_ROW : CHECK_ROW;
  return [
    row,
    row,
    kind === "in"
      ? "🌟🌟 <b>REAL FUNDS RECEIVED</b> 🌟🌟"
      : "✅✅ <b>FUNDS SENT OUT</b> ✅✅",
    `👤 <b>${esc(truncate(a.username || "guest", 40))}</b> · ⛓️ <b>${esc(truncate(a.chain, 12))}</b>`,
    `💎 <b>${esc(truncate(a.amount, 40))} ${esc(truncate(a.symbol, 12))}</b>`,
    row,
    row,
  ].join("\n");
}
