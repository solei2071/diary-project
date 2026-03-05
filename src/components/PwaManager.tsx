"use client";

import { Download, RefreshCw, WifiOff, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadNotificationSettings,
  msUntilReminderTime,
  showDailyReminder
} from "@/lib/notifications";

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type RegistrationState = {
  hasUpdate: boolean;
  waitingWorker: ServiceWorker | null;
};

const HINT_DISMISSED_KEY = "daily-diary-ios-hint-dismissed-v1";
const INSTALL_BANNER_DISMISSED_KEY = "daily-diary-install-banner-dismissed-v1";

const isIos = (userAgent: string) => /iphone|ipad|ipod/i.test(userAgent);

const isSafariLike = (userAgent: string) =>
  /^((?!chrome|android|crios|fxios|edgios).)*(safari|applewebkit)/i.test(userAgent);

type AppLanguage = "en" | "ko";
type Props = { appLanguage?: AppLanguage };

const setDismissed = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // localStorage may be blocked in some privacy modes.
  }
};

const isDismissed = (key: string) => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const resolveAppLanguage = (appLanguage?: AppLanguage) => {
  if (typeof window === "undefined") {
    return "en";
  }
  if (appLanguage === "en" || appLanguage === "ko") {
    return appLanguage;
  }
  const stored = localStorage.getItem("diary-language");
  if (stored === "en" || stored === "ko") {
    return stored;
  }
  if (document.documentElement.lang?.toLowerCase().startsWith("ko")) {
    return "ko";
  }
  const browserLanguage = window.navigator.language.toLowerCase();
  return browserLanguage.startsWith("ko") ? "ko" : "en";
};

export default function PwaManager({ appLanguage: appLanguageProp }: Props) {
  const [canInstall, setCanInstall] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [isSafariBrowser, setIsSafariBrowser] = useState(false);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [isKorean, setIsKorean] = useState(resolveAppLanguage(appLanguageProp) === "ko");
  const [registration, setRegistration] = useState<RegistrationState>({
    hasUpdate: false,
    waitingWorker: null
  });

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } catch {
      // Silent fail path: keep UX stable on unsupported installs.
    } finally {
      setDeferredPrompt(null);
      setCanInstall(false);
      setDismissed(INSTALL_BANNER_DISMISSED_KEY);
    }
  }, [deferredPrompt]);

  const dismissInstallBanner = useCallback(() => {
    setCanInstall(false);
    setDeferredPrompt(null);
    setDismissed(INSTALL_BANNER_DISMISSED_KEY);
  }, []);

  const dismissIosHint = useCallback(() => {
    setShowIosInstallHint(false);
    setDismissed(HINT_DISMISSED_KEY);
  }, []);

  const applyUpdate = useCallback(() => {
    if (!registration.waitingWorker) return;
    registration.waitingWorker.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  }, [registration.waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setRegistration((prev) => ({ ...prev, hasUpdate: false }));
  }, []);

  const syncLanguage = useCallback(
    (nextLanguage?: AppLanguage) => {
      setIsKorean(resolveAppLanguage(nextLanguage) === "ko");
    },
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const ua = navigator.userAgent;
    const ios = isIos(ua);
    const safari = isSafariLike(ua);
    setIsIosDevice(ios);
    setIsSafariBrowser(safari);
    setShowIosInstallHint(!isDismissed(HINT_DISMISSED_KEY) && ios);
    setIsOnline(navigator.onLine);
    setIsStandalone(Boolean(window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone));
    setCanInstall(!isDismissed(INSTALL_BANNER_DISMISSED_KEY));

    const scheduleReminder = () => {
      const settings = loadNotificationSettings();
      if (!settings.enabled) return;
      if (!("Notification" in window) || Notification.permission !== "granted") return;

      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);

      const ms = msUntilReminderTime(settings.reminderTime);
      notifTimerRef.current = setTimeout(() => {
        showDailyReminder(loadNotificationSettings());
        scheduleReminder();
      }, ms);
    };

    const updateNetworkStatus = () => {
      const nowOnline = navigator.onLine;
      setIsOnline((prev) => {
        if (!prev && nowOnline) {
          setJustReconnected(true);
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => setJustReconnected(false), 3000);
        }
        return nowOnline;
      });
    };

    const installPromptHandler = (event: Event) => {
      event.preventDefault();
      if (isDismissed(INSTALL_BANNER_DISMISSED_KEY)) return;
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setCanInstall(true);
      setShowIosInstallHint(false);
    };

    const onControllerChange = () => {
      setRegistration((prev) => ({ ...prev, hasUpdate: false, waitingWorker: null }));
    };

    const onStorageChange = (event: StorageEvent) => {
      if (event.key === "diary-language" || event.key === null) {
        syncLanguage();
      }
    };

    const langObserver = new MutationObserver(() => {
      syncLanguage();
    });

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
        // No hard fail, app should continue without SW.
      }
    };

    scheduleReminder();
    syncLanguage();
    window.addEventListener("beforeinstallprompt", installPromptHandler);
    window.addEventListener("storage", onStorageChange);
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    void register();

    return () => {
      window.removeEventListener("beforeinstallprompt", installPromptHandler);
      window.removeEventListener("storage", onStorageChange);
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
      navigator.serviceWorker?.removeEventListener("controllerchange", onControllerChange);
      langObserver.disconnect();

      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [applyUpdate, syncLanguage, setIsOnline, setIsStandalone, setCanInstall, setShowIosInstallHint, setIsIosDevice, setIsSafariBrowser]);

  const showOfflineBanner = !isOnline;
  const showInstallBanner = canInstall && Boolean(deferredPrompt);

  return (
    <>
      {showOfflineBanner ? (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-1.5 border-b border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-2 text-xs text-[var(--danger)]"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
          role="status"
          aria-live="polite"
        >
          <WifiOff size={12} />
          <span>{isKorean ? "오프라인 상태입니다. 변경사항이 저장되지 않을 수 있습니다." : "You are offline. Recent changes may not be saved."}</span>
        </div>
      ) : justReconnected ? (
        <div
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-1.5 border-b border-[var(--success)] bg-[var(--success-bg)] px-4 py-2 text-xs text-[var(--success)]"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
        >
          <span>✓ {isKorean ? "인터넷에 다시 연결되었습니다." : "Back online."}</span>
        </div>
      ) : null}

      {registration.hasUpdate ? (
        <div className="fixed inset-x-0 bottom-3 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
          <RefreshCw className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[var(--ink)]">
            {isKorean ? "새로운 버전이 배포되었습니다." : "A new version has been deployed."}
          </span>
          <button
            onClick={applyUpdate}
            className="rounded bg-[var(--primary)] px-2 py-1 font-semibold text-white"
            aria-label={isKorean ? "새 버전 업데이트" : "Update now"}
          >
            {isKorean ? "업데이트" : "Update"}
          </button>
          <button
            onClick={dismissUpdate}
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-light)]"
            aria-label={isKorean ? "업데이트 알림 닫기" : "Dismiss update notice"}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {showInstallBanner ? (
        <div className="fixed inset-x-0 bottom-12 z-50 mx-auto flex w-fit max-w-[92vw] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
          <Download className="h-4 w-4 text-[var(--primary)]" />
          <span className="text-[var(--ink)]">
            {isKorean ? "홈 화면에 추가해 앱처럼 사용하세요." : "Add to Home screen to use it like an app."}
          </span>
          <button
            onClick={handleInstall}
            className="rounded bg-[var(--primary)] px-2 py-1 font-semibold text-white"
            aria-label={isKorean ? "홈 화면에 추가" : "Add to Home Screen"}
          >
            {isKorean ? "설치" : "Install"}
          </button>
          <button
            onClick={dismissInstallBanner}
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-light)]"
            aria-label={isKorean ? "설치 배너 닫기" : "Dismiss install banner"}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : isIosDevice && !isStandalone && showIosInstallHint ? (
        <div className="fixed inset-x-0 bottom-3 z-50 mx-auto flex w-[min(92vw,36rem)] flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[0.72rem] text-[var(--ink)] shadow-[0_8px_30px_rgba(0,0,0,0.16)]">
          <p className="grow">
            {isSafariBrowser
              ? isKorean
                ? "iPhone/iPad Safari: 공유 버튼 → 홈 화면에 추가."
                : "iPhone/iPad Safari: Tap share → Add to Home Screen."
              : isKorean
                ? "iPhone/iPad: 브라우저 메뉴에서 홈 화면에 추가하세요."
                : "iPhone/iPad: Add to Home Screen from browser menu."}
          </p>
          <button
            onClick={dismissIosHint}
            className="rounded border border-[var(--border)] px-2 py-1 text-[var(--ink-light)]"
            aria-label={isKorean ? "iOS 설치 가이드 닫기" : "Dismiss iOS install guide"}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}
