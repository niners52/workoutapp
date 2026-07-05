/**
 * Word-based fuzzy search matching.
 *
 * Matches when EVERY word in the query appears SOMEWHERE in the target string,
 * in any order. "cable fly" matches "High to Low Cable Fly", "Cable Fly High
 * to Low", and "Low Cable Fly"; "fly cable" matches all of those too.
 *
 * This replaces the previous exact-substring filters, which required the query
 * to appear contiguously ("cable fly" failed against "High to Low Cable Fly"
 * because those two words aren't adjacent in the name).
 */
export function matchesAllWords(target: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true; // empty query matches everything
  const haystack = target.toLowerCase();
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .every(word => haystack.includes(word));
}
