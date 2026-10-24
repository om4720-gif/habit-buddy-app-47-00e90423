// Matches grades from a link (or a file) to the courses and assessments in the app.
// Course names don't need to be identical: the code, or the distinctive words of the app's course name,
// must appear in the grade's course text. Assessment names may carry extra text, e.g. "Quiz 1 - Question1".

const STOP = new Set(["civil", "engineering", "semester", "introduction", "intro", "to", "the", "and", "of", "for", "part", "course"]);

export const normText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type CourseLike = { id: string; name: string; code: string | null };

/** How well an app course matches a course named in the grades: 0 = no match, higher = better. */
export function courseScore(app: CourseLike, gradeCourse: string): number {
  if (!gradeCourse.trim()) return 0;
  const g = normText(gradeCourse);
  const gSquashed = squash(gradeCourse);
  if (app.code && gSquashed.includes(squash(app.code))) return 100;
  const name = normText(app.name);
  if (name && (g === name || g.includes(name))) return 90;
  const words = name.split(" ").filter((w) => w.length >= 3 && !STOP.has(w));
  if (words.length === 0) return 0;
  const hits = words.filter((w) => new RegExp(`\\b${w}\\b`).test(g)).length;
  return hits === words.length ? 60 + hits : 0;
}

/** The single best app course for a grade's course text; null when none or ambiguous. */
export function findCourse<T extends CourseLike>(courses: T[], gradeCourse: string): T | null {
  if (courses.length === 1 && !gradeCourse.trim()) return courses[0]!;
  const scored = courses.map((c) => ({ c, s: courseScore(c, gradeCourse) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0]!.s === scored[1]!.s) return null; // ambiguous: don't guess
  return scored[0]!.c;
}

/** Matches an app assessment title to a grade item title: exact (ignoring case and punctuation), or the app title is the start of it. */
export function itemMatches(appTitle: string, gradeTitle: string): boolean {
  const a = normText(appTitle);
  const g = normText(gradeTitle);
  if (!a || !g) return false;
  return a === g || g.startsWith(`${a} `);
}
