-- Adds the columns the client has been writing locally but could never persist.
--
-- Why this matters:
--   `workouts.location_id` existed only in on-device storage. Pushing a workout
--   dropped it and pulling one returned nothing, so any device that restored from
--   the cloud came back with every workout's gym erased. The per-gym history
--   lookup then found no session "at this location" and told the user
--   "first time here" for exercises they do at that gym every week.
--
--   `workouts.is_deload` had the same problem: deload sessions came back looking
--   like normal ones and dragged weight suggestions down.
--
--   `exercises.is_favorite` backs the favorites feature.
--
-- The client tolerates these columns being absent (see src/services/schemaTolerance.ts)
-- and will simply stop discarding the data once this runs.
--
-- Idempotent — safe to re-run.
--
-- TO APPLY:
--   Supabase dashboard -> SQL Editor -> paste & run, then read the messages pane.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.workouts') IS NULL THEN
    RAISE NOTICE 'Skipping workouts — table does not exist';
  ELSE
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS location_id text;
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS is_deload boolean NOT NULL DEFAULT false;
    ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS skipped_exercise_ids text[] NOT NULL DEFAULT '{}';
    RAISE NOTICE 'workouts: location_id, is_deload, skipped_exercise_ids present';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.exercises') IS NULL THEN
    RAISE NOTICE 'Skipping exercises — table does not exist';
  ELSE
    ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
    RAISE NOTICE 'exercises: is_favorite present';
  END IF;
END $$;

-- Per-gym history filters sets by workout location constantly; index the lookup.
DO $$
BEGIN
  IF to_regclass('public.workouts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS workouts_user_location_idx
      ON public.workouts (user_id, location_id);
  END IF;
END $$;

COMMIT;
