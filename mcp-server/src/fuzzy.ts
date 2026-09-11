/**
 * Exercise-name matching. Names in the database are inconsistent
 * ("Machine Leg press machine pf", "Leg Press (PF)", ...), so lookups score
 * every exercise and return the best candidates rather than requiring exact text.
 *
 * Normalization mirrors src/services/routineImport.ts in the app: lowercase,
 * drop parenthesised text and punctuation, collapse whitespace.
 */

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(normalized: string): string[] {
  return normalized.split(' ').filter(t => t.length > 0);
}

/** Bigram Dice coefficient, 0..1. Tolerates typos and word-order differences. */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let overlap = 0;
  for (const [g, count] of ga) overlap += Math.min(count, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/**
 * Score how well `query` matches an exercise, 0..1. Considers both the full
 * name and the optional base name (name without equipment prefix).
 */
export function scoreMatch(query: string, name: string, baseName?: string | null): number {
  const q = normalizeName(query);
  if (!q) return 0;
  const candidates = [name, baseName].filter((c): c is string => !!c).map(normalizeName);
  let best = 0;
  for (const n of candidates) {
    if (!n) continue;
    if (n === q) return 1;
    let score = 0;
    if (n.includes(q) || q.includes(n)) score = Math.max(score, 0.9);
    const qt = tokens(q);
    const nt = tokens(n);
    if (qt.length > 0) {
      const hit = qt.filter(t => nt.some(w => w.includes(t) || t.includes(w))).length;
      score = Math.max(score, 0.85 * (hit / qt.length));
    }
    score = Math.max(score, bigramSimilarity(q, n));
    best = Math.max(best, score);
  }
  return best;
}

export interface Nameable {
  name: string;
  base_name?: string | null;
}

export function rankMatches<T extends Nameable>(
  query: string,
  items: T[],
  opts: { limit?: number; minScore?: number } = {},
): Array<{ item: T; score: number }> {
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 0.35;
  return items
    .map(item => ({ item, score: scoreMatch(query, item.name, item.base_name) }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}
