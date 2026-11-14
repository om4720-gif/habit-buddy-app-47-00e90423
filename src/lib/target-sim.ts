// Target grade simulator. Works out what you need on the remaining work to reach a target letter.
// Reads the category policies stored per course: weight, marks so far, "best N of M" (best_count / expected_count).

export type SimMark = { score: number | null; max_score: number };
export type SimItem = {
  title: string;
  weight: number; // % of the final grade
  is_final: boolean;
  marks: SimMark[];
  best_count?: number | null; // "best N": only the N best marks count
  expected_count?: number | null; // M: how many marks this category will have
};

function categoryState(item: SimItem) {
  const scored = item.marks.filter((m) => m.score !== null && m.max_score > 0).map((m) => m.score! / m.max_score);
  const counted = item.best_count && item.best_count > 0 ? item.best_count : Math.max(1, item.expected_count ?? (scored.length || 1));
  const slots = Math.max(counted, item.expected_count ?? counted);
  const openSlots = Math.max(0, slots - scored.length); // marks still to come
  return { scored, counted, openSlots };
}

/**
 * Points (in % of the final grade) a category contributes if its future marks score `futureRatio`.
 * Future marks compete with the existing ones for the "best N" places, so a better mark can replace a weaker one.
 */
export function categoryPoints(item: SimItem, futureRatio: number): number {
  const { scored, counted, openSlots } = categoryState(item);
  const all = [...scored, ...Array(openSlots).fill(futureRatio)].sort((a, b) => b - a).slice(0, counted);
  const total = all.reduce((a, b) => a + b, 0);
  return item.weight * (total / counted);
}

export const hasOpenWork = (item: SimItem) => categoryState(item).openSlots > 0;

/** Points so far, counting open places as 0. */
export const pointsSoFar = (items: SimItem[]) => items.reduce((s, i) => s + categoryPoints(i, 0), 0);
/** The most still reachable (every open place at 100%). */
export const maxPossible = (items: SimItem[]) => items.reduce((s, i) => s + categoryPoints(i, 1), 0);

/** Smallest ratio x in [0,1] with f(x) >= target, or null if even 100% isn't enough. */
export function solve(f: (x: number) => number, target: number): number | null {
  if (f(1) < target - 1e-9) return null;
  if (f(0) >= target - 1e-9) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

export type Plan = { name: string; note: string; requiredPct: number | null };

/** The plans for reaching a target percentage (e.g. 94 for A+). */
export function planTarget(items: SimItem[], targetPct: number, currentAverage: number | null): Plan[] {
  const plans: Plan[] = [];
  const pct = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 10);
  const open = items.filter(hasOpenWork);
  if (open.length === 0) return plans;

  const even = solve((x) => items.reduce((s, i) => s + categoryPoints(i, x), 0), targetPct);
  plans.push({ name: "Even effort", note: "The same score on every remaining piece of work.", requiredPct: pct(even) });

  const finals = open.filter((i) => i.is_final);
  if (finals.length > 0) {
    const others = (x: number) => items.reduce((s, i) => (i.is_final ? s : s + categoryPoints(i, x)), 0);
    const best = solve((y) => others(1) + finals.reduce((s, f) => s + categoryPoints(f, y), 0), targetPct);
    plans.push({ name: "Best on coursework, then the final", note: "100% on all other work still to come; the final covers the rest.", requiredPct: pct(best) });

    if (currentAverage !== null) {
      const avg = currentAverage / 100;
      const steady = solve((y) => others(avg) + finals.reduce((s, f) => s + categoryPoints(f, y), 0), targetPct);
      plans.push({
        name: "Keep your average on coursework",
        note: `Other work stays at your current ${Math.round(currentAverage)}% average; the final covers the gap.`,
        requiredPct: pct(steady),
      });
    }
  }
  return plans;
}
