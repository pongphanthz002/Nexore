/**
 * Logic of the teacher's classroom tools (random picker and group maker), kept free of React
 * so it can be tested. Randomness comes in as `rng` (defaults to Math.random).
 */

export type Rng = () => number;

export type GroupMode = 'count' | 'size';

/** Fisher–Yates; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Choices of the − n + stepper: 2 up to half the class (at least 2 so the stepper still works). */
export function groupStepperRange(total: number): { min: number; max: number } {
  return { min: 2, max: Math.max(2, Math.floor(total / 2)) };
}

/** Number of groups for a mode: "count" is n itself; "size" is ⌊total / n⌋ (30 by 4 → 7). */
export function groupCount(total: number, mode: GroupMode, n: number): number {
  if (total <= 0) return 0;
  const groups = mode === 'count' ? n : Math.floor(total / Math.max(1, n));
  return Math.min(total, Math.max(1, groups));
}

/** Group sizes that differ by at most one, larger groups first (30 in 7 → 5,5,4,4,4,4,4). */
export function groupSizes(total: number, groups: number): number[] {
  if (groups <= 0) return [];
  const base = Math.floor(total / groups);
  const extra = total % groups;
  return Array.from({ length: groups }, (_, i) => base + (i < extra ? 1 : 0));
}

/** "7 กลุ่ม · กลุ่มละ 4–5 คน" */
export function groupPreview(total: number, mode: GroupMode, n: number): string {
  const groups = groupCount(total, mode, n);
  if (groups === 0) return 'ไม่มีนักเรียน';
  const sizes = groupSizes(total, groups);
  const lo = Math.min(...sizes);
  const hi = Math.max(...sizes);
  return `${groups} กลุ่ม · กลุ่มละ ${lo === hi ? lo : `${lo}–${hi}`} คน`;
}

export interface DealtGroups<T> {
  groups: T[][];
  /** order in which members were dealt, as [group, position] pairs (drives the animation) */
  order: [number, number][];
  /** false when nobody had a score, so the class was simply shuffled */
  balanced: boolean;
}

/**
 * Splits `people` into `groups` groups with a mix of strong and weak students in each.
 *
 * With scores: rank by score (highest first; people with no score sit at the median), cut the
 * ranking into rounds of `groups` people, shuffle inside each round (people of similar score
 * swap, so "again" gives a different but still balanced result), then deal the rounds as a snake
 * (1→n, n→1, …) over the groups in a random order. Without any score: shuffle and deal in turn.
 * Group sizes differ by at most one.
 */
export function dealGroups<T>(
  people: readonly T[],
  groups: number,
  scoreOf: (person: T) => number | null | undefined,
  rng: Rng = Math.random,
): DealtGroups<T> {
  const count = Math.min(Math.max(1, groups), Math.max(1, people.length));
  const result: T[][] = Array.from({ length: count }, () => []);
  const order: [number, number][] = [];
  if (people.length === 0) return { groups: [], order, balanced: false };

  const scores = people.map(p => scoreOf(p));
  const known = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s)).sort((a, b) => a - b);
  const balanced = known.length > 0;

  let ranked: T[];
  if (balanced) {
    const median = known[Math.floor((known.length - 1) / 2)];
    // Shuffle first so equal scores don't always come out in roster order
    const withScore = shuffle(people.map((p, i) => ({ p, s: typeof scores[i] === 'number' && Number.isFinite(scores[i]) ? scores[i] as number : median })), rng);
    withScore.sort((a, b) => b.s - a.s);
    ranked = [];
    for (let i = 0; i < withScore.length; i += count) {
      ranked.push(...shuffle(withScore.slice(i, i + count), rng).map(x => x.p));
    }
  } else {
    ranked = shuffle(people, rng);
  }

  const seats = shuffle(Array.from({ length: count }, (_, i) => i), rng);
  ranked.forEach((person, i) => {
    const round = Math.floor(i / count);
    const pos = i % count;
    const g = seats[balanced && round % 2 === 1 ? count - 1 - pos : pos];
    order.push([g, result[g].length]);
    result[g].push(person);
  });
  return { groups: result, order, balanced };
}

export interface PickResult {
  picked: string[];
  /** who has been called in the current round (everyone once, unless repeats are allowed) */
  called: string[];
}

/**
 * Picks `k` people from `pool`. Without repeats, people already in `called` are skipped until
 * everyone has had a turn; then a new round starts (and nobody picked in this draw comes twice).
 */
export function pickPeople(
  pool: readonly string[],
  k: number,
  called: readonly string[],
  allowRepeat: boolean,
  rng: Rng = Math.random,
): PickResult {
  const want = Math.min(Math.max(1, k), pool.length);
  if (want === 0) return { picked: [], called: [...called] };
  if (allowRepeat) {
    const picked = shuffle(pool, rng).slice(0, want);
    return { picked, called: Array.from(new Set([...called, ...picked])) };
  }

  const inPool = new Set(pool);
  // `round` grows with every pick; it restarts empty once everyone has been called
  let round = called.filter(id => inPool.has(id));
  const picked: string[] = [];
  while (picked.length < want) {
    const done = new Set(round);
    let left = pool.filter(id => !done.has(id));
    if (left.length === 0) {
      // Everyone has been called: start a new round, still not repeating this draw
      round = [];
      left = pool.filter(id => !picked.includes(id));
    }
    const next = shuffle(left, rng).slice(0, want - picked.length);
    picked.push(...next);
    round = [...round, ...next];
  }
  return { picked, called: round };
}

/** "กลุ่ม 1: 3 สมชาย, 7 สมหญิง" lines, for pasting into a chat. */
export function groupsAsText<T>(groups: T[][], label: (person: T) => string): string {
  return groups.map((g, i) => `กลุ่ม ${i + 1}: ${g.map(label).join(', ')}`).join('\n');
}
