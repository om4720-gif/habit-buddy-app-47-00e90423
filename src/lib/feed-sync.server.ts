import { matchCategory, matchCourse } from "@/lib/course-match";
import { decryptText } from "@/lib/feed-crypto.server";
import { fetchFeedText } from "@/lib/feed-fetch.server";
import { type ImportedGrade, parseGradeFile } from "@/lib/grade-import";

/** The encrypted value holds the link and, when the app needs one, its API key. Older rows hold only the link. */
export function readStoredFeed(plain: string): { url: string; key?: string | undefined } {
  try {
    const parsed = JSON.parse(plain) as { url?: string; key?: string };
    if (parsed.url) return { url: parsed.url, key: parsed.key };
  } catch {
    /* not JSON: an older row */
  }
  return { url: plain };
}

type Db = { from: (table: string) => any }; // the server's admin client (typed loosely on purpose)

export type FeedRow = { id: string; user_id: string; encrypted_url: string };

export type ApplyResult = {
  updated: number;
  notified: number;
  matchedCourse: number;
  matchedCategory: number;
  courseMap: Map<string, string>;
  unmatchedCourses: Set<string>;
  unmatchedItems: Map<string, number>;
};

/**
 * Puts grades where they belong for one user: the matching course, then the matching category (as a mark),
 * or the Unsorted box when unsure. A grade that's new for its category raises a popup notification.
 */
export async function applyGrades(db: Db, userId: string, grades: ImportedGrade[]): Promise<ApplyResult> {
  const { data: courses } = await db.from("courses").select("id, name, code").eq("user_id", userId);
  const courseList = (courses ?? []) as { id: string; name: string; code: string | null }[];
  const courseIds = courseList.map((c) => c.id);
  const { data: items } = courseIds.length
    ? await db.from("course_grade_items").select("id, course_id, title, score, max_score, marks").in("course_id", courseIds)
    : { data: [] };
  type Category = { id: string; course_id: string; title: string; score: number | null; max_score: number; marks: unknown };
  const itemList = (items ?? []) as Category[];

  const result: ApplyResult = {
    updated: 0,
    notified: 0,
    matchedCourse: 0,
    matchedCategory: 0,
    courseMap: new Map(),
    unmatchedCourses: new Set(),
    unmatchedItems: new Map(),
  };

  for (const g of grades) {
    const course = matchCourse(g.course, courseList);
    if (!course) {
      result.unmatchedCourses.add(g.course);
      continue;
    }
    result.matchedCourse++;
    if (!result.courseMap.has(g.course)) result.courseMap.set(g.course, course.name);

    const category = matchCategory(g.title, itemList.filter((i) => i.course_id === course.id));
    if (!category) {
      // Not sure which category it belongs to: hold it under the course so the owner can assign it.
      const cats = itemList.filter((i) => i.course_id === course.id).map((i) => i.title).join(", ") || "none";
      const key = `"${g.title}" in ${course.name} (categories: ${cats})`;
      result.unmatchedItems.set(key, (result.unmatchedItems.get(key) ?? 0) + 1);
      await db.from("unsorted_grades").upsert(
        { user_id: userId, course_id: course.id, title: g.title.slice(0, 200), score: g.score, max_score: g.max_score },
        { onConflict: "course_id,title" },
      );
      continue;
    }
    result.matchedCategory++;
    // Placed in a category: clear any held copy of it.
    await db.from("unsorted_grades").delete().eq("course_id", course.id).eq("title", g.title.slice(0, 200));

    const marks = Array.isArray(category.marks)
      ? (category.marks as { id: string; name: string; score: number | null; max_score: number; counts_for: string }[])
      : [];
    const markId = `feed-${g.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const existing = marks.find((m) => m.id === markId || m.name.toLowerCase() === g.title.toLowerCase());
    if (existing && Number(existing.score) === g.score && Number(existing.max_score) === g.max_score) continue;

    const wasEmpty = !existing || existing.score === null;
    const nextMarks = existing
      ? marks.map((m) => (m === existing ? { ...m, score: g.score, max_score: g.max_score } : m))
      : [...marks, { id: markId, name: g.title, score: g.score, max_score: g.max_score, counts_for: "here" }];
    const { error } = await db
      .from("course_grade_items")
      .update({ marks: nextMarks, updated_at: new Date().toISOString() })
      .eq("id", category.id);
    if (error) throw new Error(error.message);
    category.marks = nextMarks;
    result.updated++;
    if (wasEmpty) {
      await db.from("grade_notifications").insert({
        user_id: userId,
        course_id: course.id,
        grade_item_id: category.id,
        course_name: course.name,
        course_code: course.code,
        grade_title: g.title,
        score: g.score,
        max_score: g.max_score,
      });
      result.notified++;
    }
  }
  return result;
}

/** Fetches one connected link, applies its grades, and records the result on the link. */
export async function syncFeed(db: Db, row: FeedRow): Promise<{ updated: number; notified: number; status: string }> {
  let status = "ok";
  let updated = 0;
  let notified = 0;
  try {
    const stored = readStoredFeed(await decryptText(row.encrypted_url));
    const { text, fileName } = await fetchFeedText(stored.url, stored.key);
    const { grades } = parseGradeFile(text, fileName);
    if (grades.length === 0) {
      const title = /<title[^>]*>([^<]{0,80})<\/title>/i.exec(text)?.[1]?.trim();
      const kind = fileName === "feed.json" ? "JSON" : fileName === "feed.csv" ? "CSV" : "a web page";
      throw new Error(
        `the link didn't return any grades I could read (it sent ${kind}, ${text.length} characters${title ? `, page title "${title}"` : ""})`,
      );
    }
    const applied = await applyGrades(db, row.user_id, grades);
    updated = applied.updated;
    notified = applied.notified;
    const shortFeed = (c: string) => c.replace(/^civil engineering\s*(\d+\w*\s*semester)?\s*[-|]?\s*/i, "").slice(0, 40);
    const pairs = [...applied.courseMap.entries()].map(([f, a]) => `${shortFeed(f)} -> ${a}`).join("; ");
    const detail = `read ${grades.length}, course matched ${applied.matchedCourse}, category matched ${applied.matchedCategory}${pairs ? `; courses: ${pairs}` : ""}`;
    const unknown = applied.unmatchedCourses.size ? `; no course for: ${[...applied.unmatchedCourses].slice(0, 2).join(" | ")}` : "";
    const noCategory = applied.unmatchedItems.size ? `; no category for: ${[...applied.unmatchedItems.keys()].slice(0, 2).join(" | ")}` : "";
    status = `ok: ${updated} updated${notified ? `, ${notified} new` : ""} (${detail}${unknown}${noCategory})`;
  } catch (err) {
    status = `error: ${err instanceof Error ? err.message : "unknown error"}`.slice(0, 200);
  }
  await db
    .from("grade_feeds")
    .update({ last_checked_at: new Date().toISOString(), last_status: status })
    .eq("id", row.id);
  return { updated, notified, status };
}
