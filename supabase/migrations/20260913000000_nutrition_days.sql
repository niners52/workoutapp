-- nutrition_days: one row per user per local calendar day, filled from Apple
-- Health (Cronometer writes its dietary data there). (2026-09-13)
--
-- Conventions match body_measurements: text id in the hk-<kind>-<date> style,
-- date as 'YYYY-MM-DD' text, source + synced_at, per-user RLS policies.
-- Uniqueness is (user_id, date); the app upserts on that pair for the trailing
-- 30 days on every sync because Cronometer entries are edited retroactively.
--
-- sample_count is the number of HealthKit samples across the tracked nutrient
-- types that day. Days with no samples are never written, so a row means
-- "logged"; a nutrient column is NULL when the build cannot read that type yet
-- (the micronutrient getters need a native build) and 0 when it was readable
-- and nothing was logged for it.
--
-- Idempotent. TO APPLY: Supabase dashboard -> SQL Editor -> paste & run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nutrition_days (
  id               text        NOT NULL,                     -- hk-nutrition-YYYY-MM-DD
  user_id          uuid        NOT NULL,
  date             text        NOT NULL,                     -- 'YYYY-MM-DD', device-local day
  calories         numeric,                                  -- kcal
  protein_g        numeric,
  carbs_g          numeric,
  fat_g            numeric,
  fiber_g          numeric,
  iron_mg          numeric,
  vitamin_b12_mcg  numeric,
  vitamin_d_iu     numeric,
  calcium_mg       numeric,
  zinc_mg          numeric,
  sodium_mg        numeric,
  sample_count     integer     NOT NULL DEFAULT 0,
  source           text        NOT NULL DEFAULT 'healthkit',
  synced_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS nutrition_days_user_date_idx ON public.nutrition_days (user_id, date DESC);

-- Keep updated_at honest on upsert.
CREATE OR REPLACE FUNCTION public.nutrition_days_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS nutrition_days_touch_updated_at ON public.nutrition_days;
CREATE TRIGGER nutrition_days_touch_updated_at
  BEFORE UPDATE ON public.nutrition_days
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_days_touch_updated_at();

-- Same per-user policies as the other synced tables.
ALTER TABLE public.nutrition_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nutrition_days_select_own ON public.nutrition_days;
DROP POLICY IF EXISTS nutrition_days_insert_own ON public.nutrition_days;
DROP POLICY IF EXISTS nutrition_days_update_own ON public.nutrition_days;
DROP POLICY IF EXISTS nutrition_days_delete_own ON public.nutrition_days;
CREATE POLICY nutrition_days_select_own ON public.nutrition_days FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY nutrition_days_insert_own ON public.nutrition_days FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY nutrition_days_update_own ON public.nutrition_days FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY nutrition_days_delete_own ON public.nutrition_days FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMIT;

-- Verify (returns the table's columns):
--   select column_name, data_type from information_schema.columns
--    where table_name = 'nutrition_days' order by ordinal_position;
