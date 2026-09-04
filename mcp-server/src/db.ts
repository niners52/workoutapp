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
  notes?: string | null;
}

export interface WorkoutRow {
  id: string;
  user_id: string;
  template_id: string | null;
  started_at: string;
  completed_at: string | null;
  skipped_exercise_ids: string[] | null;
  location_id: string | null;
  is_deload: boolean | null;
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

export interface UserSettingsRow {
  user_id: string;
  week_start_day: 'sunday' | 'monday' | null;
  units: 'imperial' | 'metric' | null;
  muscle_group_targets: Record<string, number> | null;
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
    return this.byIds<WorkoutRow>('workouts', 'id,started_at,completed_at,is_deload,location_id', 'id', ids);
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
      this.scoped<UserSettingsRow>('user_settings', 'user_id,week_start_day,units,muscle_group_targets').limit(1),
    );
    return rows[0] ?? null;
  }

  listBodyWeights(limit: number): Promise<BodyMeasurementRow[]> {
    return this.run(
      'body_measurements',
      this.scoped<BodyMeasurementRow>('body_measurements', '*')
        .not('weight', 'is', null)
        .order('date', { ascending: false })
        .limit(limit),
    );
  }

  listLocationsByIds(ids: string[]): Promise<LocationRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.byIds<LocationRow>('workout_locations', 'id,name', 'id', ids);
  }
}
