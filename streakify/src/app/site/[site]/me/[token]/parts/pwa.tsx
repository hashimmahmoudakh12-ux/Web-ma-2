"use client";
/**
 * Home-screen app helpers: service worker, "Add to Home Screen" hint, push opt-in.
 *
 * iPhone notes: web push only works AFTER the page is added to the Home Screen
 * (iOS 16.4+), and only when the customer taps a button and allows it.
 */
import { Bell, BellOff, PlusSquare, Share } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { deletePushAction, savePushAction } from "../actions";

export function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
}

const noop = () => () => {};
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Client-only values without hydration mismatches. */
function useClient<T>(get: () => T, server: T): T {
  return useSyncExternalStore(noop, get, () => server);
}

type BIPEvent = Event & { prompt: () => Promise<void> };

export function InstallCard({ cafeName }: { cafeName: string }) {
  const standalone = useClient(isStandalone, true);
  const ios = useClient(isIOS, false);
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (standalone || hidden || (!ios && !bip)) return null;
  return (
    <div className="card flex items-start gap-3 p-4">
      <PlusSquare className="mt-0.5 h-6 w-6 shrink-0 text-brand-primary" aria-hidden />
      <div className="flex-1 text-sm">
        <p className="font-semibold">Add {cafeName} to your Home Screen</p>
        {ios ? (
          <p className="text-brand-muted">
            Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> then “Add to Home Screen”. It opens like an app and can remind you before your streak ends.
          </p>
        ) : (
          <button type="button" className="pressable mt-2 rounded-full bg-brand-primary px-4 py-1.5 font-semibold text-brand-on-primary" onClick={() => bip?.prompt()}>
            Install app
          </button>
        )}
      </div>
      <button type="button" className="text-brand-muted" onClick={() => setHidden(true)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle({ siteKey, token, vapidKey }: { siteKey: string; token: string; vapidKey: string | null }) {
  const supported = useClient(() => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window, false);
  const ios = useClient(isIOS, false);
  const standalone = useClient(isStandalone, false);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => setOn(Boolean(s)), () => setOn(false));
  }, [supported]);

  if (!vapidKey) return null;
  if (ios && !standalone) return <p className="text-sm text-brand-muted">To get streak reminders on iPhone, add this page to your Home Screen first, then turn them on here.</p>;
  if (!supported) return <p className="text-sm text-brand-muted">This browser can&apos;t show notifications.</p>;

  const toggle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await deletePushAction(siteKey, token, existing.endpoint);
        await existing.unsubscribe();
        setOn(false);
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setMsg("Notifications are blocked. You can allow them in Settings.");
          return;
        }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(vapidKey) });
        await savePushAction(siteKey, token, sub.toJSON());
        setOn(true);
      }
    } catch {
      setMsg("Couldn't change notifications. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" disabled={busy || on === null} onClick={toggle} className="pressable flex w-full items-center justify-between rounded-2xl bg-brand-bg px-4 py-3 disabled:opacity-60">
        <span className="flex items-center gap-2">
          {on ? <Bell className="h-5 w-5 text-brand-primary" /> : <BellOff className="h-5 w-5 text-brand-muted" />}
          Streak reminders on this phone
        </span>
        <span className={`h-7 w-12 rounded-full p-0.5 transition-colors ${on ? "bg-green-500" : "bg-brand-muted/40"}`}>
          <span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ${on ? "translate-x-5" : ""}`} style={{ transitionTimingFunction: "var(--spring)" }} />
        </span>
      </button>
      {msg && <p className="mt-1 text-sm text-red-400">{msg}</p>}
    </div>
  );
}
