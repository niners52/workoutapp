/**
 * In-memory stand-in for the supabase-js query builder, covering exactly the
 * chain used in db.ts. Tests seed tables with plain row objects.
 */
import type { MinimalSupabase, QueryBuilder } from './db.js';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeOptions {
  /** Table names whose queries should fail, mapped to the error message. */
  failing?: Record<string, string>;
  /** Simulate PostgREST's max-rows cap so paging gets exercised. */
  pageSize?: number;
}

class FakeBuilder implements QueryBuilder<Row> {
  private filters: Filter[] = [];
  private columns = '*';
  private ordering: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private rangeFrom = 0;
  private rangeTo: number | null = null;

  constructor(
    private readonly table: string,
    private readonly rows: Row[],
    private readonly opts: FakeOptions,
    private readonly log: string[],
  ) {}

  select(columns: string) {
    this.columns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push(r => r[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    const set = new Set(values);
    this.filters.push(r => set.has(r[column]));
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push(r => String(r[column]) >= String(value));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== 'is' || value !== null) throw new Error(`fake supports only not(col, 'is', null); got ${operator}`);
    this.filters.push(r => r[column] !== null && r[column] !== undefined);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.ordering = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  private execute(): { data: Row[] | null; error: { message: string } | null } {
    this.log.push(this.table);
    const failure = this.opts.failing?.[this.table];
    if (failure) return { data: null, error: { message: failure } };

    let out = this.rows.filter(r => this.filters.every(f => f(r)));
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      out = [...out].sort((a, b) => {
        const av = a[column] as string | number;
        const bv = b[column] as string | number;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return ascending ? cmp : -cmp;
      });
    }
    if (this.rangeTo !== null) out = out.slice(this.rangeFrom, this.rangeTo + 1);
    if (this.limitCount !== null) out = out.slice(0, this.limitCount);
    if (this.opts.pageSize) out = out.slice(0, this.opts.pageSize);

    if (this.columns !== '*') {
      const cols = this.columns.split(',').map(c => c.trim());
      out = out.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
    }
    return { data: out, error: null };
  }

  then<R1 = unknown, R2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve().then(() => this.execute()).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabase(tables: Record<string, Row[]>, opts: FakeOptions = {}) {
  const log: string[] = [];
  const client: MinimalSupabase = {
    from<T>(table: string): QueryBuilder<T> {
      return new FakeBuilder(table, tables[table] ?? [], opts, log) as unknown as QueryBuilder<T>;
    },
  };
  return { client, queryLog: log };
}
