import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  disconnectGradeApp,
  getGradeWebhookStatus,
  startGradeConnect,
  syncGucGradesNow,
} from "@/lib/grade-webhook.functions";

/** Starts the one-time GUC login exchange without exposing either app's secret to the student. */
export function ConnectedGradeLink() {
  const statusFn = useServerFn(getGradeWebhookStatus);
  const connectFn = useServerFn(startGradeConnect);
  const disconnectFn = useServerFn(disconnectGradeApp);
  const syncFn = useServerFn(syncGucGradesNow);
  const [syncing, setSyncing] = useState(false);
  const { data: connection, isPending, refetch } = useQuery({
    queryKey: ["grade-webhook-status"],
    queryFn: () => statusFn(),
    retry: false,
  });

  async function connect() {
    try {
      const result = await connectFn();
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the GUC connection.");
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect GUC grade updates from Ritual?")) return;
    try {
      await disconnectFn();
      await refetch();
      toast.success("GUC grade connection disconnected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect.");
    }
  }

  async function checkNow() {
    setSyncing(true);
    try {
      const result = await syncFn();
      await refetch();
      toast.success(`Check complete: ${result.total} grade items read, ${result.changed} changed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check GUC grades.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-sm font-semibold text-ink">Connect to Ritual</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
        Sign in to GUC once. New or changed grades will sync automatically every few hours. You will not need to copy API keys.
      </p>
      {connection ? (
        <>
          <p className="mt-3 text-sm font-medium text-ink">GUC grades are connected.</p>
          {connection.last_seen_at && (
            <p className="mt-1 text-xs text-ink-soft">
              Last grade received: {new Date(connection.last_seen_at).toLocaleString()}.
            </p>
          )}
          {connection.last_result && (
            <p className="mt-1 text-xs text-ink-soft">Last result: {connection.last_result}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" className="rounded-full" onClick={() => void checkNow()} disabled={syncing}>
              {syncing ? "Checking GUC…" : "Check now"}
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void connect()} disabled={isPending}>
              Reconnect GUC
            </Button>
            <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" size="sm" className="mt-3 rounded-full" onClick={() => void connect()} disabled={isPending}>
          Connect GUC
        </Button>
      )}
    </div>
  );
}
