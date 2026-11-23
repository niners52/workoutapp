-- Health metrics, InBody detail, goals and pain log (2026-11-23).
--
-- 1. daily_health_metrics: one row per user per local day from Apple Health
--    (VO2 max, resting HR, HRV SDNN daily average, steps, active energy,
--    blood pressure). Written by src/services/healthMetricsSync.ts, keyed
--    hk-day-YYYY-MM-DD, upserted on (user_id, date) like sleep_nights.
-- 2. workout_hr_zones: one row per Apple Health workout: duration and minutes
--    in heart-rate zones Z1-Z5 (50/60/70/80/90 % of max HR). workout_id is the
--    app workout it overlaps, when there is one.
-- 3. body_measurements gains InBody columns and scan_type.
-- 4. goals: weight band, measurement and lift goals. Seeded for Tyler.
-- 5. pain_log: area, side, score 0-10, note.
-- 6. Today's InBody scan replaces the manual 2026-11-23 entry.
--
-- RLS on every new table matches body_measurements: authenticated users
-- select / insert / update / delete their own rows. Seeds and the scan are
-- scoped to Tyler's user_id. Idempotent.

BEGIN;

-- ─── 1. daily_health_metrics ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_health_metrics (
  id                  text        NOT NULL,              -- hk-day-YYYY-MM-DD
  user_id             uuid        NOT NULL,
  date                text        NOT NULL,              -- device-local day
  vo2_max             numeric,                           -- mL/(kg·min), latest sample that day
  resting_hr          numeric,                           -- bpm
  hrv_sdnn_ms         numeric,                           -- daily average
  steps               integer,                           -- daily total
  active_energy_kcal  numeric,                           -- daily total
  bp_systolic         numeric,                           -- mmHg, last reading that day
  bp_diastolic        numeric,
  source              text        NOT NULL DEFAULT 'healthkit',
  synced_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, date)
);

-- ─── 2. workout_hr_zones ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_hr_zones (
  id             text        NOT NULL,                   -- hk-zones-<HealthKit workout uuid>
  user_id        uuid        NOT NULL,
  hk_workout_id  text        NOT NULL,
  workout_id     text,                                   -- the app workout it overlaps, if any
  activity_name  text,
  start_at       timestamptz NOT NULL,
  end_at         timestamptz NOT NULL,
  duration_min   numeric     NOT NULL,
  max_hr_used    integer     NOT NULL,                   -- the max HR the zones were cut from
  avg_hr         numeric,
  peak_hr        numeric,
  z1_min         numeric     NOT NULL DEFAULT 0,          -- 50-60 % of max HR
  z2_min         numeric     NOT NULL DEFAULT 0,          -- 60-70 %
  z3_min         numeric     NOT NULL DEFAULT 0,          -- 70-80 %
  z4_min         numeric     NOT NULL DEFAULT 0,          -- 80-90 %
  z5_min         numeric     NOT NULL DEFAULT 0,          -- 90 % and up
  sample_count   integer     NOT NULL DEFAULT 0,
  synced_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, hk_workout_id)
);
CREATE INDEX IF NOT EXISTS workout_hr_zones_user_start_idx ON public.workout_hr_zones (user_id, start_at DESC);

-- ─── 3. body_measurements: InBody ───────────────────────────────────────────
ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS skeletal_muscle_lbs numeric;
ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS lean_mass_lbs numeric;
ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS visceral_fat_area numeric;   -- cm²
ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS ecw_tbw numeric;             -- ratio, e.g. 0.383
ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS phase_angle numeric;         -- degrees
ALTER TABLE public.body_measurements ADD COLUMN IF NOT EXISTS scan_type text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'body_measurements_scan_type_check') THEN
    ALTER TABLE public.body_measurements
      ADD CONSTRAINT body_measurements_scan_type_check
      CHECK (scan_type IS NULL OR scan_type IN ('inbody', 'dexa', 'scale'));
  END IF;
END $$;

-- ─── 4. goals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id           text        NOT NULL,
  user_id      uuid        NOT NULL,
  type         text        NOT NULL CHECK (type IN ('weight_band', 'measurement', 'lift')),
  metric_key   text        NOT NULL,     -- 'weight' | a measurement type ('arms' = both arms) | an exercise id
  label        text        NOT NULL,
  target       numeric     NOT NULL,     -- band low, measurement target, or lift weight (lbs; added weight for bodyweight lifts)
  target_max   numeric,                  -- band high
  target_reps  integer,                  -- lift reps
  direction    text        NOT NULL DEFAULT 'at_least' CHECK (direction IN ('at_least', 'at_most', 'band')),
  target_date  date,
  sort_order   integer     NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ─── 5. pain_log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pain_log (
  id          text        NOT NULL,
  user_id     uuid        NOT NULL,
  date        text        NOT NULL,      -- 'YYYY-MM-DD'
  area        text        NOT NULL,      -- neck, shoulder, elbow, wrist, upper_back, lower_back, hip, knee, ankle, chest, other
  side        text        NOT NULL DEFAULT 'both' CHECK (side IN ('left', 'right', 'both')),
  score       integer     NOT NULL CHECK (score BETWEEN 0 AND 10),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS pain_log_user_date_idx ON public.pain_log (user_id, date DESC);

-- ─── RLS, as on body_measurements ───────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_health_metrics', 'workout_hr_zones', 'goals', 'pain_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t || '_select_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t || '_insert_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t || '_update_own', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t || '_delete_own', t);
  END LOOP;
END $$;

-- ─── Seed Tyler's goals ─────────────────────────────────────────────────────
INSERT INTO public.goals (id, user_id, type, metric_key, label, target, target_max, target_reps, direction, sort_order) VALUES
  ('goal-weight-band',     '9e957b0f-2f11-408a-9504-b5215049cbb5', 'weight_band', 'weight',       'Body weight',                  175,  179,  NULL, 'band',     0),
  ('goal-shoulders',       '9e957b0f-2f11-408a-9504-b5215049cbb5', 'measurement', 'shoulders',    'Shoulders',                    50,   NULL, NULL, 'at_least', 10),
  ('goal-chest',           '9e957b0f-2f11-408a-9504-b5215049cbb5', 'measurement', 'chest',        'Chest',                        44,   NULL, NULL, 'at_least', 11),
  ('goal-arms',            '9e957b0f-2f11-408a-9504-b5215049cbb5', 'measurement', 'arms',         'Arms',                         15.5, NULL, NULL, 'at_least', 12),
  ('goal-waist-narrow',    '9e957b0f-2f11-408a-9504-b5215049cbb5', 'measurement', 'waist_narrow', 'Waist (narrowest)',            36,   NULL, NULL, 'at_most',  13),
  ('goal-incline',         '9e957b0f-2f11-408a-9504-b5215049cbb5', 'lift',        'plate-loaded-incline-press',  'Plate-Loaded Incline',  300, NULL, 6,  'at_least', 20),
  ('goal-pullup',          '9e957b0f-2f11-408a-9504-b5215049cbb5', 'lift',        'import-pullup',               'Pull-Up (+ added)',     25,  NULL, 8,  'at_least', 21),
  ('goal-chest-row',       '9e957b0f-2f11-408a-9504-b5215049cbb5', 'lift',        'chest-supported-machine-row', 'Chest-Supported Row',   180, NULL, 8,  'at_least', 22),
  ('goal-lateral-raise',   '9e957b0f-2f11-408a-9504-b5215049cbb5', 'lift',        'cable-lateral-raise',         'Cable Lateral Raise',   35,  NULL, 12, 'at_least', 23)
ON CONFLICT (id) DO NOTHING;

-- ─── Today's InBody scan replaces the manual 2026-11-23 entry ───────────────
UPDATE public.body_measurements
   SET weight = 181.5,
       body_fat_percentage = 9.0,
       skeletal_muscle_lbs = 93.3,
       lean_mass_lbs = 165.1,
       visceral_fat_area = 33.5,
       ecw_tbw = 0.383,
       phase_angle = 6.5,
       scan_type = 'inbody',
       source = 'manual',
       updated_at = now()
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND id = 'manual-body-2026-11-23-inbody';

COMMIT;

-- Results:
SELECT id, date, weight, body_fat_percentage, skeletal_muscle_lbs, lean_mass_lbs, visceral_fat_area, ecw_tbw, phase_angle, scan_type
  FROM public.body_measurements
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5' AND date = '2026-11-23';
SELECT label, type, target, target_max, target_reps, direction FROM public.goals
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5' ORDER BY sort_order;
