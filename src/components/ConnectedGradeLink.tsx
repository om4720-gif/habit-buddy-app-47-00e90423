import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  disconnectGradeApp,
  getGradePushConfig,
  getGradeWebhookStatus,
  removeGradePushSubscription,
  saveGradePushSubscription,
  startGradeConnect,
  syncGucGradesNow,
} from "@/lib/grade-webhook.functions";

function decodeApplicationServerKey(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Starts the one-time GUC login exchange without exposing either app's secret to the student. */
export function ConnectedGradeLink() {
  const statusFn = useServerFn(getGradeWebhookStatus);
  const connectFn = useServerFn(startGradeConnect);
  const disconnectFn = useServerFn(disconnectGradeApp);
  const syncFn = useServerFn(syncGucGradesNow);
  const pushConfigFn = useServerFn(getGradePushConfig);
  const savePushFn = useServerFn(saveGradePushSubscription);
  const removePushFn = useServerFn(removeGradePushSubscription);
  const [syncing, setSyncing] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [phoneAlertsEnabled, setPhoneAlertsEnabled] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    let active = true;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setPhoneAlertsEnabled(Boolean(subscription));
      })
      .catch(() => {
        if (active) setPhoneAlertsEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);
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

  async function togglePhoneAlerts() {
    setPushBusy(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        toast.error("Phone push notifications are not supported in this browser.");
        return;
      }

      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isInstalled = window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (isIos && !isInstalled) {
        toast.error("On iPhone, add Ritual to the Home Screen and open it there before enabling phone alerts.");
        return;
      }

      const config = await pushConfigFn();
      if (!config.publicKey) {
        toast.error("Phone alerts need VAPID keys to be configured in Lovable Cloud first.");
        return;
      }

      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Allow notifications for Ritual in your phone's settings, then try again.");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(config.publicKey),
        });
      }
      await savePushFn({ data: { endpoint: subscription.endpoint } });
      setPhoneAlertsEnabled(true);
      toast.success("Phone grade alerts are enabled on this device.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable phone alerts.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePhoneAlerts() {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushFn({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setPhoneAlertsEnabled(false);
      toast.success("Phone alerts are disabled on this device.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disable phone alerts.");
    } finally {
      setPushBusy(false);
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void (phoneAlertsEnabled ? disablePhoneAlerts() : togglePhoneAlerts())}
              disabled={pushBusy}
            >
              {pushBusy ? "Saving…" : phoneAlertsEnabled ? "Disable phone alerts" : "Enable phone alerts"}
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
