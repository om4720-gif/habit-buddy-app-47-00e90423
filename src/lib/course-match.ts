// Matches a course from another app's feed to a course in Ritual.
// Order: course code found in the feed's text, then the distinctive words of the course name.
// Generic words such as "Engineering" or "Introduction" are ignored, so they can't cause false matches.

const GENERIC = new Set([
  "introduction", "intro", "to", "the", "and", "of", "for", "in", "course", "semester", "civil", "engineering",
  "engineer", "science", "sciences", "design", "principles", "system", "systems", "fundamentals", "advanced",
  "i", "ii", "iii", "iv", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
]);

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 3 && !GENERIC.has(w));

export type CourseRef = { id: string; name: string; code: string | null };

/** Returns the course the feed's course text refers to, or null when it's unclear. */
export function matchCourse<T extends CourseRef>(feedCourse: string, courses: T[]): T | null {
  const text = norm(feedCourse);
  if (!text) return null;
  const padded = ` ${text} `;

  // 1) A course code written in the feed (e.g. CIG502) identifies the course exactly.
  const byCode = courses.filter((c) => c.code && padded.includes(` ${norm(c.code)} `));
  if (byCode.length === 1) return byCode[0]!;

  // 2) Distinctive words of the course name that appear in the feed's text.
  const scored = courses
    .map((c) => {
      const ws = [...new Set(words(c.name))];
      if (ws.length === 0) return { c, score: 0 };
      const found = ws.filter((w) => padded.includes(` ${w}`)).length;
      return { c, score: found / ws.length };
    })
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null; // ambiguous: don't guess
  return scored[0]!.c;
}

/** Matches an assessment name from the feed (e.g. "Quiz 1 - Question1") to one of the course's items. */
export function matchItem<T extends { title: string }>(feedTitle: string, items: T[]): T | null {
  const target = norm(feedTitle);
  const exact = items.find((i) => norm(i.title) === target);
  if (exact) return exact;
  const inside = items.filter((i) => {
    const t = norm(i.title);
    return t.length >= 3 && (target.includes(t) || t.includes(target));
  });
  return inside.length === 1 ? inside[0]! : null;
}
