import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
};
import { z } from "zod";

import { checkLimit, clientIp } from "@/lib/rate-limit.server";

const gradePayloadSchema = z
  .object({
    course_code: z.string().trim().min(1).max(100).optional(),
    course_name: z.string().trim().min(1).max(200).optional(),
    grades: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          score: z.number().finite().min(0),
          max_score: z.number().finite().positive().max(100_000),
        }),
      )
      .min(1)
      .max(25),
  })
  .refine((value) => value.course_code || value.course_name, {
    message: "A course_code or course_name is required.",
  })
  .superRefine((value, context) => {
    const names = value.grades.map((grade) => grade.title.toLowerCase());
    if (new Set(names).size !== names.length)
      context.addIssue({ code: "custom", message: "Grade titles must be unique per request." });
    value.grades.forEach((grade, index) => {
      if (grade.score > grade.max_score)
        context.addIssue({
          code: "custom",
          path: ["grades", index, "score"],
          message: "A score cannot exceed max_score.",
        });
    });
  });

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "Content-Security-Policy": "default-src 'none'",
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...SECURITY_HEADERS, ...extra } });

export const Route = createFileRoute("/api/public/grades")({
  server: {
    handlers: {
      // Browsers and monitoring tools check with GET first: answer with a status instead of a 404 page.
      GET: async () =>
        new Response(
          JSON.stringify({ status: "ok", endpoint: "/api/public/grades", methods: ["POST"], auth: "Authorization: Bearer <webhook secret>" }),
          { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...CORS } },
        ),
      // Cross-origin callers send an OPTIONS preflight before POST.
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        // A grades-app webhook sends its secret as "Authorization: Bearer <64 hex characters>".
        const webhookSecret = request.headers.get("authorization")?.match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1];
        if (webhookSecret) {
          const { handleGradeWebhook } = await import("@/lib/grade-webhook.server");
          return handleGradeWebhook(request, webhookSecret);
        }
        // The grades app finishes "Connect" by sending the one-time state and its new secret (no Bearer header yet).
        if (!request.headers.get("authorization")) {
          const raw = await request.clone().text();
          let parsed: { connect?: unknown; state?: unknown; secret?: unknown } = {};
          try {
            parsed = JSON.parse(raw) as typeof parsed;
          } catch {
            /* not JSON */
          }
          if (parsed.connect) {
            const { handleGradeConnect } = await import("@/lib/grade-webhook.server");
            return handleGradeConnect(parsed);
          }
        }
        const ip = clientIp(request);
        if (!checkLimit(`grade-inbox:ip:${ip}`, 20, 60_000).ok)
          return json(429, { error: "Too many requests." }, { "Retry-After": "60" });

        const bearer = request.headers.get("authorization")?.match(/^Bearer ([a-f0-9]{48})$/i)?.[1];
        const key = (bearer ?? new URL(request.url).searchParams.get("key") ?? "").toLowerCase();
        if (!/^[a-f0-9]{48}$/i.test(key)) return json(401, { error: "Unauthorized." });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: token, error: tokenError } = await db
          .from("grade_inbox_tokens")
          .select("user_id")
          .eq("token", key)
          .maybeSingle();
        if (tokenError) return json(500, { error: "Could not validate the inbox link." });
        if (!token) return json(401, { error: "Unauthorized." });

        if (!checkLimit(`grade-inbox:token:${key}`, 10, 60_000).ok)
          return json(429, { error: "Too many requests." }, { "Retry-After": "60" });

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 24_000) return json(413, { error: "Request body is too large." });
        const reader = request.body?.getReader();
        if (!reader) return json(400, { error: "Request body is required." });
        const decoder = new TextDecoder();
        let raw = "";
        let byteLength = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            byteLength += value.byteLength;
            if (byteLength > 24_000) {
              await reader.cancel();
              return json(413, { error: "Request body is too large." });
            }
            raw += decoder.decode(value, { stream: true });
          }
          raw += decoder.decode();
        } finally {
          reader.releaseLock();
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch {
          return json(400, { error: "Request body must be valid JSON." });
        }
        const parsed = gradePayloadSchema.safeParse(parsedJson);
        if (!parsed.success)
          return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid grade data." });

        const { data: quota, error: quotaError } = await db.rpc("consume_grade_inbox_check", {
          p_user_id: token.user_id,
        });
        if (quotaError || !quota?.[0])
          return json(500, { error: "Could not enforce the grade check limit." });
        if (!quota[0].allowed) {
          const retryAfter = Math.max(
            1,
            Math.ceil((new Date(quota[0].reset_at).getTime() - Date.now()) / 1000),
          );
          return json(
            429,
            {
              error: "Daily grade check limit reached.",
              checks_per_24_hours: 3,
              reset_at: quota[0].reset_at,
            },
            { "Retry-After": String(retryAfter) },
          );
        }

        const { data: courses, error: coursesError } = await db
          .from("courses")
          .select("id, name, code")
          .eq("user_id", token.user_id);
        if (coursesError) return json(500, { error: "Could not find the course." });
        const normalizedCode = parsed.data.course_code?.toLowerCase();
        const normalizedName = parsed.data.course_name?.toLowerCase();
        // Match by course code or by course name: the extension sends both, and either one is enough.
        const course = (courses ?? []).find(
          (candidate) =>
            (!!normalizedCode && candidate.code?.toLowerCase() === normalizedCode) ||
            (!!normalizedName && candidate.name.toLowerCase() === normalizedName),
        );
        if (!course)
          return json(404, {
            error: "No matching course. Include an exact course_code or course_name.",
          });

        const { data: items, error: itemsError } = await db
          .from("course_grade_items")
          .select("id, title, score, max_score, weight, is_final")
          .eq("user_id", token.user_id)
          .eq("course_id", course.id);
        if (itemsError) return json(500, { error: "Could not load the course grading scheme." });

        const itemByTitle = new Map((items ?? []).map((item) => [item.title.toLowerCase(), item]));
        const unmatched = parsed.data.grades.filter(
          (grade) => !itemByTitle.has(grade.title.toLowerCase()),
        );
        if (unmatched.length)
          return json(422, {
            error: "Add each assessment to the course grading scheme before syncing its score.",
            unmatched_titles: unmatched.map((grade) => grade.title),
          });

        let updated = 0;
        for (const grade of parsed.data.grades) {
          const item = itemByTitle.get(grade.title.toLowerCase());
          if (!item) continue;
          if (item.score === grade.score && item.max_score === grade.max_score) continue;

          const { error: updateError } = await db
            .from("course_grade_items")
            .update({
              score: grade.score,
              max_score: grade.max_score,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id)
            .eq("user_id", token.user_id);
          if (updateError) return json(500, { error: "Could not save an incoming grade." });

          const { error: notificationError } = await db.from("grade_notifications").insert({
            user_id: token.user_id,
            course_id: course.id,
            grade_item_id: item.id,
            course_name: course.name,
            course_code: course.code,
            grade_title: item.title,
            score: grade.score,
            max_score: grade.max_score,
          });
          if (notificationError)
            return json(500, {
              error: "Grade saved, but its popup notification could not be created.",
            });
          updated += 1;
        }

        return json(200, {
          success: true,
          updated,
          unchanged: parsed.data.grades.length - updated,
          checks_used: quota[0].checks_used,
          checks_per_24_hours: 3,
        });
      },
    },
  },
});
