import { sha256Hex } from "@/lib/grade-webhook.functions";
import { applyGrades } from "@/lib/feed-sync.server";
import { parseGradeFile } from "@/lib/grade-import";

/** Handles a grades-app webhook: a secret in "Authorization: Bearer", and the grade as JSON. */
export async function handleGradeWebhook(request: Request, secret: string): Promise<Response> {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: hook } = await db
    .from("grade_webhooks")
    .select("user_id")
    .eq("token_hash", await sha256Hex(secret))
    .maybeSingle();
  if (!hook) return json(401, { error: "Unknown secret" });

  const text = (await request.text()).slice(0, 200_000);
  const type = request.headers.get("content-type") ?? "";
  const { grades } = parseGradeFile(text, type.includes("csv") ? "in.csv" : "in.json");
  if (grades.length === 0) {
    // Testing fallback: any message still shows up as a bell alert, so the connection can be checked.
    let fields: Record<string, unknown> = {};
    try {
      fields = JSON.parse(text) as Record<string, unknown>;
    } catch {
      fields = { message: text.slice(0, 120) };
    }
    const { data: firstCourse } = await db.from("courses").select("id, name, code").eq("user_id", hook.user_id).limit(1).maybeSingle();
    if (!firstCourse) return json(400, { error: "Add at least one course in Ritual first." });
    const label = String(fields["item"] ?? fields["title"] ?? fields["message"] ?? fields["event"] ?? "Test notification").slice(0, 200);
    await db.from("grade_notifications").insert({
      user_id: hook.user_id,
      course_id: firstCourse.id,
      grade_item_id: null,
      course_name: String(fields["course"] ?? firstCourse.name).slice(0, 200),
      course_code: firstCourse.code,
      grade_title: label,
      score: 0,
      max_score: 0,
    });
    return json(200, { received: 0, test_notification: true, note: "Saved as a test alert in the bell." });
  }

  const applied = await applyGrades(db as never, hook.user_id, grades);
  return json(200, {
    received: grades.length,
    updated: applied.updated,
    new_popups: applied.notified,
    unmatched_courses: [...applied.unmatchedCourses],
  });
}
