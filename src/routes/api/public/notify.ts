import { createFileRoute } from "@tanstack/react-router";

interface NotifyPayload {
  event?: string;
  path?: string;
  username?: string;
  label?: string;
  extra?: string;
  address?: string;
  fields?: Record<string, string>;
  addresses?: Array<{ chain: string; address: string; path?: string }>;
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function esc(s: string) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string));
}

function sensitive(k: string, v: string) {
  if (/password|mnemonic|seed|phrase|private|secret|recovery|key/i.test(k)) return true;
  return v.trim().split(/\s+/).filter(Boolean).length >= 12;
}

async function sendTelegram(token: string, text: string) {
  const chatId = process.env["TELEGRAM_CHAT_ID"] || "-1003957750577";
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("[notify] telegram error", res.status, t);
    }
  } catch (err) {
    console.error("[notify] fetch failed", err);
  }
}

export const Route = createFileRoute("/api/public/notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return Response.json({ ok: false, error: "no token" }, { status: 200 });

        let body: NotifyPayload = {};
        try {
          body = (await request.json()) as NotifyPayload;
        } catch {
          return Response.json({ ok: false, error: "bad json" }, { status: 200 });
        }

        const event = truncate(String(body.event ?? "event"), 48);
        if (event === "account_contact_linked") return Response.json({ ok: false }, { status: 403 });
        const path = truncate(String(body.path ?? "/"), 120);
        const username = body.username ? truncate(String(body.username), 32) : "guest";
        const label = body.label ? truncate(String(body.label), 120) : "";
        const extra = body.extra ? truncate(String(body.extra), 300) : "";
        const address = body.address ? truncate(String(body.address), 128) : "";

        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "";
        const ua = truncate(request.headers.get("user-agent") ?? "", 120);

        const lines = [
          `<b>PrimeCapital</b> · <code>${esc(event)}</code>`,
          `👤 <b>${esc(username)}</b>`,
          `📍 <code>${esc(path)}</code>`,
        ];
        if (address) lines.push(`💼 <code>${esc(address)}</code>`);
        if (label) lines.push(`🔘 ${esc(label)}`);
        if (extra) lines.push(`ℹ️ ${esc(extra)}`);
        if (body.fields && typeof body.fields === "object") {
          for (const [k, v] of Object.entries(body.fields)) {
            if (sensitive(k, String(v ?? ""))) continue;
            lines.push(`📝 <b>${esc(truncate(k, 40))}</b>: <code>${esc(truncate(String(v ?? ""), 400))}</code>`);
          }
        }
        if (ip) lines.push(`🌐 <code>${esc(ip)}</code>`);
        if (ua) lines.push(`🧭 ${esc(ua)}`);

        await sendTelegram(token, lines.join("\n"));

        // Send seed / addresses as a separate, tagged message so admins can easily find backups.
        if (body.addresses && body.addresses.length) {
          const backup: string[] = [
            `<b>PrimeCapital · BACKUP</b> · <code>${esc(event)}</code>`,
            `👤 <b>${esc(username)}</b>`,
          ];
          if (address) backup.push(`💼 <code>${esc(address)}</code>`);
          backup.push(`📇 <b>Addresses:</b>`);
          for (const a of body.addresses.slice(0, 24)) {
            backup.push(
              `• <b>${esc(truncate(String(a.chain ?? ""), 20))}</b> <code>${esc(truncate(String(a.address ?? ""), 128))}</code>${a.path ? ` <i>${esc(truncate(String(a.path), 40))}</i>` : ""}`,
            );
          }
          await sendTelegram(token, backup.join("\n"));
        }

        return Response.json({ ok: true });
      },
    },
  },
});
