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

/** Removes every saved device for this user, so stale subscriptions stop counting as "sent". */
export const resetPushSubscriptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    await context.supabase.from("grade_push_subscriptions").delete().eq("user_id", context.userId);
    return { success: true };
  });

export type TestPushDevice = {
  service: string;
  status: number;
  ok: boolean;
  expired: boolean;
  error?: string | undefined;
};

/**
 * Sends a real test push. With an endpoint, only that device is tested, so old dead
 * subscriptions can't make it look like it worked. Returns the push service's answer
 * (HTTP status and error text) for each device.
 */
export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ endpoint: z.string().url().max(4096).optional() }).optional().parse(data),
  )
  .handler(async ({ context, data }) => {
    const { sendWebPush } = await import("@/lib/webpush.server");
    const publicKey = process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim();
    const privateKey = process.env["GRADE_PUSH_VAPID_PRIVATE_KEY"]?.trim();
    const subject =
      process.env["GRADE_PUSH_VAPID_SUBJECT"]?.trim() || "https://habit-buddy-app-47.lovable.app";
    if (!publicKey || !privateKey) throw new Error("Phone notifications are not configured yet.");

    let query = context.supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", context.userId);
    if (data?.endpoint) query = query.eq("endpoint", data.endpoint);
    const { data: subs, error } = await query;
    if (error) throw new Error(error.message);
    if (!subs || subs.length === 0) {
      throw new Error(
        data?.endpoint
          ? "This device isn't saved on your account. Tap Reset devices, then turn notifications on again."
          : "No devices are saved. Turn on phone notifications first.",
      );
    }

    const devices: TestPushDevice[] = [];
    for (const sub of subs as { endpoint: string; p256dh: string; auth: string }[]) {
      const result = await sendWebPush(
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        {
          title: "Ritual test",
          body: "If you can see this, grade and deadline alerts will reach this device.",
          url: "/",
          tag: `ritual-push-test-${Date.now()}`,
        },
        { publicKey, privateKey, subject },
      );
      devices.push({
        service: new URL(sub.endpoint).hostname,
        status: result.status,
        ok: result.ok,
        expired: result.expired,
        error: result.error,
      });
      if (result.expired) {
        await context.supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", context.userId)
          .eq("endpoint", sub.endpoint);
      }
    }
    return { devices, sent: devices.filter((d) => d.ok).length };
  });
