<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- All blockchain/price API keys live in src/lib/api-keys.ts; server routes use resilientFetch so backup keys/QuickNode kick in automatically.
- Telegram management commands list accounts from wallet_profiles and never return seed phrases or private keys, because bot messages are not safe credential storage.
- Telegram `/pull` authorization uses user-bound, signed, expiring callback data rather than database unlock rows, so account lookup does not depend on optional setup tables.
- Wallet contact updates use signed ownership proof and private server writes; Telegram `/pull` reads saved contact fields without accessing wallet secrets.
- Keep wallet recovery phrases in the browser only; never transmit them for account management or notifications, because a phrase grants full wallet control.
- Reject Telegram webhook calls when the shared webhook secret is unavailable, because public management commands must never accept unauthenticated requests.
- Store each wallet's red withdrawal support prompt in its balance override row so Admin, Mix Man, and the withdrawal page share one server-controlled value.
