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
  if (grades.length === 0) return json(400, { error: "No grade found in the message. Send course, item and grade." });

  const applied = await applyGrades(db as never, hook.user_id, grades);
  return json(200, {
    received: grades.length,
    updated: applied.updated,
    new_popups: applied.notified,
    unmatched_courses: [...applied.unmatchedCourses],
  });
}
