-- Exercise record fixes, the six full-body days, and revised targets (2026-10-01).
--
-- 1. Three exercises describe the wrong movement. A "Cable (Rope) Front raise"
--    whose whole history is pull-throughs, and two seeded with the deprecated
--    singular muscle field, so they have no primary group and every set they
--    hold earns no credit (DB Pullover alone is 168 sets).
-- 2. Full Body 1-6. The earlier drafts of those names are reused by id, so a
--    routine already pointing at them keeps working. Templates store only
--    exercise ids, so the prescription lives on the exercise as target_sets /
--    target_reps (new column). Unilateral: 6 sets is 3 per leg.
-- 3. Weekly targets to 129 sets over 15 groups (traps 9, abs 9, calves 3,
--    adductors 0).
--
-- Scoped to Tyler's user_id so a shared project is untouched. Changed exercise
-- rows are snapshotted first. Idempotent.
-- TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

BEGIN;

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_reps text;

-- ─── 1. Exercise record fixes ───────────────────────────────────────────────
CREATE TEMP TABLE record_fix (id text PRIMARY KEY, name text, base_name text, pri text[], sec text[]) ON COMMIT DROP;
INSERT INTO record_fix VALUES
  ('e1bc84b4-90e6-427e-bd1a-fdebf6b821ae', 'Cable (Rope) Pull-Through', 'Pull-Through', ARRAY['glutes'], ARRAY['hamstrings']),
  ('db-hip-thrust',                         NULL,                        NULL,           ARRAY['glutes'], ARRAY['hamstrings']),
  ('db-pullover',                           NULL,                        NULL,           ARRAY['lats'],   ARRAY['chest']);

INSERT INTO public.exercise_snapshots (user_id, exercise_id, reason, row_before)
SELECT e.user_id, e.id, '20261001 exercise record fixes', to_jsonb(e)
  FROM public.exercises e JOIN record_fix f ON f.id = e.id
 WHERE e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND NOT EXISTS (SELECT 1 FROM public.exercise_snapshots s
                    WHERE s.exercise_id = e.id AND s.user_id IS NOT DISTINCT FROM e.user_id
                      AND s.reason = '20261001 exercise record fixes');

UPDATE public.exercises e
   SET name = coalesce(f.name, e.name),
       base_name = coalesce(f.base_name, e.base_name),
       primary_muscle_groups = f.pri,
       secondary_muscle_groups = f.sec,
       updated_at = now()
  FROM record_fix f
 WHERE f.id = e.id
   AND e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND (e.name IS DISTINCT FROM coalesce(f.name, e.name)
     OR e.base_name IS DISTINCT FROM coalesce(f.base_name, e.base_name)
     OR e.primary_muscle_groups IS DISTINCT FROM f.pri
     OR e.secondary_muscle_groups IS DISTINCT FROM f.sec);

-- Every fix must land. A no-op here means the id moved or the row is gone.
DO $$
DECLARE missed text;
BEGIN
  SELECT string_agg(f.id, ', ') INTO missed
    FROM record_fix f
    LEFT JOIN public.exercises e
           ON e.id = f.id AND e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
          AND e.primary_muscle_groups = f.pri
   WHERE e.id IS NULL;
  IF missed IS NOT NULL THEN
    RAISE EXCEPTION 'exercise record fixes did not apply: %', missed;
  END IF;
END $$;

-- ─── 2. The six full-body days ──────────────────────────────────────────────
CREATE TEMP TABLE fb_day (id text PRIMARY KEY, name text, location_id text, exercise_ids text[]) ON COMMIT DROP;
INSERT INTO fb_day VALUES
  ('892c45ec-5312-447c-adf9-50c101ae1e35', 'Full Body 1', 'gym', ARRAY[
     'plate-loaded-incline-press','wide-grip-lat-pulldown','import-low-cable-row',
     '29bcb169-528c-4f61-910f-66d52c1d6fd1','seated-leg-curl','cable-lateral-raise','cable-machine-crunch']),
  ('b13a4b23-1892-4fae-bcba-59cb8d1dd0d8', 'Full Body 2', 'gym', ARRAY[
     'aaedca8e-b918-43f3-b324-caab35e16cda','86847ace-fb9f-421b-b32b-776f27c56775','chest-supported-machine-row',
     'seated-leg-extension','45f8c1cc-6bc7-4047-a427-5489ebaf66a3','22da91ef-ecfa-4cbb-b93b-2b9f7b7bf586',
     '7524e1ed-a483-4f72-b337-248f8246a1cb']),
  ('66a02408-5929-4603-ae7d-3bb283d7c483', 'Full Body 3', 'gym', ARRAY[
     'pec-fly-machine','import-pullup','import-wide-grip-row','87d5e750-60cd-46ef-b5f2-6822a6d070a6',
     'e4ae1797-ec53-4ddf-8473-24cc78c68267','face-pull','import-leg-raise']),
  ('c6698cd8-af6a-4937-90be-fdb17885d8d9', 'Full Body 4', 'gym', ARRAY[
     'incline-bench-press','ae43a483-3e85-46d3-bcb2-33e014dbca97','083c1c85-f090-4a50-a430-19393c82d080',
     '29bcb169-528c-4f61-910f-66d52c1d6fd1','back-extension','558d0521-308c-418d-9f3a-40ef807cd6a9',
     'overhead-triceps-extension-rope']),
  ('3d0d4a24-b345-4193-9d4c-b80b664f9565', 'Full Body 5', 'gym', ARRAY[
     'import-cable-fly-high-low','e1bc84b4-90e6-427e-bd1a-fdebf6b821ae','seated-leg-curl',
     '9279fe5b-336f-455e-8b2a-6773bea46ce7','b5400777-ab8f-4d03-9b28-c9b393ff04bf','import-alternate-db-curl',
     'calf-raise-machine','991536ef-ea5a-47a8-9db4-d0b2f8499702']),
  ('fd7ebc8a-02c7-45ef-bd1d-04a40c427bba', 'Full Body 6', 'vasa-', ARRAY[
     '324a7e84-0ec3-4b4e-8314-a87e3f4478e9','ec3b885d-db9a-43b2-84ff-859d5d5c3455','39e393c6-770c-4522-9ee2-8abfd66f7627',
     'cable-lateral-raise','640c8b84-cec2-4116-aa15-5718034940b7','import-tricep-dip-machine',
     'import-bayesian-curls','33b9d9e0-aa70-4bf8-aee6-7437b95a0c92']);

-- Nothing new is created: every exercise named must already exist.
DO $$
DECLARE missed text;
BEGIN
  SELECT string_agg(DISTINCT x.id, ', ') INTO missed
    FROM (SELECT unnest(exercise_ids) AS id FROM fb_day) x
    LEFT JOIN public.exercises e ON e.id = x.id AND e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   WHERE e.id IS NULL;
  IF missed IS NOT NULL THEN
    RAISE EXCEPTION 'full-body templates name exercises that do not exist: %', missed;
  END IF;
END $$;

INSERT INTO public.templates (id, user_id, name, type, location_id, exercise_ids, created_at, updated_at)
SELECT d.id, '9e957b0f-2f11-408a-9504-b5215049cbb5', d.name, 'full_body', d.location_id, d.exercise_ids, now(), now()
  FROM fb_day d
    ON CONFLICT (id) DO UPDATE
   SET name = excluded.name,
       type = excluded.type,
       location_id = excluded.location_id,
       exercise_ids = excluded.exercise_ids,
       updated_at = now();

-- 3 sets everywhere; 6 on the unilateral glute push, which is 3 per leg.
CREATE TEMP TABLE fb_item (exercise_id text PRIMARY KEY, sets int, reps text) ON COMMIT DROP;
INSERT INTO fb_item VALUES
  ('plate-loaded-incline-press', 3, '6-8'),
  ('wide-grip-lat-pulldown', 3, '8-10'),
  ('import-low-cable-row', 3, '8-10'),
  ('29bcb169-528c-4f61-910f-66d52c1d6fd1', 3, '8-12'), -- 8-10 on day 1, 10-12 on day 4
  ('seated-leg-curl', 3, '10-12'),
  ('cable-lateral-raise', 3, '12-15'),
  ('cable-machine-crunch', 3, '12'),
  ('aaedca8e-b918-43f3-b324-caab35e16cda', 3, '8-10'),
  ('86847ace-fb9f-421b-b32b-776f27c56775', 3, '8-10'),
  ('chest-supported-machine-row', 3, '10-12'),
  ('seated-leg-extension', 3, '12-15'),
  ('45f8c1cc-6bc7-4047-a427-5489ebaf66a3', 6, '10-12'),
  ('22da91ef-ecfa-4cbb-b93b-2b9f7b7bf586', 3, '10-12'),
  ('7524e1ed-a483-4f72-b337-248f8246a1cb', 3, '8-10'),
  ('pec-fly-machine', 3, '12'),
  ('import-pullup', 3, 'AMRAP'),
  ('import-wide-grip-row', 3, '10-12'),
  ('87d5e750-60cd-46ef-b5f2-6822a6d070a6', 3, '10-12'),
  ('e4ae1797-ec53-4ddf-8473-24cc78c68267', 3, '10'),
  ('face-pull', 3, '15'),
  ('import-leg-raise', 3, '12'),
  ('incline-bench-press', 3, '8-10'),
  ('ae43a483-3e85-46d3-bcb2-33e014dbca97', 3, '12'),
  ('083c1c85-f090-4a50-a430-19393c82d080', 3, '10-12'),
  ('back-extension', 3, '12'),
  ('558d0521-308c-418d-9f3a-40ef807cd6a9', 3, '12'),
  ('overhead-triceps-extension-rope', 3, '10-12'),
  ('import-cable-fly-high-low', 3, '12'),
  ('e1bc84b4-90e6-427e-bd1a-fdebf6b821ae', 3, '12-15'),
  ('9279fe5b-336f-455e-8b2a-6773bea46ce7', 3, '10-12'),
  ('b5400777-ab8f-4d03-9b28-c9b393ff04bf', 3, '15'),
  ('import-alternate-db-curl', 3, '10'),
  ('calf-raise-machine', 3, '15'),
  ('991536ef-ea5a-47a8-9db4-d0b2f8499702', 3, '15'),
  ('324a7e84-0ec3-4b4e-8314-a87e3f4478e9', 3, '10-12'),
  ('ec3b885d-db9a-43b2-84ff-859d5d5c3455', 3, '10-12'),
  ('39e393c6-770c-4522-9ee2-8abfd66f7627', 3, '8-10'),
  ('640c8b84-cec2-4116-aa15-5718034940b7', 3, '10-12'),
  ('import-tricep-dip-machine', 3, '8-10'),
  ('import-bayesian-curls', 3, '10-12'),
  ('33b9d9e0-aa70-4bf8-aee6-7437b95a0c92', 3, '15');

UPDATE public.exercises e
   SET target_sets = i.sets, target_reps = i.reps, updated_at = now()
  FROM fb_item i
 WHERE i.exercise_id = e.id
   AND e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND (e.target_sets IS DISTINCT FROM i.sets OR e.target_reps IS DISTINCT FROM i.reps);

-- ─── 3. Weekly targets (129 sets over 15 groups) ────────────────────────────
UPDATE public.user_settings
   SET muscle_group_targets = '{
         "chest": 15, "lats": 12, "mid_back": 12, "rear_delts": 6,
         "side_delts": 9, "traps": 9, "triceps": 9, "biceps": 9,
         "quads": 12, "hamstrings": 9, "glutes": 6, "lower_back": 6,
         "adductors": 0, "calves": 3, "abs": 9, "front_delts": 3,
         "rotator_cuff": 0, "forearms": 0, "miscellaneous": 0
       }'::jsonb
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5';

COMMIT;

-- Results (rows, not notices):
select 'pull-through' as what, name || ' / ' || array_to_string(primary_muscle_groups, '+') as value
  from public.exercises where id = 'e1bc84b4-90e6-427e-bd1a-fdebf6b821ae'
union all
select 'exercises with no primary group',
       coalesce((select count(*)::text from public.exercises
                  where coalesce(array_length(primary_muscle_groups,1),0) = 0
                    and exists (select 1 from public.workout_sets ws where ws.exercise_id = exercises.id)), '0')
union all
select 'full body days', string_agg(name, ', ' order by name) from public.templates where name like 'Full Body %'
union all
select 'prescribed exercises', count(*)::text from public.exercises where target_reps is not null
union all
select 'target total', (select sum(value::int)::text from jsonb_each_text(muscle_group_targets))
  from public.user_settings where user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5';
