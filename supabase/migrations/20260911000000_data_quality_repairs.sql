-- Data-quality repairs for the cloud copy of the data (2026-09-11).
--
-- The phone is the source of truth and only pushes changes, so the app's local
-- migration V14 (src/services/storage.ts) makes the same corrections on-device
-- and re-syncs the rows it touched. This file brings the cloud into line now,
-- so the MCP connector is right before the phone next launches, and adds the
-- server-side auto-close for abandoned sessions, which cannot depend on a device.
--
-- Idempotent — safe to re-run. Read the Messages pane after running: every block
-- reports what it changed.
--
-- TO APPLY: Supabase dashboard -> SQL Editor -> paste & run.

BEGIN;

-- ─── exercises.is_bodyweight ─────────────────────────────────────────────────
-- Explicit flag; defaults from equipment. PR math on the server adds body
-- weight to these exercises at read time.
DO $$
DECLARE n integer;
BEGIN
  ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_bodyweight boolean NOT NULL DEFAULT false;
  UPDATE public.exercises SET is_bodyweight = true
    WHERE equipment = 'bodyweight' AND is_bodyweight = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'exercises.is_bodyweight: flagged % bodyweight exercise(s)', n;
END $$;

-- ─── rear_delts -> upper_back (app migration V10 never reached the cloud) ────
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.exercises
     SET primary_muscle_groups = (
           SELECT array_agg(DISTINCT g ORDER BY g)
             FROM unnest(array_replace(primary_muscle_groups, 'rear_delts', 'upper_back')) AS g
         ),
         secondary_muscle_groups = (
           SELECT COALESCE(array_agg(DISTINCT g ORDER BY g), '{}')
             FROM unnest(array_replace(secondary_muscle_groups, 'rear_delts', 'upper_back')) AS g
         )
   WHERE 'rear_delts' = ANY(primary_muscle_groups)
      OR 'rear_delts' = ANY(secondary_muscle_groups);
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'rear_delts -> upper_back: % exercise(s) rewritten', n;
END $$;

-- ─── Hip machines: names were crossed with the movement ──────────────────────
-- Push-out is abduction (glutes); push-in is adduction (adductors).
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.exercises
     SET name = 'Hip Abduction (push out)',
         primary_muscle_groups = '{glutes}'
   WHERE id = 'import-hip-adduction'
     AND (name <> 'Hip Abduction (push out)' OR primary_muscle_groups <> '{glutes}');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'import-hip-adduction -> Hip Abduction (push out) / glutes: % row(s)', n;

  UPDATE public.exercises
     SET name = 'Hip Adduction (push in)',
         primary_muscle_groups = '{adductors}'
   WHERE id = 'hip-abduction-machine'
     AND (name <> 'Hip Adduction (push in)' OR primary_muscle_groups <> '{adductors}');
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'hip-abduction-machine -> Hip Adduction (push in) / adductors: % row(s)', n;
END $$;

-- ─── "Leg press machine": four primaries meant 4x volume credit per set ──────
DO $$
DECLARE n integer;
BEGIN
  UPDATE public.exercises
     SET primary_muscle_groups = '{quads}',
         secondary_muscle_groups = '{hamstrings,glutes,calves}'
   WHERE id = '29bcb169-528c-4f61-910f-66d52c1d6fd1'
     AND primary_muscle_groups <> '{quads}';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Leg press machine -> quads primary only: % row(s)', n;
END $$;

-- ─── Repair: workouts "finished" hours after their last set ──────────────────
-- Sets completed_at to the last set's logged_at when it trails by > 3 hours.
DO $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    UPDATE public.workouts w
       SET completed_at = s.last_logged
      FROM (SELECT workout_id, max(logged_at) AS last_logged
              FROM public.workout_sets GROUP BY workout_id) s
     WHERE s.workout_id = w.id
       AND w.completed_at IS NOT NULL
       AND w.completed_at - s.last_logged > interval '3 hours'
       AND s.last_logged > w.started_at
    RETURNING w.id, w.started_at, s.last_logged AS new_completed_at,
              round(extract(epoch FROM (s.last_logged - w.started_at)) / 60) AS new_duration_min
  LOOP
    n := n + 1;
    RAISE NOTICE 'workout % started % -> completed_at now % (% min)',
      r.id, r.started_at, r.new_completed_at, r.new_duration_min;
  END LOOP;
  RAISE NOTICE 'stale completed_at repaired on % workout(s)', n;
END $$;

-- ─── Prevention: close sessions left open, independent of any device ─────────
CREATE OR REPLACE FUNCTION public.close_stale_workouts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  -- Open sessions whose last set is older than 3 hours end at that set.
  UPDATE public.workouts w
     SET completed_at = s.last_logged
    FROM (SELECT workout_id, max(logged_at) AS last_logged
            FROM public.workout_sets GROUP BY workout_id) s
   WHERE s.workout_id = w.id
     AND w.completed_at IS NULL
     AND s.last_logged < now() - interval '3 hours';
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Open sessions with no sets at all, started more than 3 hours ago.
  UPDATE public.workouts w
     SET completed_at = w.started_at
   WHERE w.completed_at IS NULL
     AND w.started_at < now() - interval '3 hours'
     AND NOT EXISTS (SELECT 1 FROM public.workout_sets s WHERE s.workout_id = w.id);
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.close_stale_workouts() FROM PUBLIC;

-- Hourly schedule via pg_cron. If this block warns that pg_cron is unavailable,
-- enable it once under Database -> Extensions in the dashboard and re-run.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule('close-stale-workouts')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-stale-workouts');
  PERFORM cron.schedule('close-stale-workouts', '17 * * * *', $job$SELECT public.close_stale_workouts()$job$);
  RAISE NOTICE 'pg_cron job close-stale-workouts scheduled hourly';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron schedule NOT installed — %. Enable the pg_cron extension and re-run this file.', SQLERRM;
END $$;

-- Run once now so anything currently abandoned is closed immediately.
DO $$
DECLARE n integer;
BEGIN
  n := public.close_stale_workouts();
  RAISE NOTICE 'close_stale_workouts(): closed % open session(s) now', n;
END $$;

COMMIT;
