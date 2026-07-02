-- Row-Level Security migration for WorkoutTracker (v2 — self-guarding)
--
-- Applies the data-separation policy:
--   - Per-user tables: each user can only see/modify their own rows
--     (auth.uid() = user_id).
--   - Shared tables (partnership + game tier): both participants can read
--     each other's rows, but NOT the underlying private workout/set data.
--
-- v2 changes:
--   - Every table block first checks the table EXISTS (to_regclass) and skips
--     with a NOTICE when it doesn't — no more "relation does not exist" errors.
--   - 'locations' corrected to 'workout_locations' (the name the app's sync
--     code actually writes to).
--   - 'exercise_swaps' removed — swaps are local-only, there is no Supabase
--     table for them.
--
-- The file is idempotent — safe to re-run any number of times.
--
-- TO APPLY:
--   Supabase dashboard → SQL Editor → paste & run.
--   Watch the "Messages"/output pane: any skipped table prints a NOTICE like
--   "Skipping body_measurements — table does not exist". That's informational,
--   not an error.

BEGIN;

-- ─── HELPER: shared check for partnership membership ─────────────────────────
-- Used by partner_stats / challenges policies. SECURITY DEFINER so the check
-- can read partnerships regardless of the caller's own RLS visibility.
-- Created without body validation in case partnerships doesn't exist yet.

SET LOCAL check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.users_share_active_partnership(other_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM partnerships
    WHERE status = 'active'
      AND (
        (user_id_1 = auth.uid() AND user_id_2 = other_user)
        OR (user_id_2 = auth.uid() AND user_id_1 = other_user)
        OR other_user = auth.uid()  -- always allow self
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.users_share_active_partnership(uuid) TO authenticated;

-- ─── PER-USER PRIVATE TABLES (standard user_id pattern) ──────────────────────
-- One loop applies the same four policies to every table that (a) exists and
-- (b) keys privacy on a user_id column. Missing tables are skipped with a NOTICE.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'exercises',
    'templates',
    'workouts',
    'workout_locations',
    'supplements',
    'supplement_intakes',
    'routines',
    'body_measurements',
    'user_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Skipping % — table does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
      t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
      t || '_insert_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_update_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)',
      t || '_delete_own', t);

    RAISE NOTICE 'RLS enabled on %', t;
  END LOOP;
END $$;

-- ─── workout_sets — no user_id column; access via parent workout ─────────────

DO $$
BEGIN
  IF to_regclass('public.workout_sets') IS NULL THEN
    RAISE NOTICE 'Skipping workout_sets — table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS workout_sets_select_via_workout ON public.workout_sets';
  EXECUTE 'DROP POLICY IF EXISTS workout_sets_insert_via_workout ON public.workout_sets';
  EXECUTE 'DROP POLICY IF EXISTS workout_sets_update_via_workout ON public.workout_sets';
  EXECUTE 'DROP POLICY IF EXISTS workout_sets_delete_via_workout ON public.workout_sets';

  EXECUTE $pol$CREATE POLICY workout_sets_select_via_workout ON public.workout_sets FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
  )$pol$;
  EXECUTE $pol$CREATE POLICY workout_sets_insert_via_workout ON public.workout_sets FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
  )$pol$;
  EXECUTE $pol$CREATE POLICY workout_sets_update_via_workout ON public.workout_sets FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
  )$pol$;
  EXECUTE $pol$CREATE POLICY workout_sets_delete_via_workout ON public.workout_sets FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
  )$pol$;

  RAISE NOTICE 'RLS enabled on workout_sets';
END $$;

-- ─── profiles — readable by all authenticated, writable by owner ─────────────

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'Skipping profiles — table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS profiles_select_all ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS profiles_insert_own ON public.profiles';
  EXECUTE 'DROP POLICY IF EXISTS profiles_update_own ON public.profiles';

  EXECUTE 'CREATE POLICY profiles_select_all ON public.profiles FOR SELECT TO authenticated USING (true)';
  EXECUTE 'CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';

  RAISE NOTICE 'RLS enabled on profiles';
END $$;

-- ─── invite_codes — creator owns; others can validate unused codes ───────────

DO $$
BEGIN
  IF to_regclass('public.invite_codes') IS NULL THEN
    RAISE NOTICE 'Skipping invite_codes — table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS invite_codes_select_own_or_unused ON public.invite_codes';
  EXECUTE 'DROP POLICY IF EXISTS invite_codes_insert_own ON public.invite_codes';
  EXECUTE 'DROP POLICY IF EXISTS invite_codes_update_accept ON public.invite_codes';
  EXECUTE 'DROP POLICY IF EXISTS invite_codes_delete_own ON public.invite_codes';

  EXECUTE $pol$CREATE POLICY invite_codes_select_own_or_unused ON public.invite_codes FOR SELECT TO authenticated USING (
    user_id = auth.uid() OR (used_by IS NULL AND expires_at > now())
  )$pol$;
  EXECUTE 'CREATE POLICY invite_codes_insert_own ON public.invite_codes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  -- UPDATE allowed to: (a) creator, or (b) any authenticated user accepting
  -- the code (sets used_by = auth.uid()).
  EXECUTE $pol$CREATE POLICY invite_codes_update_accept ON public.invite_codes FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR used_by IS NULL)
    WITH CHECK (user_id = auth.uid() OR used_by = auth.uid())$pol$;
  EXECUTE 'CREATE POLICY invite_codes_delete_own ON public.invite_codes FOR DELETE TO authenticated USING (auth.uid() = user_id)';

  RAISE NOTICE 'RLS enabled on invite_codes';
END $$;

-- ─── partnerships — both members can see/update their row ────────────────────

DO $$
BEGIN
  IF to_regclass('public.partnerships') IS NULL THEN
    RAISE NOTICE 'Skipping partnerships — table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS partnerships_select_member ON public.partnerships';
  EXECUTE 'DROP POLICY IF EXISTS partnerships_insert_self_initiated ON public.partnerships';
  EXECUTE 'DROP POLICY IF EXISTS partnerships_update_member ON public.partnerships';

  EXECUTE $pol$CREATE POLICY partnerships_select_member ON public.partnerships FOR SELECT TO authenticated USING (
    user_id_1 = auth.uid() OR user_id_2 = auth.uid()
  )$pol$;
  EXECUTE $pol$CREATE POLICY partnerships_insert_self_initiated ON public.partnerships FOR INSERT TO authenticated WITH CHECK (
    initiated_by = auth.uid() AND (user_id_1 = auth.uid() OR user_id_2 = auth.uid())
  )$pol$;
  EXECUTE $pol$CREATE POLICY partnerships_update_member ON public.partnerships FOR UPDATE TO authenticated USING (
    user_id_1 = auth.uid() OR user_id_2 = auth.uid()
  ) WITH CHECK (
    user_id_1 = auth.uid() OR user_id_2 = auth.uid()
  )$pol$;

  RAISE NOTICE 'RLS enabled on partnerships';
END $$;

-- ─── partner_stats — visible to self + active partner ────────────────────────

DO $$
BEGIN
  IF to_regclass('public.partner_stats') IS NULL THEN
    RAISE NOTICE 'Skipping partner_stats — table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.partner_stats ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS partner_stats_select_self_or_partner ON public.partner_stats';
  EXECUTE 'DROP POLICY IF EXISTS partner_stats_insert_own ON public.partner_stats';
  EXECUTE 'DROP POLICY IF EXISTS partner_stats_update_own ON public.partner_stats';

  EXECUTE $pol$CREATE POLICY partner_stats_select_self_or_partner ON public.partner_stats FOR SELECT TO authenticated USING (
    public.users_share_active_partnership(user_id)
  )$pol$;
  EXECUTE 'CREATE POLICY partner_stats_insert_own ON public.partner_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  EXECUTE 'CREATE POLICY partner_stats_update_own ON public.partner_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';

  RAISE NOTICE 'RLS enabled on partner_stats';
END $$;

-- ─── challenges — visible to both partnership members ────────────────────────

DO $$
BEGIN
  IF to_regclass('public.challenges') IS NULL THEN
    RAISE NOTICE 'Skipping challenges — table does not exist';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS challenges_select_via_partnership ON public.challenges';
  EXECUTE 'DROP POLICY IF EXISTS challenges_insert_via_partnership ON public.challenges';
  EXECUTE 'DROP POLICY IF EXISTS challenges_update_via_partnership ON public.challenges';
  EXECUTE 'DROP POLICY IF EXISTS challenges_delete_via_partnership ON public.challenges';

  EXECUTE $pol$CREATE POLICY challenges_select_via_partnership ON public.challenges FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = challenges.partnership_id
        AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
    )
  )$pol$;
  EXECUTE $pol$CREATE POLICY challenges_insert_via_partnership ON public.challenges FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = challenges.partnership_id
        AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
    )
  )$pol$;
  EXECUTE $pol$CREATE POLICY challenges_update_via_partnership ON public.challenges FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = challenges.partnership_id
        AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
    )
  )$pol$;
  EXECUTE $pol$CREATE POLICY challenges_delete_via_partnership ON public.challenges FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.partnerships p
      WHERE p.id = challenges.partnership_id
        AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
    )
  )$pol$;

  RAISE NOTICE 'RLS enabled on challenges';
END $$;

COMMIT;

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
-- After running, this query lists every table with RLS on and its policy count:
--
--   SELECT c.relname AS table_name,
--          c.relrowsecurity AS rls_enabled,
--          count(p.polname) AS policies
--   FROM pg_class c
--   LEFT JOIN pg_policy p ON p.polrelid = c.oid
--   JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relkind = 'r'
--   GROUP BY c.relname, c.relrowsecurity
--   ORDER BY c.relname;
--
-- Every table your app syncs should show rls_enabled = true with 3-4 policies.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- To disable RLS on a table (e.g., for debugging):
--   ALTER TABLE public.workouts DISABLE ROW LEVEL SECURITY;
