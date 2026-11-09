-- Sanad Radar: durable discovery history and one/two daily Telegram summaries.
-- Safe to rerun. Secrets never live in these tables.
CREATE TABLE IF NOT EXISTS public.radar_digest_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  sends_per_day smallint NOT NULL DEFAULT 1 CHECK (sends_per_day IN (1,2)),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.radar_found_opportunities (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id text NOT NULL,
  title text NOT NULL,
  source text NOT NULL,
  url text NOT NULL,
  description text NOT NULL DEFAULT '',
  currency text CHECK (currency IN ('SAR','USD') OR currency IS NULL),
  budget_min numeric NOT NULL DEFAULT 0,
  budget_max numeric NOT NULL DEFAULT 0,
  work_mode text,
  employment text,
  published_at timestamptz,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  PRIMARY KEY (user_id, opportunity_id)
);
CREATE INDEX IF NOT EXISTS radar_found_pending_idx
  ON public.radar_found_opportunities (user_id, first_seen)
  WHERE notified_at IS NULL;

CREATE TABLE IF NOT EXISTS public.radar_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','sent','failed')),
  opportunity_count integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(user_id, slot_key)
);

ALTER TABLE public.radar_digest_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_found_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radar_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS radar_pref_owner_select ON public.radar_digest_preferences;
CREATE POLICY radar_pref_owner_select ON public.radar_digest_preferences
 FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS radar_pref_owner_insert ON public.radar_digest_preferences;
CREATE POLICY radar_pref_owner_insert ON public.radar_digest_preferences
 FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS radar_pref_owner_update ON public.radar_digest_preferences;
CREATE POLICY radar_pref_owner_update ON public.radar_digest_preferences
 FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS radar_found_owner_select ON public.radar_found_opportunities;
CREATE POLICY radar_found_owner_select ON public.radar_found_opportunities
 FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
DROP POLICY IF EXISTS radar_runs_owner_select ON public.radar_digest_runs;
CREATE POLICY radar_runs_owner_select ON public.radar_digest_runs
 FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

-- Only the confirmed account is eligible. Public sign-up stays disabled.
INSERT INTO public.radar_digest_preferences (user_id)
SELECT id FROM auth.users WHERE email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
