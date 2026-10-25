import { sha256Hex } from "@/lib/grade-webhook.functions";
import { applyGrades } from "@/lib/feed-sync.server";
import { parseGradeFile } from "@/lib/grade-import";

/** Handles a grades-app webhook: a secret in "Authorization: Bearer", and the grade as JSON. */
export async function handleGradeWebhook(request: Request, secret: string): Promise<Response> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: hook } = await db
    .from("grade_webhooks")
    .select("user_id")
    .eq("token_hash", await sha256Hex(secret))
    .maybeSingle();
  const json = async (status: number, body: unknown) => {
    // Remember the last message, so Settings can show that it arrived and what happened.
    if (hook) {
      const summary = (body as { error?: string; note?: string }).error ?? (body as { note?: string }).note ?? "ok";
      await db
        .from("grade_webhooks")
        .update({ last_seen_at: new Date().toISOString(), last_result: `${status}: ${summary}`.slice(0, 200) })
        .eq("user_id", hook.user_id);
    }
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  };
  if (!hook) return json(401, { error: "Unknown secret" });

  const text = (await request.text()).slice(0, 200_000);
  const type = request.headers.get("content-type") ?? "";
  const { grades } = parseGradeFile(text, type.includes("csv") ? "in.csv" : "in.json");
  if (grades.length === 0) return json(400, { error: "Not a grade. Send course, item and grade." });

  const applied = await applyGrades(db as never, hook.user_id, grades);

  // Anything whose course isn't in Ritual is still shown in the bell, so every message is visible.
  let shown = 0;
  const unknown = grades.filter((g) => applied.unmatchedCourses.has(g.course));
  if (unknown.length > 0) {
    const { data: firstCourse } = await db.from("courses").select("id, code").eq("user_id", hook.user_id).limit(1).maybeSingle();
    if (firstCourse) {
      for (const g of unknown) {
        const { error } = await db.from("grade_notifications").insert({
          user_id: hook.user_id,
          course_id: firstCourse.id,
          grade_item_id: null,
          course_name: g.course.slice(0, 200) || "Unknown course",
          course_code: firstCourse.code,
          grade_title: g.title.slice(0, 200),
          score: g.score,
          max_score: g.max_score,
        });
        if (error) return json(500, { error: `Could not save the alert: ${error.message}` });
        shown++;
      }
    }
  }

  // Grades whose course isn't in Ritual still show in the bell, labelled with the course name sent,
  // so a test (or a misnamed course) is visible instead of silently dropped.
  const unmatched = grades.filter((g) => applied.unmatchedCourses.has(g.course));
  if (unmatched.length > 0) {
    const { data: anyCourse } = await db.from("courses").select("id, code").eq("user_id", hook.user_id).limit(1).maybeSingle();
    if (anyCourse) {
      for (const g of unmatched) {
        await db.from("grade_notifications").insert({
          user_id: hook.user_id,
          course_id: anyCourse.id,
          grade_item_id: null,
          course_name: `${g.course} (not in Ritual)`.slice(0, 200),
          course_code: anyCourse.code,
          grade_title: g.title,
          score: g.score,
          max_score: g.max_score,
        });
      }
    }
  }
  return json(200, {
    received: grades.length,
    updated: applied.updated,
    new_popups: applied.notified + shown,
    unmatched_courses: [...applied.unmatchedCourses],
    shown_in_bell_as_unmatched: shown,
  });
}

/**
 * The grades app finishes its GUC sign-in and calls this with the one-time state and the secret it created.
 * Ritual checks the state, saves the secret for that user, and the app is connected.
 */
export async function handleGradeConnect(body: { state?: unknown; secret?: unknown }): Promise<Response> {
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const state = typeof body.state === "string" ? body.state : "";
  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!/^[a-f0-9]{64}$/.test(state) || !/^[a-f0-9]{64}$/.test(secret)) return json(400, { error: "Invalid request." });

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: request } = await db
    .from("grade_connect_states")
    .select("user_id, expires_at")
    .eq("state_hash", await sha256Hex(state))
    .maybeSingle();
  if (!request || new Date(request.expires_at).getTime() < Date.now()) return json(401, { error: "This connection request expired. Start again in Ritual." });

  await db.from("grade_connect_states").delete().eq("state_hash", await sha256Hex(state));
  const { error } = await db
    .from("grade_webhooks")
    .upsert({ user_id: request.user_id, token_hash: await sha256Hex(secret), created_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return json(500, { error: `Could not save the connection: ${error.message}` });
  return json(200, { ok: true, connected: true });
}
