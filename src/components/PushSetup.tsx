import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPushConfig,
  removePushSubscription,
  resetPushSubscriptions,
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
  const resetFn = useServerFn(resetPushSubscriptions);
  const [state, setState] = useState<SetupState>("checking");
  const [busy, setBusy] = useState<"on" | "off" | "test" | "reset" | null>(null);

  // The service worker reports back when it receives and displays a push.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; stage?: string; error?: string } | null;
      if (message?.type !== "ritual-push") return;
      if (message.stage === "shown") {
        toast.success("This device received the notification and displayed it.");
      } else {
        toast.error(`This device received the push but could not show it: ${message.error ?? "unknown error"}`);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

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
      const subKeys = keys.keys as { p256dh: string; auth: string } | undefined;
      if (!keys.endpoint || !subKeys?.p256dh || !subKeys?.auth) {
        throw new Error("Your phone returned an incomplete notification subscription. Try again.");
      }
      await saveFn({
        data: { endpoint: keys.endpoint, p256dh: subKeys.p256dh, auth: subKeys.auth },
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
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (!subscription) {
        setState("off");
        throw new Error("This device has no active subscription. Turn phone notifications on again.");
      }
      const result = await testFn({ data: { endpoint: subscription.endpoint } });
      const device = result.devices[0];
      if (!device) throw new Error("No device was tested.");
      if (device.ok) {
        toast.success(
          `Push accepted by ${device.service} (${device.status}). Waiting for this device to show it…`,
        );
      } else if (device.expired) {
        setState("off");
        await subscription.unsubscribe().catch(() => {});
        toast.error(
          `${device.service} says this subscription has expired (${device.status}). Turn notifications on again.`,
        );
      } else {
        toast.error(
          `${device.service} rejected the push (${device.status || "network error"})${device.error ? `: ${device.error}` : ""}. Tap Reset devices and turn notifications on again.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send a test.");
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy("reset");
    try {
      await resetFn();
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) await subscription.unsubscribe().catch(() => {});
      setState("off");
      toast.success("All saved devices were removed. Turn notifications on again on your phone.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reset devices.");
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
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={reset}>
            {busy === "reset" ? <Loader2 className="size-4 animate-spin" /> : null}
            Reset devices
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
