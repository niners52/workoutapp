-- Lats as a tracked muscle group again (2026-09-17).
--
-- An earlier merger folded lats into upper_back, so pulldowns and pull-ups were
-- credited to upper_back and lats showed ~3 sets a week with no target.
--   * Every pulldown variant, pull-ups, straight-arm pulldowns and pullovers become
--     lats-primary. An upper_back primary moves to the secondaries (never
--     credited), so each set counts once, for lats.
--   * Rows (seated, low cable, T-bar, chest-supported, ISO lateral rows) stay upper_back.
--   * user_settings.muscle_group_targets.lats = 10. The app's Weekly Volume panel
--     and the MCP get_weekly_volume tool both read this column.
--   * lats is appended to health_targets.focusGroups (home dashboard pinned rows).
-- The phone makes the same change in storage migration V16 (LATS_PRIMARY_EXERCISE_IDS)
-- and re-uploads it; this file makes the cloud right before the phone updates.
-- Weekly volume is computed from current mappings, so past weeks recount on their own.
--
-- Follows the remap pattern: snapshot the affected rows first. Idempotent.
-- TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

BEGIN;

CREATE TEMP TABLE lats_ids (id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO lats_ids (id) VALUES
  ('wide-grip-lat-pulldown'),               -- Cable Wide-Grip Lat Pulldown
  ('close-grip-pulldown'),                  -- Cable Close-Grip Pulldown
  ('neutral-close-grip-pulldown'),          -- Cable (Other) Neutral Pulldown
  ('import-reverse-grip-pulldown'),         -- Cable Reverse Grip Pulldown
  ('import-mts-front-pulldown'),            -- Machine MTS Front Pulldown
  ('86847ace-fb9f-421b-b32b-776f27c56775'), -- Machine Lat pulldown (was lats + upper_back)
  ('163ac4a9-8e88-4508-bca8-3fffb18bdd7b'), -- Machine ISO lateral wide pulldown
  ('import-pullup'),                        -- Bodyweight Pull-Up
  ('import-pullup-assisted'),               -- Machine Pull-Up (Assisted)
  ('straight-arm-pulldown'),                -- Cable Straight-Arm Pulldown
  ('ae43a483-3e85-46d3-bcb2-33e014dbca97'), -- Cable (Straight Bar) arm pulldown (already lats)
  ('b26cd556-5623-418d-8ca1-8122fe91a8c7'), -- Machine Pullover
  ('b255de9b-fc45-4315-b222-aaa82387dff0'); -- Cable Rope Pullover

-- ─── Snapshot rows that will change (once per reason) ────────────────────────
INSERT INTO public.exercise_snapshots (user_id, exercise_id, reason, row_before)
SELECT e.user_id, e.id, '20260917 lats remap', to_jsonb(e)
  FROM public.exercises e
  JOIN lats_ids l ON l.id = e.id
 WHERE e.primary_muscle_groups IS DISTINCT FROM '{lats}'::text[]
   AND NOT EXISTS (SELECT 1 FROM public.exercise_snapshots s
                    WHERE s.exercise_id = e.id AND s.user_id IS NOT DISTINCT FROM e.user_id
                      AND s.reason = '20260917 lats remap');

-- ─── Remap: lats-only primaries, upper_back kept as context in secondaries ───
UPDATE public.exercises e
   SET secondary_muscle_groups = CASE
         WHEN 'upper_back' = ANY(e.primary_muscle_groups)
              AND NOT ('upper_back' = ANY(coalesce(e.secondary_muscle_groups, '{}')))
         THEN coalesce(e.secondary_muscle_groups, '{}') || '{upper_back}'::text[]
         ELSE e.secondary_muscle_groups
       END,
       primary_muscle_groups = '{lats}'
  FROM lats_ids l
 WHERE l.id = e.id
   AND e.primary_muscle_groups IS DISTINCT FROM '{lats}'::text[];

-- ─── Weekly target ───────────────────────────────────────────────────────────
UPDATE public.user_settings
   SET muscle_group_targets = coalesce(muscle_group_targets, '{}'::jsonb) || '{"lats": 10}'::jsonb
 WHERE coalesce((muscle_group_targets ->> 'lats')::numeric, 0) <> 10;

-- ─── Home dashboard focus rows (only where the user has saved health targets) ─
UPDATE public.user_settings
   SET health_targets = jsonb_set(
         health_targets,
         '{focusGroups}',
         coalesce(health_targets -> 'focusGroups', '[]'::jsonb)
           || '[{"id": "lats", "label": "Lats", "muscleGroup": "lats"}]'::jsonb)
 WHERE health_targets IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(coalesce(health_targets -> 'focusGroups', '[]'::jsonb)) f
          WHERE f ->> 'muscleGroup' = 'lats' AND coalesce(f ->> 'exerciseNameIncludes', '') = '');

COMMIT;

-- Results (rows, not notices):
select 'snapshots taken' as what, count(*)::text as value from public.exercise_snapshots where reason = '20260917 lats remap'
union all
select 'lats-primary exercises', string_agg(name, '; ' order by name) from public.exercises where primary_muscle_groups = '{lats}'
union all
select 'pulldown/pull-up names not lats-primary (triceps/biceps pulldowns expected)',coalesce(string_agg(name || ' [' || array_to_string(primary_muscle_groups, ',') || ']', '; ' order by name), 'none')
  from public.exercises
 where (name ILIKE '%pulldown%' OR name ILIKE '%pull-up%' OR name ILIKE '%pull up%')
   and not ('lats' = ANY(primary_muscle_groups))
union all
select 'lats target', string_agg(coalesce(muscle_group_targets ->> 'lats', 'missing'), ', ') from public.user_settings
union all
select 'lats focus row', string_agg(
         (exists (select 1 from jsonb_array_elements(coalesce(health_targets -> 'focusGroups', '[]'::jsonb)) f
                   where f ->> 'muscleGroup' = 'lats'))::text, ', ')
  from public.user_settings;
