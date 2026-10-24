// Smart matching between another app's names and Ritual's names.
// It tries the strongest signal first (a course code, an exact name), then looser ones
// (abbreviations, distinctive words, synonyms, short forms like "Q1", small typos).
// If the answer is unclear, it returns nothing instead of guessing.

const FILLER = new Set([
  "of", "and", "the", "to", "in", "for", "on", "with", "a", "an", "i", "ii", "iii", "iv", "v",
  "civil", "engineering", "semester", "course", "class", "section", "part", "by", "from",
]);
// Words too general to identify a course or category on their own.
const GENERIC = new Set([
  "introduction", "intro", "design", "system", "systems", "science", "sciences", "fundamentals", "advanced",
  "principles", "theory", "analysis", "structures", "structure", "applied", "basic", "basics",
]);

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

/** Classic edit distance, used only for small typos in words of 5+ letters. */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length]![b.length]!;
}
const sameWord = (a: string, b: string) =>
  a === b || (a.length >= 5 && b.length >= 5 && editDistance(a, b) <= 1);

export type CourseRef = { id: string; name: string; code: string | null };

/** The course a feed's course text refers to, or null when it's unclear. */
export function matchCourse<T extends CourseRef>(feedCourse: string, courses: T[]): T | null {
  const text = norm(feedCourse);
  if (!text) return null;
  const padded = ` ${text} `;

  // 1) Course code written in the feed (e.g. CIG502).
  const byCode = courses.filter((c) => c.code && padded.includes(` ${norm(c.code)} `));
  if (byCode.length === 1) return byCode[0]!;

  // 2) Abbreviation (e.g. "RC") = first letters of the feed's main words.
  const titleWords = words(feedCourse).filter((w) => !/\d/.test(w) && !FILLER.has(w));
  const coreAcronym = titleWords.filter((w) => !GENERIC.has(w)).map((w) => w[0]).join("");
  const byAcronym = courses.filter((c) => {
    const abbr = norm(c.name).replace(/\s+/g, "");
    return /^[a-z]{2,6}$/.test(abbr) && abbr === coreAcronym;
  });
  if (byAcronym.length === 1) return byAcronym[0]!;

  // 3) Distinctive words of the course name found in the feed (allowing small typos).
  const scored = courses
    .map((c) => {
      const ws = [...new Set(words(c.name).filter((w) => !FILLER.has(w) && !GENERIC.has(w) && w.length >= 3))];
      if (ws.length === 0) return { c, score: 0 };
      const found = ws.filter((w) => titleWords.some((t) => sameWord(t, w))).length;
      return { c, score: found / ws.length };
    })
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null; // ambiguous: don't guess
  return scored[0]!.c;
}

// What each kind of assessment is called, in the feed and in Ritual's categories.
const TYPES: { name: string; feed: RegExp; category: RegExp; not?: RegExp }[] = [
  { name: "quiz", feed: /\b(quiz|quizzes|qz|question|questions|q\d+|in[ -]?class)\b/i, category: /quiz|in[ -]?class|question/i },
  { name: "assignment", feed: /\b(assignment|assignments|assign|ass|a\d+|homework|hw)\b/i, category: /assign|homework|\bass\b|\bhw\b/i },
  { name: "midterm", feed: /\b(mid[ -]?term|midterm|mt)\b/i, category: /mid[ -]?term|\bmt\b/i },
  { name: "final", feed: /\b(final|exam|examination)\b/i, category: /final|exam/i, not: /mid/i },
  { name: "project", feed: /\bproject\b/i, category: /project/i },
  { name: "lab", feed: /\b(lab|labs|practical|practicals)\b/i, category: /\blab|practical/i },
  { name: "presentation", feed: /\b(presentation|poster|report|pitch)\b/i, category: /presentation|poster|report|pitch/i },
];

/** Keys like "Q1" or "Assignment 2" map to the same number, so "Quiz 1" and "Q1" are the same item. */
const numberKey = (s: string) => {
  const n = /(\d+)/.exec(norm(s))?.[1];
  return n ?? "";
};

/** The assessment (item) in a category, matched by name, number and small typos. */
export function matchItem<T extends { title: string }>(feedTitle: string, items: T[]): T | null {
  const target = norm(feedTitle);
  const exact = items.find((i) => norm(i.title) === target);
  if (exact) return exact;
  const squashed = target.replace(/\s+/g, "");
  const same = items.filter((i) => norm(i.title).replace(/\s+/g, "") === squashed);
  if (same.length === 1) return same[0]!;
  // Feed "Quiz 1 - Question1" and item "Quiz 1": the item's words are all in the feed title.
  const inside = items.filter((i) => {
    const t = norm(i.title);
    return t.length >= 3 && (target.includes(t) || t.includes(target));
  });
  if (inside.length === 1) return inside[0]!;
  const byNumber = items.filter((i) => numberKey(i.title) !== "" && numberKey(i.title) === numberKey(feedTitle));
  const kind = (s: string) => TYPES.find((t) => t.feed.test(s))?.name;
  const sameKind = byNumber.filter((i) => kind(i.title) === kind(feedTitle) || !kind(i.title));
  return sameKind.length === 1 ? sameKind[0]! : null;
}

/**
 * The category (a weighted item such as "Quizzes" or "Assignments") a feed item belongs to.
 * Exact names first, then the assessment type (quiz, assignment, midterm...), including short forms like "Q1" or "A2".
 */
export function matchCategory<T extends { title: string }>(feedTitle: string, categories: T[]): T | null {
  const byName = matchItem(feedTitle, categories);
  if (byName) return byName;
  const types = TYPES.filter((t) => t.feed.test(feedTitle));
  if (types.length !== 1) return null; // no clear type, or more than one
  const candidates = categories.filter(
    (c) => types[0]!.category.test(c.title) && !(types[0]!.not && types[0]!.not.test(c.title)),
  );
  return candidates.length === 1 ? candidates[0]! : null;
}
