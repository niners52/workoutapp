/**
 * Read-only data access over supabase-js.
 *
 * Table and column names come from the app's sync layer
 * (src/services/syncService.ts) and supabase/migrations. Every query here is a
 * SELECT; the service role key bypasses RLS, so `userId` scoping is applied
 * explicitly whenever SUPABASE_USER_ID is configured.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExerciseRow {
  id: string;
  user_id: string;
  name: string;
  base_name: string | null;
  primary_muscle_groups: string[] | null;
  secondary_muscle_groups: string[] | null;
  equipment: string | null;
  cable_accessory: string | null;
  machine_weight_type: string | null;
  location_ids: string[] | null;
  is_custom: boolean | null;
  is_favorite: boolean | null;
  /** Added after launch; may be absent on older databases. */
  is_unilateral?: boolean | null;
  /** Explicit bodyweight flag; when absent, equipment === 'bodyweight' decides. */
  is_bodyweight?: boolean | null;
  notes?: string | null;
}

export interface WorkoutRow {
  id: string;
  user_id: string;
  template_id: string | null;
  started_at: string;
  completed_at: string | null;
  skipped_exercise_ids: string[] | null;
  /** Added after launch; may be absent on older databases. */
  location_id?: string | null;
  is_deload?: boolean | null;
}

export interface SetRow {
  id: string;
  user_id: string;
  workout_id: string;
  exercise_id: string;
  reps: number;
  weight: number; // lbs
  logged_at: string;
}

/** Subset of SetRow fetched for whole-history scans. */
export type SetSummaryRow = Pick<SetRow, 'workout_id' | 'exercise_id' | 'reps' | 'weight' | 'logged_at'>;

export interface BodyMeasurementRow {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  weight: number | null; // lbs
  body_fat_percentage: number | null;
  height_inches: number | null;
  type: string | null;
  value: number | null;
  source: string | null;
  synced_at: string | null;
}

/**
 * Columns are optional because user_settings has grown over time and a given
 * database may lack some of them. Select '*' and read what is there.
 */
export interface UserSettingsRow {
  user_id: string;
  week_start_day?: 'sunday' | 'monday' | null;
  muscle_group_targets?: Record<string, number> | null;
  /** HealthTargets as the app stores it (src/types HealthTargets). Absent on older rows. */
  health_targets?: Record<string, unknown> | null;
}

/** One device-local day of Apple Health nutrition. null = the app build could not read that nutrient. */
export interface NutritionDayRow {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  iron_mg: number | null;
  vitamin_b12_mcg: number | null;
  vitamin_d_iu: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  sodium_mg: number | null;
  sample_count: number;
  source: string | null;
  synced_at: string | null;
}

export interface SupplementRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number | null;
  is_active: boolean | null;
}

export interface SupplementIntakeRow {
  id: string;
  user_id: string;
  supplement_id: string;
  date: string; // YYYY-MM-DD
  taken_at: string | null;
}

/** One night of Apple Health sleep, keyed to the local wake date. */
export interface SleepNightRow {
  id: string;
  user_id: string;
  date: string;
  time_asleep_min: number;
  time_in_bed_min: number;
  bedtime: string;
  wake_time: string;
  deep_min: number | null;
  rem_min: number | null;
  core_min: number | null;
  awake_min: number | null;
  sample_count: number;
  source: string | null;
  synced_at: string | null;
}

export interface LocationRow {
  id: string;
  user_id: string;
  name: string;
}

export class DbError extends Error {
  constructor(public readonly table: string, message: string) {
    super(`${table}: ${message}`);
    this.name = 'DbError';
  }
}

/** `type` values a hand-made body_measurements table might use for body weight. */
const BODY_WEIGHT_TYPES = ['weight', 'body_weight', 'bodyweight', 'weight_lbs'];

/** PostgREST returns at most 1000 rows per request by default. */
const PAGE_SIZE = 1000;
/** Keep `in (...)` lists short enough for a URL. */
const IN_CHUNK = 200;

// supabase-js query builders are heavily generic; the data layer only needs
// this narrow, chainable surface, which also keeps the test fake small.
export interface QueryBuilder<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  not(column: string, operator: string, value: unknown): QueryBuilder<T>;
  order(column: string, opts?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  range(from: number, to: number): QueryBuilder<T>;
}

export interface MinimalSupabase {
  from<T = unknown>(table: string): QueryBuilder<T>;
}

export function asMinimal(client: SupabaseClient): MinimalSupabase {
  return client as unknown as MinimalSupabase;
}

export class Db {
  constructor(
    private readonly client: MinimalSupabase,
    /** When set, every query is restricted to this auth.users id. */
    private readonly userId?: string,
  ) {}

  private scoped<T>(table: string, columns: string): QueryBuilder<T> {
    let q = this.client.from<T>(table).select(columns);
    if (this.userId) q = q.eq('user_id', this.userId);
    return q;
  }

  private async run<T>(table: string, q: QueryBuilder<T>): Promise<T[]> {
    const { data, error } = await q;
    if (error) throw new DbError(table, error.message);
    return data ?? [];
  }

  /**
   * Follow PostgREST paging until an empty page comes back. Advancing by the
   * rows actually returned (not by PAGE_SIZE) keeps this correct even if the
   * project's max-rows setting is lower than PAGE_SIZE.
   */
  private async runAll<T>(table: string, build: () => QueryBuilder<T>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; ) {
      const page = await this.run(table, build().range(from, from + PAGE_SIZE - 1));
      if (page.length === 0) return out;
      out.push(...page);
      from += page.length;
    }
  }

  private async byIds<T>(table: string, columns: string, column: string, ids: string[]): Promise<T[]> {
    const unique = [...new Set(ids)];
    const out: T[] = [];
    for (let i = 0; i < unique.length; i += IN_CHUNK) {
      const chunk = unique.slice(i, i + IN_CHUNK);
      out.push(...(await this.run(table, this.scoped<T>(table, columns).in(column, chunk))));
    }
    return out;
  }

  listExercises(): Promise<ExerciseRow[]> {
    return this.runAll('exercises', () => this.scoped<ExerciseRow>('exercises', '*').order('name'));
  }

  listRecentWorkouts(limit: number): Promise<WorkoutRow[]> {
    return this.run(
      'workouts',
      this.scoped<WorkoutRow>('workouts', '*').order('started_at', { ascending: false }).limit(limit),
    );
  }

  listWorkoutsByIds(ids: string[]): Promise<WorkoutRow[]> {
    // '*' rather than a column list: location_id and is_deload were added after
    // launch and may not exist on every database.
    return this.byIds<WorkoutRow>('workouts', '*', 'id', ids);
  }

  listSetsByWorkoutIds(ids: string[]): Promise<SetRow[]> {
    return this.byIds<SetRow>('workout_sets', '*', 'workout_id', ids);
  }

  listRecentSetsForExercise(exerciseId: string, limit: number): Promise<SetRow[]> {
    return this.run(
      'workout_sets',
      this.scoped<SetRow>('workout_sets', '*')
        .eq('exercise_id', exerciseId)
        .order('logged_at', { ascending: false })
        .limit(limit),
    );
  }

  listAllSetsForExercise(exerciseId: string): Promise<SetSummaryRow[]> {
    return this.runAll('workout_sets', () =>
      this.scoped<SetSummaryRow>('workout_sets', 'workout_id,exercise_id,reps,weight,logged_at')
        .eq('exercise_id', exerciseId)
        .order('logged_at', { ascending: true }),
    );
  }

  /** Most recent set per exercise for a handful of exercise ids. */
  async lastLoggedAtByExercise(exerciseIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    await Promise.all(
      exerciseIds.map(async id => {
        const rows = await this.listRecentSetsForExercise(id, 1);
        const first = rows[0];
        if (first) out.set(id, first.logged_at);
      }),
    );
    return out;
  }

  listSetsSince(isoLowerBound: string): Promise<SetSummaryRow[]> {
    return this.runAll('workout_sets', () =>
      this.scoped<SetSummaryRow>('workout_sets', 'workout_id,exercise_id,reps,weight,logged_at')
        .gte('logged_at', isoLowerBound)
        .order('logged_at', { ascending: true }),
    );
  }

  listAllSets(): Promise<SetSummaryRow[]> {
    return this.runAll('workout_sets', () =>
      this.scoped<SetSummaryRow>('workout_sets', 'workout_id,exercise_id,reps,weight,logged_at')
        .order('logged_at', { ascending: true }),
    );
  }

  async getUserSettings(): Promise<UserSettingsRow | null> {
    const rows = await this.run(
      'user_settings',
      this.scoped<UserSettingsRow>('user_settings', '*').limit(1),
    );
    return rows[0] ?? null;
  }

  // body_measurements has two shapes in the wild. The app writes a flat `weight`
  // column; a table created by hand may only have generic (type, value) rows.
  // Read the flat column first and fall back to typed rows if it is missing, so
  // the tool works before and after supabase/migrations/20260911000001 is applied.
  private bodyWeightShape: 'flat' | 'typed' | null = null;

  private async bodyWeights(limit?: number): Promise<BodyMeasurementRow[]> {
    const flat = () => {
      const q = this.scoped<BodyMeasurementRow>('body_measurements', '*')
        .not('weight', 'is', null)
        .order('date', { ascending: false });
      return limit === undefined
        ? this.runAll('body_measurements', () => q)
        : this.run('body_measurements', q.limit(limit));
    };
    const typed = async () => {
      const q = this.scoped<BodyMeasurementRow & { type: string; value: number }>('body_measurements', '*')
        .in('type', BODY_WEIGHT_TYPES)
        .order('date', { ascending: false });
      const rows = limit === undefined
        ? await this.runAll('body_measurements', () => q)
        : await this.run('body_measurements', q.limit(limit));
      return rows.map(r => ({ ...r, weight: r.value, body_fat_percentage: null }));
    };

    if (this.bodyWeightShape === 'typed') return typed();
    try {
      const rows = await flat();
      this.bodyWeightShape = 'flat';
      return rows;
    } catch (err) {
      if (this.bodyWeightShape === null && err instanceof DbError && /column .*weight does not exist/i.test(err.message)) {
        this.bodyWeightShape = 'typed';
        return typed();
      }
      throw err;
    }
  }

  /** Every body-weight entry, newest first, for as-of-date lookups. */
  listAllBodyWeights(): Promise<BodyMeasurementRow[]> {
    return this.bodyWeights();
  }

  listBodyWeights(limit: number): Promise<BodyMeasurementRow[]> {
    return this.bodyWeights(limit);
  }

  /** Nutrition days on or after `sinceDate` (YYYY-MM-DD), newest first. */
  listNutritionDays(sinceDate: string): Promise<NutritionDayRow[]> {
    return this.runAll('nutrition_days', () =>
      this.scoped<NutritionDayRow>('nutrition_days', '*')
        .gte('date', sinceDate)
        .order('date', { ascending: false }),
    );
  }

  /** Sleep nights with wake date on or after `sinceDate`, newest first. */
  listSleepNights(sinceDate: string): Promise<SleepNightRow[]> {
    return this.runAll('sleep_nights', () =>
      this.scoped<SleepNightRow>('sleep_nights', '*')
        .gte('date', sinceDate)
        .order('date', { ascending: false }),
    );
  }

  listSupplements(): Promise<SupplementRow[]> {
    return this.runAll('supplements', () => this.scoped<SupplementRow>('supplements', '*').order('name'));
  }

  /** Supplement intakes on or after `sinceDate` (YYYY-MM-DD), newest first. */
  listSupplementIntakes(sinceDate: string): Promise<SupplementIntakeRow[]> {
    return this.runAll('supplement_intakes', () =>
      this.scoped<SupplementIntakeRow>('supplement_intakes', '*')
        .gte('date', sinceDate)
        .order('date', { ascending: false }),
    );
  }

  listLocationsByIds(ids: string[]): Promise<LocationRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.byIds<LocationRow>('workout_locations', 'id,name', 'id', ids);
  }
}

/** table -> column -> PostgREST/OpenAPI type string, e.g. { workouts: { id: 'string', ... } } */
export type SchemaDescription = Record<string, Record<string, string>>;

/**
 * Read the live table/column list from PostgREST's OpenAPI document. Used by the
 * describe_schema tool and the smoke test so a renamed column is reported by name
 * instead of surfacing as a failed query later.
 */
export async function fetchSchemaDescription(
  supabaseUrl: string,
  serviceRoleKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SchemaDescription> {
  const res = await fetchImpl(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!res.ok) throw new DbError('schema', `OpenAPI request failed with HTTP ${res.status}`);
  const doc = (await res.json()) as {
    definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string }> }>;
  };
  const out: SchemaDescription = {};
  for (const [table, def] of Object.entries(doc.definitions ?? {})) {
    out[table] = Object.fromEntries(
      Object.entries(def.properties ?? {}).map(([col, p]) => [col, p.format ?? p.type ?? 'unknown']),
    );
  }
  return out;
}

/** Columns each tool depends on. The smoke test fails loudly if any is missing. */
export const REQUIRED_COLUMNS: Record<string, string[]> = {
  exercises: ['id', 'user_id', 'name', 'primary_muscle_groups', 'equipment'],
  workouts: ['id', 'user_id', 'started_at', 'completed_at'],
  workout_sets: ['id', 'user_id', 'workout_id', 'exercise_id', 'weight', 'reps', 'logged_at'],
  body_measurements: ['id', 'user_id', 'date', 'weight'],
  user_settings: ['user_id'],
  workout_locations: ['id', 'user_id', 'name'],
  nutrition_days: [
    'id', 'user_id', 'date', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g',
    'iron_mg', 'vitamin_b12_mcg', 'vitamin_d_iu', 'calcium_mg', 'zinc_mg', 'sodium_mg',
    'sample_count', 'source', 'synced_at',
  ],
  supplements: ['id', 'user_id', 'name', 'is_active'],
  sleep_nights: [
    'id', 'user_id', 'date', 'time_asleep_min', 'time_in_bed_min', 'bedtime', 'wake_time',
    'deep_min', 'rem_min', 'core_min', 'awake_min', 'sample_count', 'source', 'synced_at',
  ],
  supplement_intakes: ['id', 'user_id', 'supplement_id', 'date', 'taken_at'],
};

export function missingColumns(schema: SchemaDescription): string[] {
  const missing: string[] = [];
  for (const [table, cols] of Object.entries(REQUIRED_COLUMNS)) {
    const have = schema[table];
    if (!have) {
      missing.push(`${table} (table not found)`);
      continue;
    }
    for (const c of cols) if (!(c in have)) missing.push(`${table}.${c}`);
  }
  return missing;
}
