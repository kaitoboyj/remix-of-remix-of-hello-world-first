-- ============================================================================
-- Prime Capital — FULL DATABASE SETUP
-- Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run more than once: every statement is idempotent.
-- Replaces the older *_SQL.sql files.
-- All tables are reached only from server code (service role); browsers get
-- no direct access.
-- ============================================================================

-- Shared trigger helper ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. Wallet profiles (usernames + contact details) ----------------------------
CREATE TABLE IF NOT EXISTS public.wallet_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wallet_profiles_username_len CHECK (char_length(username) BETWEEN 3 AND 24),
  CONSTRAINT wallet_profiles_username_fmt CHECK (username ~ '^[A-Za-z0-9_]+$')
);
ALTER TABLE public.wallet_profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.wallet_profiles ADD COLUMN IF NOT EXISTS email_address TEXT;
CREATE INDEX IF NOT EXISTS wallet_profiles_wallet_address_lower_idx ON public.wallet_profiles (lower(wallet_address));
CREATE INDEX IF NOT EXISTS wallet_profiles_username_lower_idx ON public.wallet_profiles (lower(username));

-- 2. Wallet login history ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_logins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  username TEXT,
  event TEXT NOT NULL CHECK (event IN ('create','import','signin')),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_logins_wallet_address_idx ON public.wallet_logins (wallet_address);
CREATE INDEX IF NOT EXISTS wallet_logins_created_at_idx ON public.wallet_logins (created_at DESC);

-- 3. Admin display settings per wallet ----------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_balance_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  usd_balance NUMERIC,
  token_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_balance_overrides
  ADD COLUMN IF NOT EXISTS yield_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS live_balance_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_live_balance NUMERIC,
  ADD COLUMN IF NOT EXISTS mock_live_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdraw_support_message TEXT;
DROP TRIGGER IF EXISTS update_wallet_balance_overrides_updated_at ON public.wallet_balance_overrides;
CREATE TRIGGER update_wallet_balance_overrides_updated_at
  BEFORE UPDATE ON public.wallet_balance_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Signed-in devices --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_devices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  device_id TEXT NOT NULL,
  username TEXT,
  device_name TEXT,
  os TEXT,
  browser TEXT,
  browser_version TEXT,
  screen TEXT,
  timezone TEXT,
  user_agent TEXT,
  ip_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'logged_out')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_out_at TIMESTAMPTZ,
  CONSTRAINT wallet_devices_wallet_device_key UNIQUE (wallet_address, device_id)
);
CREATE INDEX IF NOT EXISTS wallet_devices_wallet_idx ON public.wallet_devices (wallet_address, last_seen_at DESC);

-- 5. Support chat -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  username TEXT,
  custom_label TEXT,
  chat_mode SMALLINT NOT NULL DEFAULT 0, -- 0 auto, 1 always show, 2 always hide
  last_message_at TIMESTAMPTZ,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  unread_user INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.support_threads ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE public.support_threads ADD COLUMN IF NOT EXISTS custom_label TEXT;
ALTER TABLE public.support_threads ALTER COLUMN unread_user SET DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'admin')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_settings (
  id SMALLINT NOT NULL PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  welcome_message TEXT,
  chat_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.support_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON public.support_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_created_idx ON public.support_messages (created_at);
CREATE INDEX IF NOT EXISTS support_threads_last_message_idx ON public.support_threads (last_message_at DESC NULLS LAST);

-- 6. Access: server only ------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'wallet_profiles','wallet_logins','wallet_balance_overrides','wallet_devices',
    'support_threads','support_messages','support_settings'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "server only" ON public.%I', t);
    EXECUTE format('CREATE POLICY "server only" ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;
