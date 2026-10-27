import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
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

/** Address of the grades app that signs students in to GUC. */
export const GRADES_APP_URL = "https://guc-grade-garden.lovable.app";

/** Starts "Connect Grade Garden": a one-time request the grades app returns with its secret. */
export const startGradeConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    limitUser(context.userId, "grade-connect-start", [{ limit: 10, windowMs: MINUTE, label: "connect" }]);
    const state = randomToken();
    const { error } = await context.supabase.from("grade_connect_states").insert({
      state_hash: await sha256Hex(state),
      user_id: context.userId,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    } as never);
    if (error) throw new Error(`Could not start the connection: ${error.message}`);
    const back = "https://habit-buddy-app-47.lovable.app/uni?grades=connected";
    return {
      url: `${GRADES_APP_URL}/connect?state=${state}&return=${encodeURIComponent(back)}`,
    };
  });

/** Disconnects the grades app: its secret stops working right away. */
export const disconnectGradeApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("grade_webhooks").delete().eq("user_id", context.userId);
    if (error) throw new Error("Could not disconnect. Try again.");
    return { ok: true };
  });


/** Triggers a GUC sync from Ritual without exposing the server-side bearer hash to the browser. */
export const syncGucGradesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: connection, error: lookupError } = await context.supabase
      .from("grade_webhooks")
      .select("token_hash")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (lookupError || !connection?.token_hash) {
      throw new Error("GUC is not connected. Connect it again from Ritual.");
    }

    const endpoint = `${GRADES_APP_URL}/api/public/sync-now`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: { Authorization: "Bearer " + connection.token_hash },
      });
    } catch (error) {
      const cause = error && typeof error === "object" && "cause" in error
        ? (error as { cause?: { code?: unknown } }).cause?.code
        : undefined;
      const detail = typeof cause === "string" ? cause : controller.signal.aborted ? "timeout" : "HTTPS request failed";
      throw new Error("Could not reach GradeWatch (" + detail + "). Try again.");
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      let target: URL | null = null;
      try {
        target = location ? new URL(location, endpoint) : null;
      } catch {
        target = null;
      }
      const original = new URL(endpoint);
      const safeRedirect =
        target?.origin === original.origin &&
        target.pathname === original.pathname &&
        target.search === "" &&
        target.hash === "";
      if (!safeRedirect || (response.status !== 307 && response.status !== 308)) {
        throw new Error("GradeWatch redirected the check request (HTTP " + response.status + ").");
      }

      const redirectedController = new AbortController();
      const redirectedTimer = setTimeout(() => redirectedController.abort(), 35_000);
      try {
        response = await fetch(target.toString(), {
          method: "POST",
          redirect: "error",
          signal: redirectedController.signal,
          headers: { Authorization: "Bearer " + connection.token_hash },
        });
      } catch {
        throw new Error("GradeWatch's redirected HTTPS check failed.");
      } finally {
        clearTimeout(redirectedTimer);
      }
    }

    const payload = await response.json().catch(() => ({})) as {
      error?: unknown;
      ok?: unknown;
      total?: unknown;
      changed?: unknown;
    };
    if (!response.ok || payload.ok !== true) {
      if (response.status === 401) throw new Error("The GUC connection expired. Reconnect from Ritual.");
      throw new Error(typeof payload.error === "string" ? payload.error : "GUC could not check grades. Try again.");
    }

    return {
      total: typeof payload.total === "number" ? payload.total : 0,
      changed: typeof payload.changed === "number" ? payload.changed : 0,
    };
  });

const gradePushEndpointSchema = z.object({
  endpoint: z.string().url().max(4096).refine((value) => value.startsWith("https://"), "A secure HTTPS push endpoint is required."),
});

/** Returns the public VAPID key needed by the browser to create a push subscription. */
export const getGradePushConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    publicKey: process.env["GRADE_PUSH_VAPID_PUBLIC_KEY"]?.trim() || null,
  }));

/** Saves this device's push endpoint in Ritual's Lovable Cloud Supabase database. */
export const saveGradePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gradePushEndpointSchema.parse(data))
  .handler(async ({ context, data }) => {
    limitUser(context.userId, "grade-push-subscribe", [{ limit: 10, windowMs: MINUTE, label: "push subscription" }]);
    const { error } = await context.supabase
      .from("grade_push_subscriptions")
      .upsert(
        { user_id: context.userId, endpoint: data.endpoint } as never,
        { onConflict: "user_id,endpoint" },
      );
    if (error) throw new Error("Could not save this phone's notification subscription.");
    return { ok: true };
  });

/** Removes only this device's push endpoint from the signed-in user's subscriptions. */
export const removeGradePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gradePushEndpointSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("grade_push_subscriptions")
      .delete()
      .eq("user_id", context.userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error("Could not disable phone notifications on this device.");
    return { ok: true };
  });
