import { matchCategory, matchCourse } from "@/lib/course-match";
import { decryptText } from "@/lib/feed-crypto.server";
import { fetchFeedText } from "@/lib/feed-fetch.server";
import { parseGradeFile } from "@/lib/grade-import";

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

type Db = {
  from: (table: string) => any; // the server's admin client (typed loosely here on purpose)
};

export type FeedRow = { id: string; user_id: string; encrypted_url: string };

/** Fetches one connected link, applies scores to the matching courses and assessments, and records the result. */
export async function syncFeed(db: Db, row: FeedRow): Promise<{ updated: number; notified: number; status: string }> {
  let status = "ok";
  let updated = 0;
  let notified = 0;
  try {
    const stored = readStoredFeed(await decryptText(row.encrypted_url));
    const { text, fileName } = await fetchFeedText(stored.url, stored.key);
    const { grades } = parseGradeFile(text, fileName);
    if (grades.length === 0) {
      // Show the page's title (never the content), so a sign-in or error page is easy to recognise.
      const title = /<title[^>]*>([^<]{0,80})<\/title>/i.exec(text)?.[1]?.trim();
      const kind = fileName === "feed.json" ? "JSON" : fileName === "feed.csv" ? "CSV" : "a web page";
      throw new Error(
        `the link didn't return any grades I could read (it sent ${kind}, ${text.length} characters${title ? `, page title "${title}"` : ""})`,
      );
    }

    const { data: courses } = await db.from("courses").select("id, name, code").eq("user_id", row.user_id);
    const courseList = (courses ?? []) as { id: string; name: string; code: string | null }[];
    const courseIds = courseList.map((c) => c.id);
    const { data: items } = courseIds.length
      ? await db.from("course_grade_items").select("id, course_id, title, score, max_score, marks").in("course_id", courseIds)
      : { data: [] };
    type Category = { id: string; course_id: string; title: string; score: number | null; max_score: number; marks: unknown };
    const itemList = (items ?? []) as Category[];

    let matchedCourse = 0;
    let matchedCategory = 0;
    const unmatchedCourses = new Set<string>();
    for (const g of grades) {
      const course = matchCourse(g.course, courseList);
      if (!course) {
        unmatchedCourses.add(g.course);
        continue;
      }
      matchedCourse++;
      // The feed's item goes into its category (Quizzes, Assignments...) as a mark, so the category's weight applies.
      const category = matchCategory(g.title, itemList.filter((i) => i.course_id === course.id));
      if (!category) continue;
      matchedCategory++;
      const marks = Array.isArray(category.marks) ? (category.marks as { id: string; name: string; score: number | null; max_score: number; counts_for: string }[]) : [];
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
      updated++;
      if (wasEmpty) {
        await db.from("grade_notifications").insert({
          user_id: row.user_id,
          course_id: course.id,
          grade_item_id: category.id,
          course_name: course.name,
          course_code: course.code,
          grade_title: g.title,
          score: g.score,
          max_score: g.max_score,
        });
        notified++;
      }
    }
    const detail = `read ${grades.length}, course matched ${matchedCourse}, category matched ${matchedCategory}`;
    const unknown = unmatchedCourses.size ? `; no course for: ${[...unmatchedCourses].slice(0, 2).join(" | ")}` : "";
    status = `ok: ${updated} updated${notified ? `, ${notified} new` : ""} (${detail}${unknown})`;
  } catch (err) {
    status = `error: ${err instanceof Error ? err.message : "unknown error"}`.slice(0, 200);
  }
  await db
    .from("grade_feeds")
    .update({ last_checked_at: new Date().toISOString(), last_status: status })
    .eq("id", row.id);
  return { updated, notified, status };
}
