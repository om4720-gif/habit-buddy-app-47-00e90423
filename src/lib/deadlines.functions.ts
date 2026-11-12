import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDeadlines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const supabase = context.supabase;
  const { data, error } = await supabase
    .from("deadlines")
    .select("*, courses(name, color)")
    .order("due_date", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const createDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        courseId: z.string().uuid(),
        title: z.string().min(1).max(300),
        kind: z.enum(["assignment", "quiz"]),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: created, error } = await supabase
      .from("deadlines")
      .insert({
        course_id: data.courseId,
        title: data.title,
        kind: data.kind,
        due_date: data.dueDate,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await pushIfDueSoon((created as { id: string } | null)?.id, context.userId);
    return { success: true };
  });

/**
 * If a deadline is already inside its reminder window (e.g. added the day before it's due),
 * send its phone push now instead of waiting for the hourly job. Never fails the save.
 */
async function pushIfDueSoon(deadlineId: string | undefined, userId: string) {
  if (!deadlineId) return;
  try {
    const { sendDueDeadlineReminders } = await import("@/lib/deadline-push.server");
    await sendDueDeadlineReminders({ deadlineId, userId });
  } catch (error) {
    console.error("Deadline push failed:", error);
  }
}

export const updateDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        deadlineId: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        kind: z.enum(["assignment", "quiz"]).optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        completed: z.boolean().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const updates: Database["public"]["Tables"]["deadlines"]["Update"] = {
      updated_at: new Date().toISOString(),
    };
    if (data.title !== undefined) updates.title = data.title;
    if (data.kind !== undefined) updates.kind = data.kind;
    if (data.dueDate !== undefined) {
      updates.due_date = data.dueDate;
      // A new date gets a fresh reminder.
      updates.reminder_sent_at = null;
    }
    if (data.completed !== undefined) updates.completed = data.completed;
    const { error } = await supabase
      .from("deadlines")
      .update(updates)
      .eq("id", data.deadlineId);
    if (error) throw new Error(error.message);
    if (data.dueDate !== undefined || data.completed === false) {
      await pushIfDueSoon(data.deadlineId, context.userId);
    }
    return { success: true };
  });

export const deleteDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => z.object({ deadlineId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { error } = await supabase
      .from("deadlines")
      .delete()
      .eq("id", data.deadlineId);
    if (error) throw new Error(error.message);
    return { success: true };
  });
