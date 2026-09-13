-- Align cloud columns with what the app writes (2026-09-13).
--
-- describe_schema showed the cloud is missing columns the sync layer has been
-- sending for months. Any upsert that includes an unknown column fails, so these
-- gaps are why exercise favourites, unilateral flags, base names, workout gyms,
-- deload flags and several settings never reached the cloud (the app tolerates
-- some of them by dropping the column and retrying; the rest just fail).
--
--   exercises      : base_name, is_favorite, is_unilateral
--   workouts       : location_id, is_deload, skipped_exercise_ids   (20260815 never applied)
--   user_settings  : units, minimum_sets_per_exercise, creatine_supplement_id
--   body_measurements: (done in 20260911000001)
--
-- Idempotent. TO APPLY: SQL Editor -> paste & run.

BEGIN;

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS base_name text;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS is_unilateral boolean NOT NULL DEFAULT false;

ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS location_id text;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS is_deload boolean NOT NULL DEFAULT false;
ALTER TABLE public.workouts ADD COLUMN IF NOT EXISTS skipped_exercise_ids text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS workouts_user_location_idx ON public.workouts (user_id, location_id);

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS units text;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS minimum_sets_per_exercise integer;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS creatine_supplement_id text;

COMMIT;

-- Verify: every row below should be present.
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (table_name, column_name) in (
     ('exercises','base_name'), ('exercises','is_favorite'), ('exercises','is_unilateral'),
     ('workouts','location_id'), ('workouts','is_deload'), ('workouts','skipped_exercise_ids'),
     ('user_settings','units'), ('user_settings','minimum_sets_per_exercise'), ('user_settings','creatine_supplement_id'))
 order by table_name, column_name;
