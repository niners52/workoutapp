-- Five days and Flex (2026-10-22). Mirrors phone migration V21.
--
-- 1. Full Body 4 is a Planet Fitness day that held two Vasa machines, matched
--    by name. On the Thursdays it ran, Tyler did the MTS row and the cable
--    lateral raise instead; those replace them. The MTS row takes the ISO
--    row's prescription (3 x 10-12).
-- 2. Day 6 stops being a scheduled day. Its template becomes the Flex pool
--    ("Flex — day 6"), and the active routine's Saturday is left open with a
--    note: Flex, at whichever gym it turns out to be.
--
-- Scoped to Tyler's user_id. Idempotent.

BEGIN;

UPDATE public.templates
   -- Swapped in place, keeping the template's order; a swap that lands on an
   -- exercise already present keeps the first occurrence only.
   SET exercise_ids = ARRAY(
         SELECT x FROM (
           SELECT x, min(ord) AS first_ord FROM (
             SELECT CASE id_
                      WHEN '083c1c85-f090-4a50-a430-19393c82d080' THEN '84b5317c-7dfb-4cf2-8b65-4f5c08e02901'
                      WHEN '558d0521-308c-418d-9f3a-40ef807cd6a9' THEN 'cable-lateral-raise'
                      ELSE id_ END AS x, ord
               FROM unnest(exercise_ids) WITH ORDINALITY AS u(id_, ord)
           ) mapped GROUP BY x
         ) deduped ORDER BY first_ord),
       updated_at = now()
 WHERE id = 'c6698cd8-af6a-4937-90be-fdb17885d8d9'
   AND user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND exercise_ids && ARRAY['083c1c85-f090-4a50-a430-19393c82d080', '558d0521-308c-418d-9f3a-40ef807cd6a9'];

UPDATE public.templates
   SET name = 'Flex — day 6', updated_at = now()
 WHERE id = 'fd7ebc8a-02c7-45ef-bd1d-04a40c427bba'
   AND user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND name IS DISTINCT FROM 'Flex — day 6';

UPDATE public.exercises
   SET target_sets = 3, target_reps = '10-12', updated_at = now()
 WHERE id = '84b5317c-7dfb-4cf2-8b65-4f5c08e02901'
   AND user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND (target_sets IS DISTINCT FROM 3 OR target_reps IS DISTINCT FROM '10-12');

UPDATE public.routines
   SET day_schedule = (
         SELECT jsonb_agg(
                  CASE WHEN (d ->> 'day')::int = 6
                       THEN d || '{"templateIds": [], "notes": "Flex — Planet Fitness or Vasa"}'::jsonb
                       ELSE d END
                  ORDER BY (d ->> 'day')::int)
           FROM jsonb_array_elements(day_schedule) d),
       updated_at = now()
 WHERE id = 'routine-1790893246393'
   AND user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5';

COMMIT;
