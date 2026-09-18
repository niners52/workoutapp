-- Cable fly variants (2026-09-18).
--
-- The Planet Fitness high-to-low cable fly was two exercises, one per station
-- ("Cable wide Fly High to Low" and "Cable Fly high to low narrow"). The loads
-- differ (about 10 lb narrow vs 20 lb wide), so they become ONE exercise whose
-- sets carry a variant: 'Wide' or 'Narrow'. Last-time weights and PRs are per
-- variant in the app; history shows both.
--
--   * workout_sets gets a nullable `variant` column (null = exercise has no variants).
--   * Existing wide sets are tagged 'Wide'; narrow sets are tagged 'Narrow' and
--     moved onto the wide exercise id.
--   * Templates and skipped-exercise lists that named narrow now name the keeper.
--   * The narrow exercise row is deleted; the keeper is renamed.
-- The phone does the same in storage migration V18 (CABLE_FLY_MERGE in
-- src/services/exerciseVariants.ts) and re-uploads; this makes the cloud right
-- on its own and adds the column the tags need. Until it runs, the app syncs
-- sets without the tag and re-sends the tags on each launch.
--
-- Follows the remap pattern: snapshot first. Idempotent.
-- TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

BEGIN;

ALTER TABLE public.workout_sets ADD COLUMN IF NOT EXISTS variant text;

-- ─── Snapshot both exercise rows (once) ──────────────────────────────────────
INSERT INTO public.exercise_snapshots (user_id, exercise_id, reason, row_before)
SELECT e.user_id, e.id, '20260918 cable fly variants', to_jsonb(e)
  FROM public.exercises e
 WHERE e.id IN ('import-cable-fly-high-low', 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b')
   AND NOT EXISTS (SELECT 1 FROM public.exercise_snapshots s
                    WHERE s.exercise_id = e.id AND s.user_id IS NOT DISTINCT FROM e.user_id
                      AND s.reason = '20260918 cable fly variants');

-- ─── Tag, then move narrow sets onto the keeper ──────────────────────────────
UPDATE public.workout_sets SET variant = 'Wide'
 WHERE exercise_id = 'import-cable-fly-high-low' AND variant IS NULL;

UPDATE public.workout_sets
   SET variant = coalesce(variant, 'Narrow'),
       exercise_id = 'import-cable-fly-high-low'
 WHERE exercise_id = 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b';

-- ─── Templates: narrow slot -> keeper (dropped if the keeper is already there) ─
UPDATE public.templates t
   SET exercise_ids = CASE
         WHEN 'import-cable-fly-high-low' = ANY(t.exercise_ids)
           THEN array_remove(t.exercise_ids, 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b')
         ELSE array_replace(t.exercise_ids, 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b', 'import-cable-fly-high-low')
       END
 WHERE 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b' = ANY(t.exercise_ids);

-- ─── Skipped-exercise lists on workouts ──────────────────────────────────────
UPDATE public.workouts w
   SET skipped_exercise_ids = CASE
         WHEN 'import-cable-fly-high-low' = ANY(w.skipped_exercise_ids)
           THEN array_remove(w.skipped_exercise_ids, 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b')
         ELSE array_replace(w.skipped_exercise_ids, 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b', 'import-cable-fly-high-low')
       END
 WHERE 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b' = ANY(w.skipped_exercise_ids);

-- ─── One exercise ────────────────────────────────────────────────────────────
DELETE FROM public.exercises WHERE id = 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b';

UPDATE public.exercises
   SET name = 'Cable Fly High to Low', base_name = 'Fly High to Low'
 WHERE id = 'import-cable-fly-high-low';

COMMIT;

-- Results (rows, not notices):
select 'snapshots taken' as what, count(*)::text as value from public.exercise_snapshots where reason = '20260918 cable fly variants'
union all
select 'cable fly sets by variant', coalesce(string_agg(variant || ': ' || n, ', ' order by variant), 'none')
  from (select coalesce(variant, 'untagged') as variant, count(*)::text as n
          from public.workout_sets where exercise_id = 'import-cable-fly-high-low' group by 1) v
union all
select 'narrow exercise rows left', count(*)::text from public.exercises where id = 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b'
union all
select 'sets still on narrow id', count(*)::text from public.workout_sets where exercise_id = 'd1fde9b3-f2a7-4aff-b26b-940e28ece57b'
union all
select 'keeper name', name from public.exercises where id = 'import-cable-fly-high-low';
