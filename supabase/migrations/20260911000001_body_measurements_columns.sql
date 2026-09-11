-- body_measurements: add the columns the app has always written (2026-09-11).
--
-- The cloud table was created with only (type, value) plus date/source, but the
-- app's sync layer (src/services/syncService.ts syncBodyMeasurement) writes flat
-- columns: weight, body_fat_percentage, height_inches, synced_at. Every body
-- measurement upsert has therefore failed with "column does not exist" and sat in
-- the device's pending queue, and the MCP get_body_weight_log tool failed the same
-- way. Adding the columns makes both work; the queued rows flush on the next launch.
--
-- Idempotent — safe to re-run.
-- TO APPLY: Supabase dashboard -> SQL Editor -> paste & run, then read the messages pane.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.body_measurements') IS NULL THEN
    RAISE NOTICE 'Skipping body_measurements — table does not exist';
  ELSE
    ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS weight numeric;               -- lbs
    ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS body_fat_percentage numeric;  -- percent
    ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS height_inches numeric;
    ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS synced_at timestamptz;        -- HealthKit import time
    RAISE NOTICE 'body_measurements: weight, body_fat_percentage, height_inches, synced_at present';
  END IF;
END $$;

-- If earlier rows stored weight as a typed row (type = 'weight' or 'body_weight'),
-- copy them into the flat column so history is not lost.
DO $$
DECLARE n integer;
BEGIN
  IF to_regclass('public.body_measurements') IS NOT NULL THEN
    UPDATE public.body_measurements
       SET weight = value
     WHERE weight IS NULL AND value IS NOT NULL
       AND type IN ('weight', 'body_weight', 'bodyweight', 'weight_lbs');
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'body_measurements: % typed weight row(s) copied into weight', n;
  END IF;
END $$;

-- The weight log is read newest-first per user constantly.
DO $$
BEGIN
  IF to_regclass('public.body_measurements') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS body_measurements_user_date_idx
      ON public.body_measurements (user_id, date DESC);
  END IF;
END $$;

COMMIT;
