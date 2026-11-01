import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPushConfig,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/lib/push.functions";

type SetupState = "checking" | "unsupported" | "preview" | "need-home-screen" | "off" | "on";

const isPreviewHost = () => {
  const host = window.location.hostname.toLowerCase();
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com")
  );
};

function withTimeout<T>(promise: Promise<T>, message: string, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds)),
  ]);
}

/**
 * Registers the app service worker (which carries the push handler). If it
 * cannot activate — e.g. during development, or while the published app
 * worker is mid-update — falls back to the standalone push worker.
 */
async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const ready = navigator.serviceWorker.ready;
    return await withTimeout(ready, "app worker did not activate", 8_000);
  } catch {
    return navigator.serviceWorker.register("/push-notifications-sw.js", { scope: "/" });
  }
}

export function PushSetup() {
  const configFn = useServerFn(getPushConfig);
  const saveFn = useServerFn(savePushSubscription);
  const removeFn = useServerFn(removePushSubscription);
  const testFn = useServerFn(sendTestPush);
  const [state, setState] = useState<SetupState>("checking");
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (active) setState("unsupported");
        return;
      }
      if (window.self !== window.top || isPreviewHost()) {
        if (active) setState("preview");
        return;
      }
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installed =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      if (isIos && !installed) {
        if (active) setState("need-home-screen");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (active) setState(subscription ? "on" : "off");
      } catch {
        if (active) setState("off");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setBusy("on");
    try {
      const config = await configFn();
      if (!config.publicKey) throw new Error("Phone notifications are not configured yet.");

      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Allow notifications for Ritual in your phone's settings, then try again.");
      }

      const registration = await withTimeout(
        getPushRegistration(),
        "Ritual could not start its notification service. Refresh and try again.",
        15_000,
      );
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const keyBytes = Uint8Array.from(atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(config.publicKey.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
        subscription = await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes,
          }),
          "Your phone could not subscribe to push notifications. Try again.",
          20_000,
        );
      }
      const keys = subscription.toJSON();
      if (!keys.endpoint || !keys.keys?.p256dh || !keys.keys?.auth) {
        throw new Error("Your phone returned an incomplete notification subscription. Try again.");
      }
      await saveFn({
        data: { endpoint: keys.endpoint, p256dh: keys.keys.p256dh, auth: keys.keys.auth },
      });
      setState("on");
      toast.success("Phone notifications are on. Reminders will pop up even when Ritual is closed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable phone notifications.");
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("off");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await removeFn({ data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Phone notifications are off on this device.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disable phone notifications.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const result = await testFn();
      toast.success(
        result.sent === 1
          ? "Test sent — check your notifications."
          : `Test sent to ${result.sent} devices.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send a test.");
    } finally {
      setBusy(null);
    }
  }

  if (state === "checking") {
    return <p className="text-xs text-ink-soft">Checking notifications…</p>;
  }

  if (state === "unsupported") {
    return (
      <p className="text-xs text-ink-soft">
        This browser can't show phone notifications. Try Safari on iPhone (iOS 16.4 or newer) or Chrome.
      </p>
    );
  }

  if (state === "preview") {
    return (
      <p className="text-xs text-ink-soft">
        Open the published Ritual app in its own tab (not the editor preview) to turn on phone
        notifications.
      </p>
    );
  }

  if (state === "need-home-screen") {
    return (
      <p className="text-xs text-ink-soft">
        On iPhone, first add Ritual to your Home Screen (Share → Add to Home Screen), open Ritual
        from that icon, then come back here to turn on notifications.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={disable}>
            {busy === "off" ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
            Turn off
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={test}>
            {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
            Send test notification
          </Button>
          <span className="text-xs text-ink-soft">On — reminders pop up even when Ritual is closed.</span>
        </>
      ) : (
        <>
          <Button type="button" size="sm" disabled={busy !== null} onClick={enable}>
            {busy === "on" ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
            Turn on phone notifications
          </Button>
          <span className="text-xs text-ink-soft">
            Deadlines will pop up on this device even when Ritual is closed.
          </span>
        </>
      )}
    </div>
  );
}
