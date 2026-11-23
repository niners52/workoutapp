-- body_measurements: bump updated_at on every update (2026-11-23).
--
-- The other synced config tables (exercises, templates, routines,
-- workout_locations, user_settings, workouts) already run update_updated_at()
-- on UPDATE. body_measurements did not, so an edit there (an InBody scan
-- filled in from the database, say) kept its old updated_at and the phone's
-- incremental pull (src/services/configPull.ts, updated_at > last pull) never
-- saw it. Idempotent.

DROP TRIGGER IF EXISTS update_body_measurements_updated_at ON public.body_measurements;
CREATE TRIGGER update_body_measurements_updated_at
  BEFORE UPDATE ON public.body_measurements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
