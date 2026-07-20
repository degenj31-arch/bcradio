// Guarded PWA registration. Only runs in production on real domains — never in
// Lovable preview iframe, dev, or with ?sw=off.

export function shouldRegisterSW(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!import.meta.env.PROD) return false;
  try { if (window.self !== window.top) return false; } catch { return false; }
  const h = window.location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return false;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return false;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return false;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return false;
  if (new URLSearchParams(window.location.search).has("sw") &&
      new URLSearchParams(window.location.search).get("sw") === "off") return false;
  return true;
}

export async function registerBCradioSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!shouldRegisterSW()) {
    // Unregister any lingering app SWs in refused contexts.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        if (r.active?.scriptURL.endsWith("/sw.js")) await r.unregister();
      }
    } catch { /* noop */ }
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("[pwa] SW register failed", e);
  }
}

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BIPEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
    listeners.forEach((l) => l(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l(false));
  });
}

export function onInstallAvailability(cb: (available: boolean) => void) {
  listeners.add(cb);
  cb(!!deferredPrompt);
  return () => { listeners.delete(cb); };
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((l) => l(false));
  return outcome;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
