-- Follow-up to 20261001000000 (2026-10-01).
--
-- Close Grip Bench Press was seeded with the deprecated singular muscle field
-- too, so its 45 sets earned no credit: triceps, with chest secondary.
-- The cable lateral raise and the tricep dip are at both gyms; each was
-- tagged for one, which made them read as unavailable on the full-body day
-- they sit on.
--
-- Scoped to Tyler's user_id. Snapshots first. Idempotent.
-- TO APPLY: SQL Editor -> paste & run.

BEGIN;

INSERT INTO public.exercise_snapshots (user_id, exercise_id, reason, row_before)
SELECT e.user_id, e.id, '20261001 close grip and location tags', to_jsonb(e)
  FROM public.exercises e
 WHERE e.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND e.id IN ('import-close-grip-bench-press', 'cable-lateral-raise', 'import-tricep-dip-machine')
   AND NOT EXISTS (SELECT 1 FROM public.exercise_snapshots s
                    WHERE s.exercise_id = e.id AND s.user_id IS NOT DISTINCT FROM e.user_id
                      AND s.reason = '20261001 close grip and location tags');

UPDATE public.exercises
   SET primary_muscle_groups = ARRAY['triceps'],
       secondary_muscle_groups = ARRAY['chest'],
       updated_at = now()
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND id = 'import-close-grip-bench-press'
   AND primary_muscle_groups IS DISTINCT FROM ARRAY['triceps'];

UPDATE public.exercises
   SET location_ids = (SELECT array_agg(DISTINCT l ORDER BY l)
                         FROM unnest(coalesce(location_ids, '{}') || ARRAY['vasa-', 'gym']) AS l),
       updated_at = now()
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND id IN ('cable-lateral-raise', 'import-tricep-dip-machine')
   AND NOT (coalesce(location_ids, '{}') @> ARRAY['vasa-', 'gym']);

COMMIT;

select id, name, array_to_string(primary_muscle_groups, '+') as pri, array_to_string(location_ids, ',') as loc
  from public.exercises
 where id in ('import-close-grip-bench-press', 'cable-lateral-raise', 'import-tricep-dip-machine')
 order by id;
