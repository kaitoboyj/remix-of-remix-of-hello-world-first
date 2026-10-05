#!/usr/bin/env node
// Runs after Netlify build. Registers the Telegram webhook to point at this
// deploy's URL. Safe to run locally (no-op without required env vars).

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("[telegram-webhook] TELEGRAM_BOT_TOKEN not set — skipping.");
  process.exit(0);
}

const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) {
  console.error("[telegram-webhook] TELEGRAM_WEBHOOK_SECRET not set — webhook cannot be registered securely.");
  process.exit(0);
}

// Netlify sets URL to the site's production URL and DEPLOY_PRIME_URL to the
// current deploy (branch/PR previews). Prefer the site's canonical URL.
const siteUrl =
  process.env.TELEGRAM_WEBHOOK_URL ||
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  process.env.DEPLOY_URL;

if (!siteUrl) {
  console.log("[telegram-webhook] no site URL env var found — skipping.");
  process.exit(0);
}

const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/public/telegram/webhook`;
const body = {
  url: webhookUrl,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: false,
};
body.secret_token = secret;

try {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[telegram-webhook] setWebhook failed ${res.status}: ${text}`);
    // Do not fail the build over this.
    process.exit(0);
  }
  console.log(`[telegram-webhook] registered → ${webhookUrl}`);
  console.log(`[telegram-webhook] telegram response: ${text}`);
} catch (err) {
  console.error("[telegram-webhook] error:", err?.message || err);
  process.exit(0);
}
