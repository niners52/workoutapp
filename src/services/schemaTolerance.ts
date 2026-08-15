import { supabase } from './supabase';

/**
 * Tolerance for a client that is newer than its Supabase schema.
 *
 * Columns like `workouts.location_id`, `workouts.is_deload` and
 * `exercises.is_favorite` were added after those tables shipped. Without this,
 * upserting a row containing an unknown column fails the whole request — which
 * is how per-gym locations came to be written locally but never persisted,
 * leaving restored devices convinced every exercise was new to the gym.
 *
 * On a missing-column error we drop the offending optional column, retry once,
 * and remember the outcome for the rest of the session so later writes skip it.
 * Apply supabase/migrations/20260815000000_add_location_and_favorites.sql to make
 * the fallback unnecessary.
 */

const knownMissingColumns = new Set<string>();

/**
 * Optional (post-launch) columns per table. Any of these may be absent on a
 * database that hasn't had the migration applied yet.
 */
export const OPTIONAL_COLUMNS_BY_TABLE: Record<string, string[]> = {
  workouts: ['location_id', 'is_deload', 'skipped_exercise_ids'],
  exercises: ['is_favorite', 'notes', 'is_unilateral'],
};

/** Columns proven missing this session, as "table.column" — for diagnostics. */
export function getKnownMissingColumns(): string[] {
  return [...knownMissingColumns];
}

export function isMissingColumnError(
  error: { message?: string; code?: string } | null,
): boolean {
  if (!error) return false;
  // PGRST204 = PostgREST schema-cache miss; 42703 = Postgres undefined_column.
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const msg = (error.message || '').toLowerCase();
  return msg.includes('column') && (msg.includes('does not exist') || msg.includes('not found'));
}

function stripMissingColumns<T extends Record<string, any>>(table: string, row: T): T {
  const copy: Record<string, any> = { ...row };
  for (const column of Object.keys(row)) {
    if (knownMissingColumns.has(`${table}.${column}`)) delete copy[column];
  }
  return copy as T;
}

/** Which optional columns the error blames; falls back to all of them. */
function columnsToDrop(
  error: { message?: string } | null,
  optionalColumns: string[],
  present: string[],
): string[] {
  const message = (error?.message || '').toLowerCase();
  const named = optionalColumns.filter(c => message.includes(c));
  const candidates = named.length > 0 ? named : optionalColumns;
  return candidates.filter(c => present.includes(c));
}

/**
 * Upsert one or more rows, retrying without optional columns the database lacks.
 * Returns the payload that actually went out so callers can queue an accurate retry.
 */
export async function upsertTolerant<T extends Record<string, any>>(
  table: string,
  rows: T | T[],
  optionalColumns: string[],
  onConflict: string = 'id',
): Promise<{ error: any; rows: T | T[] }> {
  const asArray = Array.isArray(rows);
  const strip = (input: T | T[]): T | T[] =>
    Array.isArray(input)
      ? input.map(r => stripMissingColumns(table, r))
      : stripMissingColumns(table, input);

  let payload = strip(rows);
  let { error } = await supabase.from(table).upsert(payload as any, { onConflict });

  if (error && isMissingColumnError(error)) {
    const sample = (Array.isArray(payload) ? payload[0] : payload) ?? {};
    const dropped = columnsToDrop(error, optionalColumns, Object.keys(sample));
    if (dropped.length > 0) {
      for (const c of dropped) knownMissingColumns.add(`${table}.${c}`);
      console.log(
        `[Sync] ${table} is missing column(s) ${dropped.join(', ')} — retrying without them. ` +
        `Apply the migration in supabase/migrations to stop discarding this data.`,
      );
      payload = strip(rows);
      ({ error } = await supabase.from(table).upsert(payload as any, { onConflict }));
    }
  }

  return { error, rows: asArray ? (payload as T[]) : (payload as T) };
}
