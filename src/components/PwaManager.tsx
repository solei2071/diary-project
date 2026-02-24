"use client";

import { RefreshCw, Download, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type RegistrationState = {
  hasUpdate: boolean;
  waitingWorker: ServiceWorker | null;
};

const isSafariLike = () =>
  /^((?!chrome|android|crios|fxios|edgios).)*(safari|applewebkit)/i.test(navigator.userAgent);

export default function PwaManager() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [registration, setRegistration] = useState<RegistrationState>({
    hasUpdate: false,
    waitingWorker: null
  });

  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // silent
    } finally {
      setDeferredPrompt(null);
      setCanInstall(false);
    }
  }, [deferredPrompt]);

  const dismissInstallBanner = useCallback(() => {
    setCanInstall(false);
    setDeferredPrompt(null);
  }, []);

  const applyUpdate = useCallback(() => {
    if (!registration.waitingWorker) return;
    registration.waitingWorker.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }, [registration.waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setRegistration((prev) => ({ ...prev, hasUpdate: false }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setIsOnline(navigator.onLine);
    setIsStandalone(Boolean(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone));

    const updateNetworkStatus = () => {
      setIsOnline(navigator.onLine);
    };

    const installPromptHandler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
    };

    const onControllerChange = () => {
      setRegistration((prev) => ({ ...prev, hasUpdate: false, waitingWorker: null }));
    };

    const register = async () => {
      if (!("serviceWorker" in navigator)) return;

      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        if (reg.waiting) {
          setRegistration({ hasUpdate: true, waitingWorker: reg.waiting });
        }

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          const onStateChange = () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setRegistration((prev) => ({
                ...prev,
                hasUpdate: true,
                waitingWorker: reg.waiting
              }));
            }
          };

          newWorker.addEventListener("statechange", onStateChange);
        });

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      } catch {
        // No hard fail, 앱은 네트워크로 계속 동작
      }
    };

    window.addEventListener("beforeinstallprompt", installPromptHandler);
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);

    void register();

    return () => {
      window.removeEventListener("beforeinstallprompt", installPromptHandler);
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!isOnline && !isStandalone) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 border-b border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-2 text-xs text-[var(--danger)]">
        <p className="text-center">You are offline. Some recent changes may not be saved.</p>
      </div>
    );
  }

  return (
    <>
      {!isOnline ? (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-2 text-xs text-[var(--danger)]">
          <p className="text-center">You are offline. Some recent changes may not be saved.</p>
        </div>
      ) : null}

      {registration.hasUpdate ? (
        <div className="fixed inset-x-0 bottom-3 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
          <RefreshCw className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[var(--ink)]">A new version is available.</span>
          <button onClick={applyUpdate} className="rounded bg-[var(--primary)] px-2 py-1 font-semibold text-white">
            Update
          </button>
          <button onClick={dismissUpdate} className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-light)]">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {canInstall ? (
        <div className="fixed inset-x-0 bottom-12 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
          <Download className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[var(--ink)]">Add to Home Screen for App-like experience.</span>
          <button
            onClick={handleInstall}
            className="rounded bg-[var(--primary)] px-2 py-1 font-semibold text-white"
          >
            Install
          </button>
          <button onClick={dismissInstallBanner} className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-light)]">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : isIos() && !isStandalone ? (
        <div className="fixed inset-x-0 bottom-3 z-50 mx-auto flex w-[min(92vw,36rem)] flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[0.72rem] text-[var(--ink)] shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
          <p className="grow">iPhone/iPad Safari: Safari 메뉴(Share) → Add to Home Screen.</p>
          {isSafariLike() ? null : (
            <button onClick={dismissInstallBanner} className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-light)]">
              <XCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
