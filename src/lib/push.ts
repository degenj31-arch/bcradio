// Client-side push notification helpers for BCradio daily broadcast alerts.
import { supabase } from "@/integrations/supabase/client";

// VAPID application server public key (safe to ship to the browser).
export const VAPID_PUBLIC_KEY =
  "BCvEKEpXPX1E1e8YHsjpXq0JjmIX8Vwqaw5pWIAh2IvYYdSjzNmDdPJ-TpbPE5jsgoUiWeIRR69Mt8k2u_97xTU";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function enableBroadcastNotifications(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  if (!pushSupported()) {
    return { ok: false, reason: "This browser doesn't support notifications. Install the app first." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "Notification permission denied." };

  // Make sure a service worker actually exists before waiting on `ready`
  // (otherwise the promise hangs forever and nothing ever subscribes).
  let reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => null);
  }
  if (!reg) {
    return { ok: false, reason: "Notifications need the installed BCradio app (open bcradio.lovable.app directly, then Install)." };
  }
  await navigator.serviceWorker.ready.catch(() => null);
  reg = (await navigator.serviceWorker.getRegistration()) ?? reg;


  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "Could not read the push subscription." };
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, reason: error.message };

  await reg.showNotification("BCradio notifications on", {
    body: "You'll hear from us at 7:30 AM and 9:00 PM ET.",
    icon: "/icon-512.png",
    badge: "/icon-512.png",
    tag: "bcradio-welcome",
  });

  return { ok: true };
}

export async function disableBroadcastNotifications(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
