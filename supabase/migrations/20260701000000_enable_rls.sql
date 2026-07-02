-- Row-Level Security migration for WorkoutTracker
--
-- Applies the data-separation policy described in the build brief:
--   - Per-user tables: each user can only see/modify their own rows
--     (auth.uid() = user_id).
--   - Shared tables (partnership + game tier): both participants can read
--     each other's rows, but NOT the underlying private workout/set data.
--
-- The file is idempotent — DROP POLICY IF EXISTS guards every CREATE so
-- it's safe to re-run.
--
-- TO APPLY:
--   Supabase dashboard → SQL Editor → paste & run
--   OR: psql "$DATABASE_URL" -f supabase/migrations/20260701000000_enable_rls.sql
--
-- ASSUMPTIONS:
--   - Tables are named per the existing sync/challenge code: exercises,
--     templates, workouts, workout_sets, locations, supplements,
--     supplement_intakes, routines, body_measurements, exercise_swaps,
--     user_settings, profiles, partnerships, partner_stats, invite_codes,
--     challenges.
--   - Each per-user table has a `user_id uuid` column referencing auth.users(id).
--   - workout_sets does NOT have user_id directly — access is granted via
--     the parent workout row.
--   - partnerships has columns: user_id_1, user_id_2, status.
--   - partner_stats keys by user_id (single row per user).
--   - invite_codes has user_id (creator) + used_by columns.
--   - challenges has partnership_id; access is granted via the parent partnership.
--
-- If a table doesn't exist yet in your Supabase project, the ENABLE/POLICY
-- lines for it will error — comment that table's block out and re-run.

BEGIN;

-- ─── HELPER: shared check for partnership membership ─────────────────────────
--
-- Used by partner_stats / challenges policies so the SQL stays declarative.
-- Marked STABLE because partnership membership doesn't change inside a
-- statement, which lets Postgres cache the result per row scan.

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

-- ─── PER-USER PRIVATE TABLES ─────────────────────────────────────────────────
--
-- Pattern: enable RLS + four policies (SELECT/INSERT/UPDATE/DELETE) all
-- scoped to auth.uid() = user_id. Loop unrolled because Postgres has no
-- "do this for every table" syntax that's clean to read.

-- exercises
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercises_select_own ON exercises;
DROP POLICY IF EXISTS exercises_insert_own ON exercises;
DROP POLICY IF EXISTS exercises_update_own ON exercises;
DROP POLICY IF EXISTS exercises_delete_own ON exercises;
CREATE POLICY exercises_select_own ON exercises FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY exercises_insert_own ON exercises FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY exercises_update_own ON exercises FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY exercises_delete_own ON exercises FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- templates
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS templates_select_own ON templates;
DROP POLICY IF EXISTS templates_insert_own ON templates;
DROP POLICY IF EXISTS templates_update_own ON templates;
DROP POLICY IF EXISTS templates_delete_own ON templates;
CREATE POLICY templates_select_own ON templates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY templates_insert_own ON templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY templates_update_own ON templates FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY templates_delete_own ON templates FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- workouts
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workouts_select_own ON workouts;
DROP POLICY IF EXISTS workouts_insert_own ON workouts;
DROP POLICY IF EXISTS workouts_update_own ON workouts;
DROP POLICY IF EXISTS workouts_delete_own ON workouts;
CREATE POLICY workouts_select_own ON workouts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY workouts_insert_own ON workouts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY workouts_update_own ON workouts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY workouts_delete_own ON workouts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- workout_sets — no user_id column; access granted via parent workout
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workout_sets_select_via_workout ON workout_sets;
DROP POLICY IF EXISTS workout_sets_insert_via_workout ON workout_sets;
DROP POLICY IF EXISTS workout_sets_update_via_workout ON workout_sets;
DROP POLICY IF EXISTS workout_sets_delete_via_workout ON workout_sets;
CREATE POLICY workout_sets_select_via_workout ON workout_sets FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
);
CREATE POLICY workout_sets_insert_via_workout ON workout_sets FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
);
CREATE POLICY workout_sets_update_via_workout ON workout_sets FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
);
CREATE POLICY workout_sets_delete_via_workout ON workout_sets FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM workouts w WHERE w.id = workout_sets.workout_id AND w.user_id = auth.uid())
);

-- locations
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS locations_select_own ON locations;
DROP POLICY IF EXISTS locations_insert_own ON locations;
DROP POLICY IF EXISTS locations_update_own ON locations;
DROP POLICY IF EXISTS locations_delete_own ON locations;
CREATE POLICY locations_select_own ON locations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY locations_insert_own ON locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY locations_update_own ON locations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY locations_delete_own ON locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- supplements
ALTER TABLE supplements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplements_select_own ON supplements;
DROP POLICY IF EXISTS supplements_insert_own ON supplements;
DROP POLICY IF EXISTS supplements_update_own ON supplements;
DROP POLICY IF EXISTS supplements_delete_own ON supplements;
CREATE POLICY supplements_select_own ON supplements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY supplements_insert_own ON supplements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY supplements_update_own ON supplements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY supplements_delete_own ON supplements FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- supplement_intakes
ALTER TABLE supplement_intakes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplement_intakes_select_own ON supplement_intakes;
DROP POLICY IF EXISTS supplement_intakes_insert_own ON supplement_intakes;
DROP POLICY IF EXISTS supplement_intakes_update_own ON supplement_intakes;
DROP POLICY IF EXISTS supplement_intakes_delete_own ON supplement_intakes;
CREATE POLICY supplement_intakes_select_own ON supplement_intakes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY supplement_intakes_insert_own ON supplement_intakes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY supplement_intakes_update_own ON supplement_intakes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY supplement_intakes_delete_own ON supplement_intakes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- routines (the Program/Routine entity)
ALTER TABLE routines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS routines_select_own ON routines;
DROP POLICY IF EXISTS routines_insert_own ON routines;
DROP POLICY IF EXISTS routines_update_own ON routines;
DROP POLICY IF EXISTS routines_delete_own ON routines;
CREATE POLICY routines_select_own ON routines FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY routines_insert_own ON routines FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY routines_update_own ON routines FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY routines_delete_own ON routines FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- body_measurements
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_measurements_select_own ON body_measurements;
DROP POLICY IF EXISTS body_measurements_insert_own ON body_measurements;
DROP POLICY IF EXISTS body_measurements_update_own ON body_measurements;
DROP POLICY IF EXISTS body_measurements_delete_own ON body_measurements;
CREATE POLICY body_measurements_select_own ON body_measurements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY body_measurements_insert_own ON body_measurements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY body_measurements_update_own ON body_measurements FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY body_measurements_delete_own ON body_measurements FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- exercise_swaps
ALTER TABLE exercise_swaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercise_swaps_select_own ON exercise_swaps;
DROP POLICY IF EXISTS exercise_swaps_insert_own ON exercise_swaps;
DROP POLICY IF EXISTS exercise_swaps_update_own ON exercise_swaps;
DROP POLICY IF EXISTS exercise_swaps_delete_own ON exercise_swaps;
CREATE POLICY exercise_swaps_select_own ON exercise_swaps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY exercise_swaps_insert_own ON exercise_swaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY exercise_swaps_update_own ON exercise_swaps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY exercise_swaps_delete_own ON exercise_swaps FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_settings — primary key is user_id (one row per user)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_settings_select_own ON user_settings;
DROP POLICY IF EXISTS user_settings_insert_own ON user_settings;
DROP POLICY IF EXISTS user_settings_update_own ON user_settings;
DROP POLICY IF EXISTS user_settings_delete_own ON user_settings;
CREATE POLICY user_settings_select_own ON user_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_settings_insert_own ON user_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_settings_update_own ON user_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_settings_delete_own ON user_settings FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ─── SHARED / GAME-TIER TABLES ───────────────────────────────────────────────
--
-- profiles: display name + avatar. Readable by anyone authenticated (they're
-- shown to partners when accepting invites and on the social tab). Writable
-- only by the owner.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select_all ON profiles;
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_select_all ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_insert_own ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- invite_codes: creator can see/modify their own. Other users need SELECT
-- access to UNUSED codes so they can validate before accepting.
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invite_codes_select_own_or_unused ON invite_codes;
DROP POLICY IF EXISTS invite_codes_insert_own ON invite_codes;
DROP POLICY IF EXISTS invite_codes_update_accept ON invite_codes;
DROP POLICY IF EXISTS invite_codes_delete_own ON invite_codes;
CREATE POLICY invite_codes_select_own_or_unused ON invite_codes FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR (used_by IS NULL AND expires_at > now())
);
CREATE POLICY invite_codes_insert_own ON invite_codes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- UPDATE allowed to: (a) creator (e.g., to delete/regenerate), or (b) any
-- authenticated user accepting the code (sets used_by = auth.uid()).
CREATE POLICY invite_codes_update_accept ON invite_codes FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR used_by IS NULL)
  WITH CHECK (user_id = auth.uid() OR used_by = auth.uid());
CREATE POLICY invite_codes_delete_own ON invite_codes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- partnerships: both members can see their row.
ALTER TABLE partnerships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partnerships_select_member ON partnerships;
DROP POLICY IF EXISTS partnerships_insert_self_initiated ON partnerships;
DROP POLICY IF EXISTS partnerships_update_member ON partnerships;
CREATE POLICY partnerships_select_member ON partnerships FOR SELECT TO authenticated USING (
  user_id_1 = auth.uid() OR user_id_2 = auth.uid()
);
CREATE POLICY partnerships_insert_self_initiated ON partnerships FOR INSERT TO authenticated WITH CHECK (
  initiated_by = auth.uid() AND (user_id_1 = auth.uid() OR user_id_2 = auth.uid())
);
CREATE POLICY partnerships_update_member ON partnerships FOR UPDATE TO authenticated USING (
  user_id_1 = auth.uid() OR user_id_2 = auth.uid()
) WITH CHECK (
  user_id_1 = auth.uid() OR user_id_2 = auth.uid()
);

-- partner_stats: visible to self + active partners (helper function).
ALTER TABLE partner_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_stats_select_self_or_partner ON partner_stats;
DROP POLICY IF EXISTS partner_stats_insert_own ON partner_stats;
DROP POLICY IF EXISTS partner_stats_update_own ON partner_stats;
CREATE POLICY partner_stats_select_self_or_partner ON partner_stats FOR SELECT TO authenticated USING (
  public.users_share_active_partnership(user_id)
);
CREATE POLICY partner_stats_insert_own ON partner_stats FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY partner_stats_update_own ON partner_stats FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- challenges: visible to both partnership members; either can create/update.
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS challenges_select_via_partnership ON challenges;
DROP POLICY IF EXISTS challenges_insert_via_partnership ON challenges;
DROP POLICY IF EXISTS challenges_update_via_partnership ON challenges;
DROP POLICY IF EXISTS challenges_delete_via_partnership ON challenges;
CREATE POLICY challenges_select_via_partnership ON challenges FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM partnerships p
    WHERE p.id = challenges.partnership_id
      AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
  )
);
CREATE POLICY challenges_insert_via_partnership ON challenges FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM partnerships p
    WHERE p.id = challenges.partnership_id
      AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
  )
);
CREATE POLICY challenges_update_via_partnership ON challenges FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM partnerships p
    WHERE p.id = challenges.partnership_id
      AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
  )
);
CREATE POLICY challenges_delete_via_partnership ON challenges FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM partnerships p
    WHERE p.id = challenges.partnership_id
      AND (p.user_id_1 = auth.uid() OR p.user_id_2 = auth.uid())
  )
);

COMMIT;

-- ─── SMOKE TESTS ─────────────────────────────────────────────────────────────
-- Run these after applying to confirm policies behave correctly. Replace
-- '<user-a>' and '<user-b>' with two real auth.users IDs.
--
-- 1. As user A, you should see only your own workouts:
--      SET request.jwt.claim.sub = '<user-a>';
--      SELECT count(*) FROM workouts;
--
-- 2. As user A, querying another user's private data returns 0 rows:
--      SELECT * FROM workouts WHERE user_id = '<user-b>';
--
-- 3. As user A (with an active partnership to B), you can read B's stats:
--      SELECT * FROM partner_stats WHERE user_id = '<user-b>';
--
-- 4. As user C (no partnership), querying B's stats returns 0 rows:
--      SET request.jwt.claim.sub = '<user-c>';
--      SELECT * FROM partner_stats WHERE user_id = '<user-b>';
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- To disable RLS again (e.g., for debugging):
--   ALTER TABLE workouts DISABLE ROW LEVEL SECURITY;
--   -- ... repeat for each table
-- Or drop the policies individually with DROP POLICY ... ON <table>.
