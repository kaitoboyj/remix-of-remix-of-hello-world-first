# Netlify Environment Variables Setup

## Required Environment Variables

Add these variables in your Netlify dashboard:
1. Go to your site → Site Settings → Environment variables
2. Click "Add a variable" for each variable below

### Client-side Variables (VITE_ prefix required)
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

### Server-side Variables
```
SUPABASE_URL=your_supabase_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Other Required Variables
```
ADMIN_PASSWORD=your_admin_password
THIRDWEB_CLIENT_ID=your_thirdweb_client_id
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_WEBHOOK_SECRET=your_strong_random_webhook_secret
TELEGRAM_CHAT_ID=-1003957750577
```

## After Setting Variables

1. Go to Deploys in Netlify
2. Click "Trigger deploy" → "Clear cache and deploy site"
3. Wait for deployment to complete
4. Test the login feature

## Important Notes

- The `VITE_` prefix is critical for client-side access in Vite projects
- Ensure no extra spaces in variable values
- Never commit actual secrets to git
- The service role key should be kept secure

### Withdrawal emails (Gmail)
```
SMTP_USER=primecapitalsupportchat@gmail.com
SMTP_PASS=your 16-character Gmail app password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
```

For Gmail, enable two-step verification and create an App Password. A normal Gmail password will not work.
The deploy registers the Telegram webhook automatically only when both Telegram secrets are present.
