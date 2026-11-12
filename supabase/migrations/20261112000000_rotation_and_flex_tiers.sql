-- Weekday programs become rotations; Flex gets muscle tiers and a length (2026-11-12).
-- Mirrors phone migration V22 (src/services/storage.ts) and
-- rotationFromWeekdays in mcp-server/src/shared/weekPlan.ts.
--
-- 1. routines.rotation (jsonb, nullable): { slots: [{id, label, templateId,
--    usualDay}], flexTemplateId }. Built from day_schedule for every routine
--    that has none: Mon..Fri -> W1..Wn in order (each template its own slot),
--    Saturday's first template -> the Flex default (or the known Flex
--    template when Saturday is empty), then any further Saturday templates,
--    then Sunday's. day_schedule is not touched: non-destructive, and older
--    app builds keep reading it.
-- 2. health_targets gains muscleTiers and flexMinutes (75) where missing.
--    The tier seed is DEFAULT_TIERS in weekPlan.ts.
--
-- No workout or set rows change: what was done this week is derived from the
-- logs. Scoped to Tyler's user_id. Idempotent.

BEGIN;

ALTER TABLE public.routines ADD COLUMN IF NOT EXISTS rotation jsonb;

WITH days AS (
  SELECT r.id AS rid, (d ->> 'day')::int AS day, t.tid, t.ord
    FROM public.routines r
   CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.day_schedule, '[]'::jsonb)) d
   CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(d -> 'templateIds', '[]'::jsonb)) WITH ORDINALITY AS t(tid, ord)
   WHERE r.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
     AND r.rotation IS NULL
     AND t.tid <> ''
),
slots AS (
  SELECT rid, tid, day,
         row_number() OVER (
           PARTITION BY rid
           ORDER BY CASE WHEN day BETWEEN 1 AND 5 THEN day WHEN day = 6 THEN 6 ELSE 7 END, ord
         ) AS n
    FROM days
   WHERE NOT (day = 6 AND ord = 1)
),
flex AS (
  SELECT rid, tid FROM days WHERE day = 6 AND ord = 1
)
UPDATE public.routines r
   SET rotation = jsonb_build_object(
         'slots', coalesce(
           (SELECT jsonb_agg(jsonb_build_object('id', 'w' || n, 'label', 'W' || n, 'templateId', tid, 'usualDay', day) ORDER BY n)
              FROM slots s WHERE s.rid = r.id),
           '[]'::jsonb),
         'flexTemplateId', coalesce(
           (SELECT to_jsonb(tid) FROM flex f WHERE f.rid = r.id),
           CASE WHEN EXISTS (SELECT 1 FROM public.templates WHERE id = 'fd7ebc8a-02c7-45ef-bd1d-04a40c427bba')
                THEN to_jsonb('fd7ebc8a-02c7-45ef-bd1d-04a40c427bba'::text)
                ELSE 'null'::jsonb END)),
       updated_at = now()
 WHERE r.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND r.rotation IS NULL;

UPDATE public.user_settings
   SET health_targets = coalesce(health_targets, '{}'::jsonb)
         || jsonb_build_object(
              'muscleTiers', coalesce(health_targets -> 'muscleTiers', '{
                "lats": "build", "mid_back": "build", "traps": "build", "chest": "build", "abs": "build",
                "side_delts": "maintain", "biceps": "maintain", "triceps": "maintain", "quads": "maintain", "hamstrings": "maintain",
                "front_delts": "covered", "rear_delts": "covered", "lower_back": "covered", "glutes": "covered",
                "calves": "covered", "rotator_cuff": "covered"
              }'::jsonb),
              'flexMinutes', coalesce(health_targets -> 'flexMinutes', '75'::jsonb)),
       updated_at = now()
 WHERE user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
   AND (health_targets -> 'muscleTiers' IS NULL OR health_targets -> 'flexMinutes' IS NULL);

COMMIT;

-- Results:
SELECT r.name, r.is_active,
       (SELECT string_agg((s ->> 'label') || '=' || coalesce(t.name, '?'), ', ' ORDER BY (s ->> 'id'))
          FROM jsonb_array_elements(r.rotation -> 'slots') s
          LEFT JOIN public.templates t ON t.id = s ->> 'templateId') AS rotation,
       (SELECT name FROM public.templates WHERE id = r.rotation ->> 'flexTemplateId') AS flex
  FROM public.routines r
 WHERE r.user_id = '9e957b0f-2f11-408a-9504-b5215049cbb5'
 ORDER BY r.is_active DESC, r.name;
