import { createFileRoute } from "@tanstack/react-router";

import { sha256Hex } from "@/lib/grade-webhook.functions";
import { applyGrades } from "@/lib/feed-sync.server";
import { parseGradeFile } from "@/lib/grade-import";
import { checkLimit, clientIp } from "@/lib/rate-limit.server";

// Receives "new grade" notifications from the grades app. Send the webhook secret as
// "Authorization: Bearer <secret>" and the grade (or grades) as JSON, e.g. {"course":"…","item":"Quiz 1","grade":"9 / 10"}.
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

export const Route = createFileRoute("/api/public/grade-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);
        if (!checkLimit(`webhook:ip:${ip}`, 60, 60_000).ok) return json(429, { error: "Too many requests" }, { "Retry-After": "60" });

        const secret = request.headers.get("authorization")?.match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1];
        if (!secret) return json(401, { error: "Missing or invalid secret" });

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
      },
    },
  },
});
