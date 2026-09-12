-- workout_sets: user_id must match the parent workout (2026-09-12).
--
-- The MCP connector scopes every query by user_id. Workout c756841c… showed 12
-- sets to the connector but 13 to SQL, so at least one set carries a null or
-- different user_id and is invisible to the connector (undercounting volume and
-- PR history). This reports how many, repairs them from the parent workout, and
-- lists sets whose workout no longer exists.
--
-- Idempotent — safe to re-run. TO APPLY: SQL Editor -> paste & run -> Messages pane.

BEGIN;

DO $$
DECLARE n integer; r record;
BEGIN
  SELECT count(*) INTO n
    FROM public.workout_sets s JOIN public.workouts w ON w.id = s.workout_id
   WHERE s.user_id IS NULL OR s.user_id <> w.user_id;
  RAISE NOTICE 'sets with missing or mismatched user_id: %', n;

  FOR r IN
    UPDATE public.workout_sets s
       SET user_id = w.user_id
      FROM public.workouts w
     WHERE w.id = s.workout_id
       AND (s.user_id IS NULL OR s.user_id <> w.user_id)
    RETURNING s.id, s.workout_id, s.exercise_id, s.logged_at
  LOOP
    RAISE NOTICE 'repaired set % (workout %, exercise %, %)', r.id, r.workout_id, r.exercise_id, r.logged_at;
  END LOOP;

  SELECT count(*) INTO n
    FROM public.workout_sets s
   WHERE NOT EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = s.workout_id);
  RAISE NOTICE 'orphan sets (workout missing): % — left in place; tell Claude if this is not 0', n;

  SELECT count(*) INTO n FROM public.workout_sets WHERE user_id IS NULL;
  RAISE NOTICE 'sets still without user_id: %', n;
END $$;

COMMIT;
