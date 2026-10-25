import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { disconnectGradeApp, getGradeWebhookStatus, startGradeConnect } from "@/lib/grade-webhook.functions";

/** Connects the grades app (Grade Garden). The student signs in to GUC there; nothing to copy or paste. */
export function WebhookSetup() {
  const statusFn = useServerFn(getGradeWebhookStatus);
  const startFn = useServerFn(startGradeConnect);
  const disconnectFn = useServerFn(disconnectGradeApp);
  const { data: hook, refetch } = useQuery({ queryKey: ["grade-webhook"], queryFn: () => statusFn(), retry: false });

  async function connect() {
    try {
      const r = await startFn();
      window.location.href = r.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the connection");
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect the grades app? New grades will stop arriving.")) return;
    await disconnectFn();
    await refetch();
    toast.success("Disconnected");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">Grade Garden</p>
      {hook ? (
        <>
          <p className="text-xs text-ink-soft">
            Connected since {new Date(hook.created_at).toLocaleString()}. Grades and notifications arrive automatically.
            {hook.last_seen_at ? ` Last update: ${new Date(hook.last_seen_at).toLocaleString()}.` : ""}
          </p>
          <Button type="button" size="sm" variant="ghost" className="rounded-full" onClick={disconnect}>
            Disconnect
          </Button>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-soft">
            Connect Grade Garden to sign in to GUC once. Your grades and alerts then arrive here automatically.
          </p>
          <Button type="button" size="sm" className="rounded-full" onClick={connect}>
            Connect Grade Garden
          </Button>
        </>
      )}
    </div>
  );
}
