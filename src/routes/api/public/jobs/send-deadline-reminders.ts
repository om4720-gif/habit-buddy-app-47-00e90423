import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import {
  addDaysIso,
  cairoToday,
  daysUntilDue,
  isDueForReminder,
  reminderTitle,
  type DeadlineLike,
} from "@/lib/reminder";

type DeadlineQueryRow = DeadlineLike & { courses?: { name?: string } | null };

/**
 * Scheduled hourly job: pushes a reminder for every deadline inside its
 * reminder window (quizzes 2 days before, assignments 1 day before) that has
 * not been reminded yet. Called by the managed HTTP schedule with a bearer
 * credential this handler verifies.
 */
export const Route = createFileRoute("/api/public/jobs/send-deadline-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendWebPush } = await import("@/lib/webpush.server");

        const publicKey = process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim();
        const privateKey = process.env["GRADE_PUSH_VAPID_PRIVATE_KEY"]?.trim();
        const subject =
          process.env["GRADE_PUSH_VAPID_SUBJECT"]?.trim() || "https://habit-buddy-app-47.lovable.app";
        if (!publicKey || !privateKey) {
          return Response.json({ success: true, configured: false, sent: 0 });
        }
        const vapid = { publicKey, privateKey, subject };

        const today = cairoToday();
        const { data: rows, error } = await supabaseAdmin
          .from("deadlines")
          .select("id, user_id, title, kind, due_date, courses(name)")
          .eq("completed", false)
          .is("reminder_sent_at", null)
          .gte("due_date", today)
          .lte("due_date", addDaysIso(today, 2));
        if (error) throw new Error(error.message);

        const due = ((rows ?? []) as DeadlineQueryRow[]).filter((row) =>
          isDueForReminder(row, today),
        );

        const userIds = [...new Set(due.map((row) => row.user_id))];
        const subsByUser = new Map<string, { endpoint: string; p256dh: string; auth: string }[]>();
        if (userIds.length > 0) {
          const { data: subs, error: subsError } = await supabaseAdmin
            .from("push_subscriptions")
            .select("user_id, endpoint, p256dh, auth")
            .in("user_id", userIds);
          if (error) throw new Error(subsError.message);
          for (const sub of (subs ?? []) as {
            user_id: string;
            endpoint: string;
            p256dh: string;
            auth: string;
          }[]) {
            const list = subsByUser.get(sub.user_id) ?? [];
            list.push({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth });
            subsByUser.set(sub.user_id, list);
          }
        }

        let sent = 0;
        let expired = 0;
        for (const row of due) {
          const days = daysUntilDue(row.due_date, today);
          const title = reminderTitle(row.kind, days);
          const body = row.courses?.name ? `${row.title} — ${row.courses.name}` : row.title;
          let rowSent = 0;
          for (const sub of subsByUser.get(row.user_id) ?? []) {
            const result = await sendWebPush(
              sub.endpoint,
              sub.p256dh,
              sub.auth,
              { title, body, url: "/uni", tag: `ritual-deadline-${row.id}` },
              vapid,
            );
            if (result.expired) {
              expired++;
              await supabaseAdmin
                .from("push_subscriptions")
                .delete()
                .eq("user_id", row.user_id)
                .eq("endpoint", sub.endpoint);
            } else if (result.ok) {
              rowSent++;
            }
          }
          if (rowSent > 0) {
            sent += rowSent;
            await supabaseAdmin
              .from("deadlines")
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq("id", row.id);
          }
        }

        return Response.json({ success: true, configured: true, checked: due.length, sent, expired });
      },
    },
  },
});
