import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(5).max(100),
});

/** Public VAPID key the browser needs to create a push subscription. */
export const getPushConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    publicKey: process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim() || null,
  }));

/** Saves this device's push subscription so reminders can reach it. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => subscriptionSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("push_subscriptions").upsert(
      {
        user_id: context.userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      { onConflict: "user_id,endpoint" },
    );
    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Forgets this device so it stops receiving reminders. */
export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ endpoint: z.string().url().max(4096) }).parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { success: true };
  });

/** Sends a real push to every device signed up for reminders — proof it works. */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendWebPush } = await import("@/lib/webpush.server");
    const publicKey = process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim();
    const privateKey = process.env["GRADE_PUSH_VAPID_PRIVATE_KEY"]?.trim();
    const subject =
      process.env["GRADE_PUSH_VAPID_SUBJECT"]?.trim() || "https://habit-buddy-app-47.lovable.app";
    if (!publicKey || !privateKey) throw new Error("Phone notifications are not configured yet.");

    const { data: subs, error } = await context.supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth");
    if (error) throw new Error(error.message);

    let sent = 0;
    for (const sub of (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
      const result = await sendWebPush(
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        {
          title: "Ritual reminder test",
          body: "Deadline reminders will pop up here.",
          url: "/",
          tag: "ritual-push-test",
        },
        { publicKey, privateKey, subject },
      );
      if (result.expired) {
        await context.supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", context.userId)
          .eq("endpoint", sub.endpoint);
      } else if (result.ok) {
        sent++;
      }
    }
    if (sent === 0) throw new Error("No device received the test. Turn on phone notifications first.");
    return { sent };
  });
