# Fix withdraw buttons, balance badges, and admin wallet list

## Likely cause (to confirm first)

The last update added a new per-wallet setting (the red-mode support message). Every Admin and Mix Man read and save now asks the database for it: loading wallets, loading one wallet, saving green/blue/red buttons, and saving balance badges. If the database hasn't been updated with that setting yet, each of those requests fails. That would explain all four problems at once. Step 1 is to confirm this from the live error.

## Fix

1. **Show the real error.** Admin and Mix Man will show the actual database error message instead of a plain "Failed", so any remaining setup problem is obvious.
2. **Keep working on an older database.** If the support message setting doesn't exist yet, loading and saving will try again without it. Then:
   - Admin loads the wallet list again.
   - Green, blue, red and Hide save again. Only the custom red message waits until the database is updated, and the panel will say so.
   - Balance card badges save again.
3. **Green button.** It still needs a fee above 0. A short note will say so when the fee box is empty or invalid.
4. **Withdrawal page.** If the custom message isn't available, it uses the default support message.

## What you need to do in Supabase

Run **FULL_SUPABASE_SETUP.sql** once in Supabase: SQL Editor, then New query, paste the whole file, then Run. It's safe to run more than once. It adds the missing support message setting and every other table the site needs. You don't need any other .sql file.

Then check these in Netlify (per site): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (the `sb_secret_...` key) and `ADMIN_PASSWORD`. After that, choose Clear cache and deploy site.

## Technical details

- `src/lib/admin.functions.ts` (`listWallets`, get override, `setWithdrawButton`) and `src/lib/mixman.functions.ts` (`mixmanGetOverride`, `mixmanSetWithdrawButton`, `mixmanSetDisplayFlags`): detect Postgres/PostgREST errors for a missing column (`42703` / `PGRST204`) on `withdraw_support_message`, then retry the select or upsert without it. Return `withdraw_support_message: null` plus a `supportMessageUnavailable` flag.
- Pass through the Supabase error messages (currently swallowed) to the UI.
- `WithdrawButtonControl`: show a notice when `supportMessageUnavailable` is set.
- Verify with server logs and by saving each button and badge in the preview.
