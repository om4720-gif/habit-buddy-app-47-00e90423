import { decryptText } from "@/lib/feed-crypto.server";
import { fetchFeedText } from "@/lib/feed-fetch.server";

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
import { parseGradeFile } from "@/lib/grade-import";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

type Db = {
  from: (table: string) => any; // the server's admin client (typed loosely here on purpose)
};

export type FeedRow = { id: string; user_id: string; encrypted_url: string };

/** Fetches one connected link, applies scores to matching assessments, and records the result. */
export async function syncFeed(db: Db, row: FeedRow): Promise<{ updated: number; notified: number; status: string }> {
  let status = "ok";
  let updated = 0;
  let notified = 0;
  try {
    const stored = readStoredFeed(await decryptText(row.encrypted_url));
    const { text, fileName } = await fetchFeedText(stored.url, stored.key);
    const { grades } = parseGradeFile(text, fileName);
    if (grades.length === 0) throw new Error("the link didn't return any grades I could read");

    const { data: courses } = await db.from("courses").select("id, name, code").eq("user_id", row.user_id);
    const courseIds = (courses ?? []).map((c: { id: string }) => c.id);
    const { data: items } = courseIds.length
      ? await db.from("course_grade_items").select("id, course_id, title, score, max_score").in("course_id", courseIds)
      : { data: [] };

    for (const g of grades) {
      const course = (courses ?? []).find(
        (c: { name: string; code: string | null }) =>
          (g.course && (norm(c.name) === norm(g.course) || (c.code && norm(g.course).includes(norm(c.code))))) ||
          (!g.course && (courses ?? []).length === 1),
      );
      if (!course) continue;
      const item = (items ?? []).find(
        (i: { course_id: string; title: string }) => i.course_id === course.id && norm(i.title) === norm(g.title),
      );
      if (!item) continue;
      if (Number(item.score) === g.score && Number(item.max_score) === g.max_score) continue;

      const wasEmpty = item.score === null;
      const { error } = await db
        .from("course_grade_items")
        .update({ score: g.score, max_score: g.max_score, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
      updated++;
      if (wasEmpty) {
        await db.from("grade_notifications").insert({
          user_id: row.user_id,
          course_id: course.id,
          grade_item_id: item.id,
          course_name: course.name,
          course_code: course.code,
          grade_title: item.title,
          score: g.score,
          max_score: g.max_score,
        });
        notified++;
      }
    }
    status = `ok: ${updated} updated${notified ? `, ${notified} new` : ""}`;
  } catch (err) {
    status = `error: ${err instanceof Error ? err.message : "unknown error"}`.slice(0, 200);
  }
  await db
    .from("grade_feeds")
    .update({ last_checked_at: new Date().toISOString(), last_status: status })
    .eq("id", row.id);
  return { updated, notified, status };
}
