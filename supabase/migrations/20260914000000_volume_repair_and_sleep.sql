-- Volume-counting repairs + sleep_nights (2026-09-14).
--
-- What the connector showed after the reconciliation backlog uploaded:
--   * "Cable (D-Handle) Rotator cuff" (bcc9b2b0-…) had primaries {chest, miscellaneous}.
--     Every one of its ~40 weekly sets counted as chest AND as miscellaneous
--     (chest 67 vs 27 real for Aug 31 - Sep 6). It becomes its own group.
--   * is_unilateral was never sent by the app, so the 0.5 credit never applied.
--     The phone re-syncs the real flags in V15; this sets the obvious ones now.
--
-- Pattern for any remap from here on: snapshot the affected rows first.
-- Idempotent. TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

BEGIN;

-- ─── Snapshot store for exercise remaps ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exercise_snapshots (
  id          bigserial PRIMARY KEY,
  user_id     uuid,
  exercise_id text NOT NULL,
  reason      text NOT NULL,
  row_before  jsonb NOT NULL,
  taken_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exercise_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercise_snapshots_select_own ON public.exercise_snapshots;
CREATE POLICY exercise_snapshots_select_own ON public.exercise_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Snapshot every row this file is about to change (only once per reason).
INSERT INTO public.exercise_snapshots (user_id, exercise_id, reason, row_before)
SELECT e.user_id, e.id, '20260914 volume repair', to_jsonb(e)
  FROM public.exercises e
 WHERE (e.id = 'bcc9b2b0-0309-4b44-84d7-49de58ab8064'
        OR ('miscellaneous' = ANY(e.primary_muscle_groups) AND cardinality(e.primary_muscle_groups) > 1)
        OR e.name ILIKE 'single %' OR e.name ILIKE '%one-arm%' OR e.name ILIKE '%one arm%'
        OR e.name ILIKE 'left %' OR e.name ILIKE 'right %')
   AND NOT EXISTS (SELECT 1 FROM public.exercise_snapshots s
                    WHERE s.exercise_id = e.id AND s.reason = '20260914 volume repair');

-- ─── Rotator cuff: its own group ─────────────────────────────────────────────
UPDATE public.exercises
   SET primary_muscle_groups = '{rotator_cuff}',
       secondary_muscle_groups = '{}',
       is_unilateral = true          -- single-arm D-handle work
 WHERE id = 'bcc9b2b0-0309-4b44-84d7-49de58ab8064';

-- ─── Drop the 'miscellaneous' placeholder wherever a real group exists ────────
UPDATE public.exercises
   SET primary_muscle_groups = (
         SELECT array_agg(DISTINCT g ORDER BY g)
           FROM unnest(primary_muscle_groups) AS g
          WHERE g <> 'miscellaneous')
 WHERE 'miscellaneous' = ANY(primary_muscle_groups)
   AND cardinality(primary_muscle_groups) > 1;

-- ─── Obvious single-limb exercises (the phone's own flags override on re-sync) ─
UPDATE public.exercises
   SET is_unilateral = true
 WHERE is_unilateral = false
   AND (name ILIKE 'single %' OR name ILIKE '%one-arm%' OR name ILIKE '%one arm%'
        OR name ILIKE 'left %' OR name ILIKE 'right %');

-- ─── Weekly target for the new group (matches the app default) ───────────────
UPDATE public.user_settings
   SET muscle_group_targets = coalesce(muscle_group_targets, '{}'::jsonb) || '{"rotator_cuff": 12}'::jsonb
 WHERE NOT (coalesce(muscle_group_targets, '{}'::jsonb) ? 'rotator_cuff');

-- ─── sleep_nights ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sleep_nights (
  id               text        NOT NULL,                 -- hk-sleep-YYYY-MM-DD
  user_id          uuid        NOT NULL,
  date             text        NOT NULL,                 -- wake date, device-local
  time_asleep_min  integer     NOT NULL,
  time_in_bed_min  integer     NOT NULL,
  bedtime          timestamptz NOT NULL,
  wake_time        timestamptz NOT NULL,
  deep_min         integer,
  rem_min          integer,
  core_min         integer,
  awake_min        integer,
  sample_count     integer     NOT NULL DEFAULT 0,
  source           text        NOT NULL DEFAULT 'healthkit',
  synced_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS sleep_nights_user_date_idx ON public.sleep_nights (user_id, date DESC);

DROP TRIGGER IF EXISTS sleep_nights_touch_updated_at ON public.sleep_nights;
CREATE TRIGGER sleep_nights_touch_updated_at
  BEFORE UPDATE ON public.sleep_nights
  FOR EACH ROW EXECUTE FUNCTION public.nutrition_days_touch_updated_at();

ALTER TABLE public.sleep_nights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sleep_nights_select_own ON public.sleep_nights;
DROP POLICY IF EXISTS sleep_nights_insert_own ON public.sleep_nights;
DROP POLICY IF EXISTS sleep_nights_update_own ON public.sleep_nights;
DROP POLICY IF EXISTS sleep_nights_delete_own ON public.sleep_nights;
CREATE POLICY sleep_nights_select_own ON public.sleep_nights FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY sleep_nights_insert_own ON public.sleep_nights FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY sleep_nights_update_own ON public.sleep_nights FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY sleep_nights_delete_own ON public.sleep_nights FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMIT;

-- Results (rows, not notices):
select 'snapshots taken' as what, count(*)::text as value from public.exercise_snapshots where reason = '20260914 volume repair'
union all
select 'rotator cuff primaries', array_to_string(primary_muscle_groups, ',') from public.exercises where id = 'bcc9b2b0-0309-4b44-84d7-49de58ab8064'
union all
select 'exercises still with miscellaneous', count(*)::text from public.exercises where 'miscellaneous' = ANY(primary_muscle_groups)
union all
select 'exercises with no primaries', count(*)::text from public.exercises where cardinality(coalesce(primary_muscle_groups, '{}')) = 0
union all
select 'unilateral exercises', string_agg(name, '; ' order by name) from public.exercises where is_unilateral
union all
select 'sleep_nights columns', count(*)::text from information_schema.columns where table_name = 'sleep_nights';
