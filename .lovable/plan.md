# Fix Telegram /pull after the password is entered

## What is going wrong
After the right password, the bot builds the account list from four places: profiles, login history, balance settings and saved phrases. If any one of them fails (a missing column such as `created_at` on balance settings, or phone/email columns not added yet), the whole reply fails. The bot then says "temporarily unavailable" or says nothing. The phrase scan also checks about 15 tables on every unlock, which can run past Netlify's time limit. The exact cause hasn't been confirmed against your live site yet. Step 1 confirms it.

## Changes
1. **Show the real reason.** Right after the password check, the bot posts a short status in the group: either "Password accepted, loading accounts…" or the actual error, such as "missing setting SUPABASE_SERVICE_ROLE_KEY" or "column X missing". Silent failures become visible.
2. **Load from optional places safely.** Only profiles are required. If login history, balance settings or phrases fail to load, the bot skips that source and keeps going. Sorting by `created_at` is dropped wherever that column may not exist.
3. **Make the phrase scan faster.** It runs only when the other sources return no accounts. It has a short time limit, so it can never block the reply.
4. **Make account details safe to open.** Tapping a username works even if the phone or email columns don't exist yet. It falls back to the username and wallet address.
5. **Accept the password reliably.** Any text reply to the bot's password prompt counts, including edited messages and replies with the bot's @name. Spaces around the password are ignored. The wrong-password message also says if the site has no ADMIN_PASSWORD set.
6. Keep everything else the same. Only the configured group can use /pull. The password message is deleted. Account buttons are signed and expire after 10 minutes. Phrases and private keys are never shown in Telegram.

## What you need to do afterwards
- Push to GitHub and wait for Netlify to redeploy. Then send /pull and enter the password.
- If the bot reports a missing setting, add it in Netlify and choose "Clear cache and deploy site".

## Technical details
- `src/routes/api/public/telegram/webhook.ts`:
  - Wrap each source query on its own with `Promise.allSettled`, and require only `wallet_profiles`.
  - Drop `.order("created_at")` on overrides and logins, and sort in memory when the field exists.
  - In `getAccount`, select `*` and read phone/email only if they're present.
  - Send the status message before `listAccounts`, then edit it with the result or the error text.
  - Gate `loadPhrases` behind "no rows found" plus a 3s timeout (`Promise.race`).
- No database or SQL changes.
