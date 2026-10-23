import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { encryptText } from "@/lib/feed-crypto.server";
import { checkFeedUrl } from "@/lib/feed-fetch.server";
import { syncFeed } from "@/lib/feed-sync.server";
import { MINUTE, limitUser } from "@/lib/rate-limit.server";

/** Connects a grades link. It is encrypted before it is stored, and only its host is shown back. */
export const connectGradeFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        url: z.string().min(10).max(2048),
        key: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    limitUser(context.userId, "grade-feed-connect", [{ limit: 10, windowMs: MINUTE, label: "connect" }]);
    const checked = checkFeedUrl(data.url);
    if (!checked.ok) throw new Error(checked.error);
    const key = data.key?.trim() || undefined;
    const encrypted = await encryptText(JSON.stringify({ url: checked.url.toString(), key }));
    const { error } = await context.supabase.from("grade_feeds").upsert(
      {
        user_id: context.userId,
        encrypted_url: encrypted,
        host: checked.url.hostname,
        enabled: true,
        last_status: "connected",
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error("Could not save the link. Try again.");
    return { host: checked.url.hostname };
  });

export const disconnectGradeFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("grade_feeds").delete().eq("user_id", context.userId);
    if (error) throw new Error("Could not disconnect. Try again.");
    return { ok: true };
  });

export const getGradeFeedStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("grade_feeds")
      .select("host, last_checked_at, last_status, enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

/** Checks the connected link now, instead of waiting for the next scheduled check. */
export const syncGradeFeedNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    limitUser(context.userId, "grade-feed-now", [{ limit: 6, windowMs: MINUTE, label: "check" }]);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: feed } = await db
      .from("grade_feeds")
      .select("id, user_id, encrypted_url")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!feed) throw new Error("No grades link is connected.");
    const result = await syncFeed(db as never, feed);
    return { status: result.status, updated: result.updated, notified: result.notified };
  });
