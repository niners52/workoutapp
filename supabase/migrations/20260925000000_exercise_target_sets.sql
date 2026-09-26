-- exercises.target_sets (2026-09-25).
--
-- Per-exercise target sets ("Set 2 of 4") were only ever stored on the phone:
-- exerciseRow never sent them and the table had no column. Moving to a new
-- iPhone therefore reset every exercise to the global default of 3.
-- The app now sends target_sets and reads it back on a restore; without this
-- column the sync tolerates its absence and keeps discarding the value.
--
-- Nothing is rewritten here, so there is nothing to snapshot. Idempotent.
-- TO APPLY: SQL Editor -> paste & run. The final SELECT shows results.

ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS target_sets integer;

-- Results (rows, not notices):
select 'exercises.target_sets exists' as what,
       (count(*) > 0)::text as value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'exercises' and column_name = 'target_sets'
union all
select 'exercises with a target set so far', count(*)::text
  from public.exercises where target_sets is not null;
