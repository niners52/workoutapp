-- body_measurements: make the hand-made table accept what the app writes (2026-09-12).
--
-- After 20260911000001 added the flat columns, the phone still could not upload:
-- 46 measurements sat in its queue. A table created in the dashboard commonly
-- differs from the app's rows in one of these ways, and this file fixes each,
-- idempotently, then prints the table's columns so the shape is visible.
--   1. id typed uuid — the app sends text ids ("body-…", "hk-body-2026-09-01").
--   2. type / value NOT NULL — weight rows leave both empty.
--   3. CHECK or UNIQUE constraints on type/date — the app stores several rows per date.
--   4. RLS enabled with no policies — every insert is denied.
--
-- TO APPLY: Supabase dashboard -> SQL Editor -> paste & run, then read the Messages pane.

BEGIN;

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.body_measurements') IS NULL THEN
    RAISE NOTICE 'Skipping — body_measurements does not exist';
    RETURN;
  END IF;

  -- 1. id must hold the app's text ids
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'body_measurements'
               AND column_name = 'id' AND data_type = 'uuid') THEN
    ALTER TABLE public.body_measurements ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE public.body_measurements ALTER COLUMN id TYPE text USING id::text;
    RAISE NOTICE 'id: uuid -> text';
  END IF;

  -- 2. type and value are optional (weight/body-fat rows do not use them)
  FOR r IN SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'body_measurements'
             AND column_name IN ('type', 'value', 'source', 'created_at', 'updated_at')
             AND is_nullable = 'NO' LOOP
    EXECUTE format('ALTER TABLE public.body_measurements ALTER COLUMN %I DROP NOT NULL', r.column_name);
    RAISE NOTICE 'column % is now nullable', r.column_name;
  END LOOP;

  -- 3. constraints that reject the app's rows
  FOR r IN SELECT conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
           WHERE conrelid = 'public.body_measurements'::regclass AND contype IN ('c', 'u') LOOP
    EXECUTE format('ALTER TABLE public.body_measurements DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'dropped constraint % (%)', r.conname, r.def;
  END LOOP;

  -- 4. RLS: same per-user policies the other tables have
  ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS body_measurements_select_own ON public.body_measurements;
  DROP POLICY IF EXISTS body_measurements_insert_own ON public.body_measurements;
  DROP POLICY IF EXISTS body_measurements_update_own ON public.body_measurements;
  DROP POLICY IF EXISTS body_measurements_delete_own ON public.body_measurements;
  CREATE POLICY body_measurements_select_own ON public.body_measurements FOR SELECT TO authenticated USING (auth.uid() = user_id);
  CREATE POLICY body_measurements_insert_own ON public.body_measurements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  CREATE POLICY body_measurements_update_own ON public.body_measurements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE POLICY body_measurements_delete_own ON public.body_measurements FOR DELETE TO authenticated USING (auth.uid() = user_id);
  RAISE NOTICE 'RLS policies present on body_measurements';

  -- Report the final shape
  FOR r IN SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'body_measurements'
           ORDER BY ordinal_position LOOP
    RAISE NOTICE 'column: % (%, nullable %)', r.column_name, r.data_type, r.is_nullable;
  END LOOP;
END $$;

COMMIT;
