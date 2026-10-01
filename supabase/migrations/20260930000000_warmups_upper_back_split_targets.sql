-- Warm-up sets, the upper_back split, and revised weekly targets (2026-09-30).
--
-- 1. workout_sets.is_warmup (nullable: null means "ask the exercise") and
--    exercises.default_warmup. Warm-ups stay in history but are left out of
--    weekly volume and reported separately, like deload sets. The cable
--    rotator-cuff prep work is flagged by default — about 8 sets a session
--    that were counting as training volume.
-- 2. upper_back splits into mid_back (rows) and rear_delts (face pulls,
--    reverse flyes, Y raises). A shrug and a front lat pulldown just lose it:
--    they are traps and lats work respectively. Exercise ids match
--    src/services/upperBackSplit.ts, which the phone migration V19 applies.
-- 3. Weekly targets revised to 125 sets across 16 groups; rotator_cuff drops
--    to 0 now that its work is warm-up.
--
-- Data changes are scoped to Tyler's user_id so a shared project is untouched.
-- Rows that change are snapshotted first. Idempotent.
-- TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

BEGIN;

-- ─── 1. Warm-up columns ──────────────────────────────────────────────────────
ALTER TABLE public.workout_sets ADD COLUMN IF NOT EXISTS is_warmup boolean;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS default_warmup boolean NOT NULL DEFAULT false;

UPDATE public.exercises
   SET default_warmup = true
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND id = 'bcc9b2b0-0309-4b44-84d7-49de58ab8064' -- Cable (D-Handle) Rotator cuff
   AND default_warmup IS DISTINCT FROM true;

-- ─── 2. upper_back -> mid_back / rear_delts ──────────────────────────────────
-- target NULL means "drop upper_back from this exercise"; `mapped` separates
-- that from "not in the map", which falls back to mid_back.
CREATE TEMP TABLE split_map (id text PRIMARY KEY, target text) ON COMMIT DROP;
INSERT INTO split_map (id, target) VALUES
  -- rows -> mid_back
  ('import-seated-row', 'mid_back'),
  ('import-low-cable-row', 'mid_back'),
  ('import-bentover-row', 'mid_back'),
  ('import-dumbbell-barbell-row', 'mid_back'),
  ('one-arm-db-row', 'mid_back'),
  ('chest-supported-db-row', 'mid_back'),
  ('chest-supported-machine-row', 'mid_back'),
  ('import-wide-grip-row', 'mid_back'),
  ('84b5317c-7dfb-4cf2-8b65-4f5c08e02901', 'mid_back'),
  ('083c1c85-f090-4a50-a430-19393c82d080', 'mid_back'),
  ('32f82f4b-eea1-4434-9c5c-3d726318bff3', 'mid_back'),
  ('53e24479-949d-4501-b1c8-d88990d49c8f', 'mid_back'),
  -- rear-delt work -> rear_delts
  ('face-pull', 'rear_delts'),
  ('rear-delt-fly-machine', 'rear_delts'),
  ('incline-bench-rear-delt-db-fly', 'rear_delts'),
  ('import-y-raise', 'rear_delts'),
  ('b5400777-ab8f-4d03-9b28-c9b393ff04bf', 'rear_delts'),
  ('ded1d7f5-e42b-4ccc-8fb4-58e0889821ff', 'rear_delts'),
  ('3ce3318e-5633-421b-a6e6-776bf1d8abe3', 'rear_delts'),
  ('e6488686-a1db-4032-b766-0dc133f65fa7', 'rear_delts'),
  -- stray second group: a shrug is traps, a pulldown is lats
  ('e7e07ae2-6022-41ce-a33a-2cf29d92a8f8', NULL),
  ('3d73048e-fe49-448d-b81a-76fd7d54ff32', NULL);

INSERT INTO public.exercise_snapshots (user_id, exercise_id, reason, row_before)
SELECT e.user_id, e.id, '20260930 upper back split', to_jsonb(e)
  FROM public.exercises e
 WHERE e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND ('upper_back' = ANY(e.primary_muscle_groups) OR 'upper_back' = ANY(coalesce(e.secondary_muscle_groups, '{}')))
   AND NOT EXISTS (SELECT 1 FROM public.exercise_snapshots s
                    WHERE s.exercise_id = e.id AND s.user_id IS NOT DISTINCT FROM e.user_id
                      AND s.reason = '20260930 upper back split');

-- Anything still on upper_back that is not in the map is a row: mid_back.
UPDATE public.exercises e
   SET primary_muscle_groups = (
         SELECT coalesce(array_agg(DISTINCT g2 ORDER BY g2), '{}')
           FROM (SELECT CASE WHEN g = 'upper_back'
                             THEN (SELECT CASE WHEN EXISTS (SELECT 1 FROM split_map m WHERE m.id = e.id)
                                               THEN (SELECT target FROM split_map m WHERE m.id = e.id)
                                               ELSE 'mid_back' END)
                             ELSE g END AS g2
                   FROM unnest(e.primary_muscle_groups) AS g) x
          WHERE g2 IS NOT NULL),
       secondary_muscle_groups = (
         SELECT coalesce(array_agg(DISTINCT g2 ORDER BY g2), '{}')
           FROM (SELECT CASE WHEN g = 'upper_back'
                             THEN (SELECT CASE WHEN EXISTS (SELECT 1 FROM split_map m WHERE m.id = e.id)
                                               THEN (SELECT target FROM split_map m WHERE m.id = e.id)
                                               ELSE 'mid_back' END)
                             ELSE g END AS g2
                   FROM unnest(coalesce(e.secondary_muscle_groups, '{}')) AS g) y
          WHERE g2 IS NOT NULL)
 WHERE e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND ('upper_back' = ANY(e.primary_muscle_groups) OR 'upper_back' = ANY(coalesce(e.secondary_muscle_groups, '{}')));

-- A duplicate of a primary in the secondaries says nothing.
UPDATE public.exercises e
   SET secondary_muscle_groups = (
         SELECT coalesce(array_agg(g ORDER BY g), '{}')
           FROM unnest(e.secondary_muscle_groups) AS g
          WHERE NOT (g = ANY(e.primary_muscle_groups)))
 WHERE e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND e.secondary_muscle_groups && e.primary_muscle_groups;

-- ─── 3. Revised weekly targets (125 sets over 16 groups) ─────────────────────
UPDATE public.user_settings
   SET muscle_group_targets = '{
         "chest": 15, "lats": 12, "mid_back": 12, "rear_delts": 6,
         "side_delts": 9, "traps": 6, "triceps": 9, "biceps": 9,
         "quads": 12, "hamstrings": 9, "glutes": 6, "lower_back": 6,
         "adductors": 3, "calves": 2, "abs": 6, "front_delts": 3,
         "rotator_cuff": 0, "forearms": 0, "miscellaneous": 0
       }'::jsonb
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5';

-- The mid-back focus row on the home dashboard named the old group.
UPDATE public.user_settings
   SET health_targets = jsonb_set(
         health_targets,
         '{focusGroups}',
         (SELECT jsonb_agg(CASE WHEN f ->> 'muscleGroup' = 'upper_back'
                                THEN jsonb_set(f, '{muscleGroup}', '"mid_back"')
                                ELSE f END)
            FROM jsonb_array_elements(health_targets -> 'focusGroups') f))
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND health_targets ? 'focusGroups'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(health_targets -> 'focusGroups') f
                WHERE f ->> 'muscleGroup' = 'upper_back');

COMMIT;

-- Results (rows, not notices):
select 'exercises left on upper_back' as what, count(*)::text as value
  from public.exercises
 where 'upper_back' = ANY(primary_muscle_groups) or 'upper_back' = ANY(coalesce(secondary_muscle_groups, '{}'))
union all
select 'mid_back exercises', count(*)::text from public.exercises where 'mid_back' = ANY(primary_muscle_groups)
union all
select 'rear_delts exercises', count(*)::text from public.exercises where 'rear_delts' = ANY(primary_muscle_groups)
union all
select 'warm-up by default', coalesce(string_agg(name, '; '), 'none') from public.exercises where default_warmup
union all
select 'snapshots taken', count(*)::text from public.exercise_snapshots where reason = '20260930 upper back split'
union all
select 'target total', (select sum(value::int)::text from jsonb_each_text(muscle_group_targets))
  from public.user_settings where user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5';
