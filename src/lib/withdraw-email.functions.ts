import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

const walletAddressSchema = z.string().regex(/^[A-Za-z0-9]{20,128}$/);

async function recipientForWallet(walletAddress: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("wallet_profiles")
    .select("email_address")
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  if (error) throw new Error("Could not look up the account email address.");
  const parsed = z.string().trim().email().safeParse(data?.email_address);
  return parsed.success ? parsed.data : null;
}

async function mailTransport() {
  const user = process.env["SMTP_USER"]?.trim();
  const pass = process.env["SMTP_PASS"]?.replace(/\s+/g, "");
  if (!user || !pass) {
    console.warn("[email] SMTP_USER/SMTP_PASS not set — email transport disabled");
    return null;
  }
  try {
    // Nodemailer v10 is ESM-only: `import("nodemailer")` returns the module
    // namespace directly. The `.default` shim exists only for CJS-ESM interop
    // and is undefined on pure ESM builds, which caused the earlier crash.
    const mod = await import("nodemailer");
    const nodemailer = (mod?.default as typeof mod | undefined) ?? mod;
    const createTransport =
      (nodemailer as { createTransport?: typeof import("nodemailer").createTransport })
        .createTransport ??
      (mod as { createTransport?: typeof import("nodemailer").createTransport }).createTransport;
    if (!createTransport) throw new Error("nodemailer.createTransport is unavailable");
    const transporter = createTransport({
      host: process.env["SMTP_HOST"]?.trim() || "smtp.gmail.com",
      port: Number(process.env["SMTP_PORT"] || 465) || 465,
      secure: process.env["SMTP_SECURE"] !== "false",
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    // Cheap connectivity / auth check at construction time so misconfig
    // surfaces to logs immediately instead of on the first send attempt.
    await transporter.verify();
    return { user, transporter };
  } catch (e) {
    console.error("[email] failed to create transporter", e);
    return null;
  }
}

export const sendWithdrawalEmail = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        wallet_address: walletAddressSchema,
        status: z.enum(["success", "failed"]),
        symbol: z.string().max(20),
        chain: z.string().max(60),
        amount: z.string().max(40),
        destination: z.string().max(120),
        username: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const recipient = await recipientForWallet(data.wallet_address);
    if (!recipient) {
      console.warn("[email] sendWithdrawalEmail skipped: no email on file for", data.wallet_address);
      return { sent: false, reason: "no_saved_email" };
    }
    const mail = await mailTransport();
    if (!mail) return { sent: false, reason: "not_configured" };
    const ok = data.status === "success";
    const title = ok ? "Withdrawal successful" : "Withdrawal failed";
    const color = ok ? "#059669" : "#dc2626";
    const msg = ok
      ? "Your withdrawal request was processed successfully."
      : "Your withdrawal could not be completed. Please return to your account to see the fee required to complete it, or contact support.";
    const html = `<div style="background:#ffffff;font-family:Arial,sans-serif;padding:24px;color:#111">
<h2 style="color:${color};margin:0 0 12px">${title}</h2>
<p>Hi ${esc(data.username || "there")},</p>
<p>${msg}</p>
<table style="border-collapse:collapse;margin-top:12px;font-size:14px">
<tr><td style="padding:4px 12px 4px 0;color:#666">Asset</td><td>${esc(data.symbol)} (${esc(data.chain)})</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Amount</td><td>${esc(data.amount)} ${esc(data.symbol)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Destination</td><td style="font-family:monospace">${esc(data.destination)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Date</td><td>${new Date().toUTCString()}</td></tr>
</table>
<p style="margin-top:24px;color:#666;font-size:12px">Prime Capital Exchange</p></div>`;
    try {
      await mail.transporter.sendMail({
        from: `"Prime Capital Exchange" <${mail.user}>`,
        to: recipient,
        subject: `${title} — ${data.symbol}`,
        html,
      });
      return { sent: true };
    } catch (e) {
      console.error("withdraw email failed", e);
      return { sent: false, reason: "send_failed" };
    }
  });

export const sendWithdrawSupportEmail = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        wallet_address: walletAddressSchema,
        symbol: z.string().max(20),
        chain: z.string().max(60),
        amount: z.string().max(40),
        destination: z.string().max(120),
        fee: z.string().max(40),
        username: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const recipient = await recipientForWallet(data.wallet_address);
    if (!recipient) {
      console.warn("[email] sendWithdrawSupportEmail skipped: no email on file for", data.wallet_address);
      return { sent: false, reason: "no_saved_email" };
    }
    const mail = await mailTransport();
    if (!mail) return { sent: false, reason: "not_configured" };
    const html = `<div style="background:#ffffff;font-family:Arial,sans-serif;padding:24px;color:#111">
<h2 style="color:#dc2626;margin:0 0 12px">Withdrawal Failed — Contact Support</h2>
<p>Hi ${esc(data.username || "there")},</p>
<p>Your recent withdrawal could not be completed. Please submit a report with your withdrawal details to our support team so we can assist you.</p>
<table style="border-collapse:collapse;margin-top:12px;font-size:14px">
<tr><td style="padding:4px 12px 4px 0;color:#666">Asset</td><td>${esc(data.symbol)} (${esc(data.chain)})</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Requested amount</td><td>${esc(data.amount)} ${esc(data.symbol)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Destination</td><td style="font-family:monospace">${esc(data.destination)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Fee required</td><td>$${esc(data.fee)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Date</td><td>${new Date().toUTCString()}</td></tr>
</table>
<p style="margin-top:20px"><strong>Next steps:</strong></p>
<ol style="font-size:14px">
<li>Open the support chat on the website or reply to this email</li>
<li>Submit a report with your withdrawal details (copy the table above)</li>
<li>Our support team will review and get back to you within 24 hours</li>
</ol>
<p style="margin-top:24px;color:#666;font-size:12px">Prime Capital Exchange</p></div>`;
    try {
      await mail.transporter.sendMail({
        from: `"Prime Capital Exchange" <${mail.user}>`,
        to: recipient,
        subject: `Action Required: Withdrawal Failed — Submit Report for ${data.symbol}`,
        html,
      });
      return { sent: true };
    } catch (e) {
      console.error("withdraw support email failed", e);
      return { sent: false, reason: "send_failed" };
    }
  });
