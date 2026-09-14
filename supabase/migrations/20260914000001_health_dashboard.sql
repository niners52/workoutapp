-- Health dashboard homepage (2026-09-14).
--
--   user_settings.health_targets   every target the dashboard uses (sodium budget,
--                                  calcium band, protein floor, goal weight, deload
--                                  week, focus groups, sleep target). NULL = the
--                                  app's defaults; the app writes the full object.
--   nutrition_days.last_sample_at  newest HealthKit sample that day, for the
--                                  logging-completeness tile.
--   health_reminders               "Next draws": lab / scan rechecks. due_date NULL
--                                  means due now. Rows are edited in the app.
--
-- The app tolerates all three being absent (it drops the unknown columns and
-- keeps reminders on the phone), so apply order vs. app update does not matter.
-- Idempotent. TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

BEGIN;

ALTER TABLE public.user_settings  ADD COLUMN IF NOT EXISTS health_targets jsonb;
ALTER TABLE public.nutrition_days ADD COLUMN IF NOT EXISTS last_sample_at timestamptz;

CREATE TABLE IF NOT EXISTS public.health_reminders (
  id          text        NOT NULL PRIMARY KEY,
  user_id     uuid        NOT NULL,
  title       text        NOT NULL,
  detail      text,
  due_date    date,                                -- NULL = due now
  done_at     timestamptz,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()   -- written by the app; used to merge edits
);
CREATE INDEX IF NOT EXISTS health_reminders_user_due_idx ON public.health_reminders (user_id, done_at, due_date);

ALTER TABLE public.health_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS health_reminders_select_own ON public.health_reminders;
DROP POLICY IF EXISTS health_reminders_insert_own ON public.health_reminders;
DROP POLICY IF EXISTS health_reminders_update_own ON public.health_reminders;
DROP POLICY IF EXISTS health_reminders_delete_own ON public.health_reminders;
CREATE POLICY health_reminders_select_own ON public.health_reminders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY health_reminders_insert_own ON public.health_reminders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY health_reminders_update_own ON public.health_reminders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY health_reminders_delete_own ON public.health_reminders FOR DELETE TO authenticated USING (auth.uid() = user_id);

COMMIT;

-- Results (rows, not notices):
select 'user_settings.health_targets' as what, count(*)::text as value
  from information_schema.columns where table_name = 'user_settings' and column_name = 'health_targets'
union all
select 'nutrition_days.last_sample_at', count(*)::text
  from information_schema.columns where table_name = 'nutrition_days' and column_name = 'last_sample_at'
union all
select 'health_reminders columns', count(*)::text
  from information_schema.columns where table_name = 'health_reminders';
