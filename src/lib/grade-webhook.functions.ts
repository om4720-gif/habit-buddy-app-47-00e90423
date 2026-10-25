import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MINUTE, limitUser } from "@/lib/rate-limit.server";

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

export const sha256Hex = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Creates (or replaces) the webhook secret. The secret is returned once; only its hash is stored. */
export const createGradeWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    limitUser(context.userId, "grade-webhook-create", [{ limit: 5, windowMs: MINUTE, label: "webhook" }]);
    const token = randomToken();
    const { error } = await context.supabase
      .from("grade_webhooks")
      .upsert({ user_id: context.userId, token_hash: await sha256Hex(token), created_at: new Date().toISOString() } as never, {
        onConflict: "user_id",
      });
    if (error) throw new Error(`Could not create the webhook: ${error.message}`);
    return { token };
  });

export const getGradeWebhookStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("grade_webhooks")
      .select("created_at, last_seen_at, last_result")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });
