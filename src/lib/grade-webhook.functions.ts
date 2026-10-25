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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35_000);
    let response: Response;
    try {
      response = await fetch(`${GRADES_APP_URL}/api/public/sync-now`, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: { Authorization: "Bearer " + connection.token_hash },
      });
    } catch {
      throw new Error("Could not reach GradeWatch to check grades. Try again.");
    } finally {
      clearTimeout(timer);
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
