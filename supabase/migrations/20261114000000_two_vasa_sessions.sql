-- Two Vasa sessions saved under Planet Fitness ('gym'): 2026-07-10 07:28 and
-- 2026-09-01 18:42 (America/Chicago). They were the only Planet Fitness
-- sessions holding Vasa-only machines (seated lateral raise, single leg knee
-- curl, barbell incline bench), which made Flex offer those at Planet Fitness.
--
-- Scoped to Tyler's user_id. Idempotent: only rows still on 'gym' move.
-- To undo, set location_id back to 'gym' on the same two ids.
-- Mirrored on the phone by storage migration V23.
-- Applied 2026-11-14.

UPDATE public.workouts
   SET location_id = 'vasa-',
       updated_at = now()
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND id IN ('9779e7bb-c7e1-4bd1-be83-1b36116672a6', 'abe63ddb-647d-4303-827c-2b89048865f0')
   AND location_id = 'gym';

select id, started_at, location_id
  from public.workouts
 where id in ('9779e7bb-c7e1-4bd1-be83-1b36116672a6', 'abe63ddb-647d-4303-827c-2b89048865f0');
