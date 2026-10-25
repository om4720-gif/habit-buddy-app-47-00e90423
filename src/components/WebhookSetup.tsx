import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createGradeWebhook, getGradeWebhookStatus } from "@/lib/grade-webhook.functions";

/** Creates the secret your grades app uses to send new grades (and popups) to Ritual. */
export function WebhookSetup() {
  const statusFn = useServerFn(getGradeWebhookStatus);
  const createFn = useServerFn(createGradeWebhook);
  const { data: hook, refetch } = useQuery({ queryKey: ["grade-webhook"], queryFn: () => statusFn(), retry: false });
  const [token, setToken] = useState<string | null>(null);
  const url = typeof window !== "undefined" ? `${window.location.origin}/api/public/grades` : "";

  async function create() {
    if (hook && !window.confirm("Create a new secret? The old one stops working right away.")) return;
    try {
      const r = await createFn();
      setToken(r.token);
      await refetch();
      toast.success("Secret created. Copy it now; it's shown once.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the secret");
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">Your grades app → Ritual notifications</p>
      <p className="text-xs text-ink-soft">
        Your grades app sends a message here when a new grade is posted. Ritual saves it and shows a popup.
        {hook ? ` Secret created ${new Date(hook.created_at).toLocaleString()}.` : " No secret yet."}
        {hook?.last_seen_at ? ` Last message: ${new Date(hook.last_seen_at).toLocaleString()} → ${hook.last_result}.` : hook ? " No message received yet." : ""}
      </p>
      {token ? (
        <div className="space-y-2 rounded-xl bg-cream p-3">
          <p className="text-xs text-ink-soft">Address (POST here):</p>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-line bg-background px-2 py-1 text-xs text-ink" />
          <p className="text-xs text-ink-soft">Secret (send as “Authorization: Bearer …”). Shown once:</p>
          <input readOnly value={token} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-line bg-background px-2 py-1 text-xs text-ink" />
          <p className="text-[11px] text-ink-soft">Body (JSON): {`{"course":"Steel Design","item":"Quiz 1","grade":"9 / 10"}`}</p>
        </div>
      ) : null}
      <Button type="button" size="sm" className="rounded-full" onClick={create}>
        {hook ? "Create a new secret" : "Create secret for my grades app"}
      </Button>
    </div>
  );
}
