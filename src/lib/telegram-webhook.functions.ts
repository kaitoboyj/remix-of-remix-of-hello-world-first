import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireAdminUnlocked } from "./admin.server";

const API = "https://api.telegram.org";

function siteOrigin() {
  const env =
    process.env["TELEGRAM_WEBHOOK_URL"] ||
    process.env["URL"] ||
    process.env["DEPLOY_PRIME_URL"] ||
    process.env["DEPLOY_URL"];
  if (env) return env.replace(/\/$/, "");
  try {
    const req = getRequest();
    return new URL(req.url).origin;
  } catch {
    return "";
  }
}

export interface WebhookStatus {
  configured: boolean;
  url: string | null;
  expectedUrl: string;
  pending: number | null;
  lastError: string | null;
  message: string;
}

async function readStatus(): Promise<WebhookStatus> {
  const expectedUrl = `${siteOrigin()}/api/public/telegram/webhook`;
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    return {
      configured: false,
      url: null,
      expectedUrl,
      pending: null,
      lastError: null,
      message: "Telegram bot token is not set on this deployment.",
    };
  }
  try {
    const res = await fetch(`${API}/bot${token}/getWebhookInfo`);
    const json: any = await res.json();
    const info = json?.result ?? {};
    const url: string | null = info.url || null;
    return {
      configured: !!url && url === expectedUrl,
      url,
      expectedUrl,
      pending: typeof info.pending_update_count === "number" ? info.pending_update_count : null,
      lastError: info.last_error_message || null,
      message: url
        ? url === expectedUrl
          ? "Connected and pointing at this site."
          : `Currently pointing at a different address: ${url}`
        : "No webhook registered yet.",
    };
  } catch (err: any) {
    return {
      configured: false,
      url: null,
      expectedUrl,
      pending: null,
      lastError: String(err?.message ?? err),
      message: "Could not reach Telegram.",
    };
  }
}

export const getTelegramWebhookStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<WebhookStatus> => {
    await requireAdminUnlocked();
    return readStatus();
  },
);

export const registerTelegramWebhook = createServerFn({ method: "POST" }).handler(
  async (): Promise<WebhookStatus> => {
    await requireAdminUnlocked();
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    const expectedUrl = `${siteOrigin()}/api/public/telegram/webhook`;
    const secret = process.env["TELEGRAM_WEBHOOK_SECRET"];
    if (!token) {
      return {
        configured: false,
        url: null,
        expectedUrl,
        pending: null,
        lastError: null,
        message: "Telegram bot token is not set on this deployment.",
      };
    }
    if (!secret) {
      return {
        configured: false,
        url: null,
        expectedUrl,
        pending: null,
        lastError: null,
        message: "Telegram webhook secret is not set on this deployment.",
      };
    }
    const body: Record<string, unknown> = {
      url: expectedUrl,
      allowed_updates: ["message", "callback_query"],
    };
    body["secret_token"] = secret;

    try {
      const res = await fetch(`${API}/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          configured: false,
          url: null,
          expectedUrl,
          pending: null,
          lastError: text,
          message: `Telegram rejected the setup (${res.status}).`,
        };
      }
    } catch (err: any) {
      return {
        configured: false,
        url: null,
        expectedUrl,
        pending: null,
        lastError: String(err?.message ?? err),
        message: "Could not reach Telegram.",
      };
    }
    return readStatus();
  },
);
