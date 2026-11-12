// Server-only: sends the phone push for deadlines that are inside their reminder window
// (quizzes 2 days before, assignments 1 day before) and haven't been reminded yet.
// Used by the hourly job and right after a deadline is added or its date changes.

import {
  addDaysIso,
  cairoToday,
  daysUntilDue,
  isDueForReminder,
  reminderTitle,
  type DeadlineLike,
} from "@/lib/reminder";

type DeadlineQueryRow = DeadlineLike & { courses?: { name?: string } | null };
type Sub = { endpoint: string; p256dh: string; auth: string };

export type DeadlinePushResult = {
  configured: boolean;
  checked: number;
  sent: number;
  expired: number;
};

export async function sendDueDeadlineReminders(
  options: { deadlineId?: string; userId?: string } = {},
): Promise<DeadlinePushResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendWebPush } = await import("@/lib/webpush.server");

  const publicKey = process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim();
  const privateKey = process.env["GRADE_PUSH_VAPID_PRIVATE_KEY"]?.trim();
  const subject =
    process.env["GRADE_PUSH_VAPID_SUBJECT"]?.trim() || "https://habit-buddy-app-47.lovable.app";
  if (!publicKey || !privateKey) return { configured: false, checked: 0, sent: 0, expired: 0 };
  const vapid = { publicKey, privateKey, subject };

  const today = cairoToday();
  let query = supabaseAdmin
    .from("deadlines")
    .select("id, user_id, title, kind, due_date, courses(name)")
    .eq("completed", false)
    .is("reminder_sent_at", null)
    .gte("due_date", today)
    .lte("due_date", addDaysIso(today, 2));
  if (options.deadlineId) query = query.eq("id", options.deadlineId);
  if (options.userId) query = query.eq("user_id", options.userId);
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const due = ((rows ?? []) as DeadlineQueryRow[]).filter((row) => isDueForReminder(row, today));

  const userIds = [...new Set(due.map((row) => row.user_id))];
  const subsByUser = new Map<string, Sub[]>();
  if (userIds.length > 0) {
    const { data: subs, error: subsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (subsError) throw new Error(subsError.message);
    for (const sub of (subs ?? []) as (Sub & { user_id: string })[]) {
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

  return { configured: true, checked: due.length, sent, expired };
}

/** Accepts the scheduler's bearer token: the project's CRON_SECRET, or Lovable's managed cron secret. */
export async function cronAuthFailure(request: Request): Promise<Response | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  const secret = process.env["CRON_SECRET"];
  if (secret && token) {
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
    if (timingSafeEqual(digest(token), digest(secret))) return null;
  }
  if (process.env["LOVABLE_CRON_SECRET"]) {
    const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
    return authenticateCronRequest(request);
  }
  return new Response("Unauthorized", { status: 401 });
}
