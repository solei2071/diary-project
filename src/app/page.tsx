/**
 * 메인 홈 페이지 (page.tsx)
 *
 * "use client" — 클라이언트 컴포넌트로 마킹 (useState, useEffect 등 훅 사용)
 * - App Router 기본은 서버 컴포넌트이므로, 훅 사용 시 반드시 "use client" 필요
 */
"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthPanel from "@/components/AuthPanel";
import DailyDiary from "@/components/DailyDiary";
import ErrorBoundary from "@/components/ErrorBoundary";
import { ToastProvider } from "@/components/Toast";
import OnboardingModal, { hasCompletedOnboarding } from "@/components/OnboardingModal";
import {
  loadNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  getNotificationPermission,
  type NotificationSettings
} from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  CreditCard,
  Download,
  Copy,
  Fingerprint,
  Globe,
  KeyRound,
  Lock,
  Moon,
  Palette,
  Printer,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Settings,
  Sun,
  UserCircle2,
  Sparkles
} from "lucide-react";
import { getPlanLimits, type UserSymbolPlan } from "@/lib/user-symbols";
import {
  resolvePlanState,
  clearStoredPlan,
  setStoredPlan,
  syncPlanWithMetadata,
  upsertProSubscription,
  type PlanState
} from "@/lib/subscription";
import { isAdminUser } from "@/lib/admin";
import {
  authenticateWithBiometric,
  createPasscodeRecord,
  DEFAULT_APP_LOCK_CONFIG,
  isBiometricAvailable,
  loadAppLockConfig,
  registerBiometricCredential,
  resetAppLockConfig,
  saveAppLockConfig,
  shouldRequireAppUnlock,
  verifyPasscode,
  type AppLockConfig
} from "@/lib/app-lock";

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        appleProPurchase?: { postMessage: (payload?: unknown) => void };
        applePurchase?: { postMessage: (payload?: unknown) => void };
        purchasePro?: { postMessage: (payload?: unknown) => void };
        proPurchase?: { postMessage: (payload?: unknown) => void };
        startCheckout?: { postMessage: (payload?: unknown) => void };
        startPurchase?: { postMessage: (payload?: unknown) => void };
      };
    };
  }
}

type AppLanguage = "en" | "ko";
type FontStyle = "default" | "clean" | "rounded";

const LOCAL_DATA_STORAGE_KEYS = [
  "diary-draft-todos",
  "diary-draft-journal",
  "diary-draft-activities",
  "diary-activity-step-minutes",
  "diary-dashboard-view",
  "diary-app-lock-v1",
  "diary-activity-templates",
  "diary-user-symbols",
  "diary-notification-settings",
  "diary-admin-export-audit",
  "diary-onboarding-done",
  "diary-theme-mode",
  "diary-font-style",
  "diary-language",
  "diary-last-sync-at",
  "daily-diary-ios-hint-dismissed-v1",
  "daily-diary-install-banner-dismissed-v1"
] as const;
const LOCAL_DATA_STORAGE_PREFIXES = ["diary-symbol-plan-"] as const;
const ACCOUNT_DELETE_ENDPOINT = process.env.NEXT_PUBLIC_ACCOUNT_DELETE_ENDPOINT?.trim();
const PRIVACY_CONTACT_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim();
const PURCHASE_PENDING_STATE_KEY = "diary-purchase-pending";
const PURCHASE_PENDING_TTL_MS = 10 * 60 * 1000;
const APP_FONT_STYLE_STORAGE_KEY = "diary-font-style";
const APP_LAST_SYNC_AT_STORAGE_KEY = "diary-last-sync-at";

type PurchasePendingState = {
  token: string;
  userId: string;
  provider: string;
  source: "web" | "native";
  createdAt: number;
  expiresAt: number;
};

const createPurchaseToken = () => {
  // 학습 포인트:
  // 구매 플로우에서 URL만으로 인증하는 구조는 매우 위험하므로
  // 브라우저에서 임시 토큰을 생성해 checkout 시작 시점과 성공 콜백을 바인딩한다.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pending_${crypto.randomUUID()}`;
  }
  return `pending_${Date.now().toString(36)}_${Math.floor(Math.random() * 1000000).toString(36)}`;
};

const readPurchaseState = () => {
  if (typeof window === "undefined") return null;
  try {
    // localStorage의 pending state는 신뢰근거가 아닌, "검증 전 단계의 힌트"로만 취급한다.
    const raw = localStorage.getItem(PURCHASE_PENDING_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PurchasePendingState;
  } catch {
    return null;
  }
};

const clearPurchaseState = () => {
  if (typeof window === "undefined") return;
  try {
    // 학습 포인트: 처리 완료/실패/로그아웃 모두에서 토큰을 정리해야 재사용 공격을 줄일 수 있다.
    localStorage.removeItem(PURCHASE_PENDING_STATE_KEY);
  } catch {
    // no-op
  }
};

const consumePurchaseState = (userId?: string | null, token?: string | null, provider?: string | null) => {
  const state = readPurchaseState();
  if (!state || !userId) {
    return false;
  }
  const now = Date.now();
  // 핵심 방어:
  // 1) 사용자 일치 2) TTL 만료 3) 토큰 일치 4) provider 일치 검사
  // 위 조건을 모두 통과해야 결제 완료 처리한다.
  if (
    state.userId !== userId ||
    state.expiresAt <= now ||
    (token && state.token !== token) ||
    (provider && state.provider && state.provider !== provider)
  ) {
    clearPurchaseState();
    return false;
  }
  clearPurchaseState();
  return true;
};

const setPurchaseState = (state: PurchasePendingState) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PURCHASE_PENDING_STATE_KEY, JSON.stringify(state));
  } catch {
    // no-op
  }
};

const clearLocalDiaryData = (userId?: string | null) => {
  if (typeof window === "undefined") return;

  try {
    LOCAL_DATA_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // no-op
  }

  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (LOCAL_DATA_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // no-op
  }

  if (userId) {
    try {
      localStorage.removeItem(`diary-symbol-plan-${userId}`);
    } catch {
      // no-op
    }
  }

  try {
    localStorage.removeItem("diary-symbol-plan-guest");
  } catch {
    // no-op
  }
};

const emitLocalDataCleared = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("diary:local-data-cleared"));
};

export default function Home() {
  // session: 로그인한 사용자 세션 (null = 비로그인)
  const [session, setSession] = useState<Session | null>(null);
  // ready: 초기 세션 로드 완료 여부 (로딩 스피너용)
  const [ready, setReady] = useState(false);
  // authMode: 로그인/회원가입 모달 표시 모드 (null = 모달 숨김)
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [fontStyle, setFontStyle] = useState<FontStyle>("default");
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("en");
  const [symbolPlan, setSymbolPlan] = useState<UserSymbolPlan>("free");
  const [planInfo, setPlanInfo] = useState<PlanState>({
    plan: "free",
    source: "local",
    isTrial: false,
    gracePeriod: false,
    expiresAt: null,
    features: getPlanLimits("free")
  });
  const [planError, setPlanError] = useState("");
  const [settingsPanel, setSettingsPanel] = useState<"settings" | "account">("settings");
  const [isAccountBusy, setIsAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [accountError, setAccountError] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [subscriptionInfo, setSubscriptionInfo] = useState<{
    plan: string | null;
    status: string | null;
    source: string | null;
    is_trial: boolean | null;
    grace_period: boolean | null;
    expires_at: string | null;
    created_at: string | null;
    updated_at: string | null;
  } | null>(null);
  const [lockConfig, setLockConfig] = useState<AppLockConfig>(DEFAULT_APP_LOCK_CONFIG);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [lockScreenPasscode, setLockScreenPasscode] = useState("");
  const [lockScreenError, setLockScreenError] = useState("");
  const [isLockScreenBusy, setIsLockScreenBusy] = useState(false);
  const [securityPasscode, setSecurityPasscode] = useState("");
  const [securityPasscodeConfirm, setSecurityPasscodeConfirm] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [isSecurityBusy, setIsSecurityBusy] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const lockAutoBiometricTriedRef = useRef(false);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasAccountDeleteEndpoint = Boolean(ACCOUNT_DELETE_ENDPOINT);

  const isPro = symbolPlan === "pro";
  const checkoutUrl = process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL?.trim();
  const accountProvider = session
    ? String(
        session.user.app_metadata?.provider ||
          session.user.user_metadata?.provider ||
          "email"
      )
    : "email";

  // 마운트 시 세션 로드 + 인증 상태 변경 구독
  useEffect(() => {
    const syncPlan = async (currentSession: Session | null) => {
      const nextUser = currentSession?.user ? currentSession.user : null;
      if (!nextUser) {
        const guestPlan = await resolvePlanState(null);
        setPlanInfo(guestPlan);
        setSymbolPlan(guestPlan.plan);
        return;
      }

      const info = await resolvePlanState(nextUser);
      setSymbolPlan(info.plan);
      setPlanInfo(info);
      setStoredPlan(info.plan, nextUser.id);
      try {
        await syncPlanWithMetadata(nextUser, info.plan);
      } catch {
        // metadata sync 실패는 화면에서 숨김 처리
      }
    };

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setSession(data.session);
        await syncPlan(data.session);
        setPlanError("");
      }
      setReady(true);
      // 첫 방문자 온보딩 체크
      if (!hasCompletedOnboarding()) {
        setShowOnboarding(true);
      }
    };

    void loadSession();

    // 로그인/로그아웃 시 세션 변경을 실시간으로 감지
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      void syncPlan(currentSession);
      setPlanError("");
    });

    // cleanup: 구독 해제 (메모리 누수 방지)
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 로그인 성공 시 모달 자동 닫기
  useEffect(() => {
    if (session) {
      setAuthMode(null);
    }
  }, [session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("diary-theme-mode");
    const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = saved === "dark" || saved === "light" ? saved : preferDark ? "dark" : "light";
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("diary-language");
    const nextLanguage: AppLanguage =
      saved === "en" || saved === "ko"
        ? saved
        : window.navigator.language.toLowerCase().startsWith("ko")
          ? "ko"
          : "en";
    setAppLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(APP_FONT_STYLE_STORAGE_KEY);
    const nextStyle: FontStyle =
      saved === "clean" || saved === "rounded" || saved === "default"
        ? saved
        : "default";
    setFontStyle(nextStyle);
    document.documentElement.setAttribute("data-font-style", nextStyle);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedSync = localStorage.getItem(APP_LAST_SYNC_AT_STORAGE_KEY);
    setLastSyncAt(savedSync);

    const handleSyncStatus = (event: Event) => {
      const custom = event as CustomEvent<{ ok?: boolean; syncedAt?: string; message?: string }>;
      const syncedAt = custom.detail?.syncedAt ?? null;
      if (syncedAt) {
        setLastSyncAt(syncedAt);
        localStorage.setItem(APP_LAST_SYNC_AT_STORAGE_KEY, syncedAt);
      }
      setIsSyncing(false);
      if (custom.detail?.message) {
        if (custom.detail.ok) {
          setAccountMessage(custom.detail.message);
          setAccountError("");
        } else {
          setAccountError(custom.detail.message);
        }
      }
    };

    window.addEventListener("diary:sync-status", handleSyncStatus);
    return () => {
      window.removeEventListener("diary:sync-status", handleSyncStatus);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const config = loadAppLockConfig();
    setLockConfig(config);
    setIsAppLocked(shouldRequireAppUnlock(config));
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const nextConfig = loadAppLockConfig();
      setLockConfig(nextConfig);
      if (!shouldRequireAppUnlock(nextConfig)) return;
      lockAutoBiometricTriedRef.current = false;
      setLockScreenError("");
      setLockScreenPasscode("");
      setIsAppLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };
  const signOut = async () => {
    const userId = session?.user?.id ?? null;
    // 학습 포인트:
    // 로그아웃은 인증만 종료하는 행위가 아니라,
    // 로컬 저장 데이터와 결제 pending state를 함께 정리해 후속 공격면을 줄인다.
    await supabase.auth.signOut();
    clearPurchaseState();
    clearLocalDiaryData(userId);
    setLastSyncAt(null);
    emitLocalDataCleared();
    closeSettings();
  };

  const clearDeviceData = () => {
    const confirmMessage = isKorean
      ? "이 기기의 로컬 데이터를 삭제할까요? 이 작업은 되돌릴 수 없습니다."
      : "Delete local data stored on this device? This action cannot be undone.";

    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;

    if (session?.user) {
      clearStoredPlan(session.user.id);
    }
    clearStoredPlan();
    clearLocalDiaryData(session?.user?.id);
    setLastSyncAt(null);
    resetAppLockConfig();
    setLockConfig(DEFAULT_APP_LOCK_CONFIG);
    setIsAppLocked(false);
    setLockScreenPasscode("");
    setLockScreenError("");
    setSecurityPasscode("");
    setSecurityPasscodeConfirm("");
    setSecurityError("");
    setSecurityMessage("");
    emitLocalDataCleared();
    setAccountMessage(
      t(
        "Local data on this device has been cleared.",
        "이 기기의 로컬 데이터가 삭제되었습니다."
      )
    );
    setAccountError("");
  };

  const deleteCloudData = async () => {
    if (!session?.user) return;
    const confirmMessage = isKorean
      ? "클라우드(서버) 데이터(할 일/노트/활동)를 삭제할까요? 구독 상태도 초기화되며 이 작업은 되돌릴 수 없습니다."
      : "Delete all cloud data (todos, notes, activities) and subscription info? This action cannot be undone.";
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;

    setIsAccountBusy(true);
    setAccountError("");
    setAccountMessage("");

    try {
      const userId = session.user.id;
      const [todosDelete, journalDelete, activitiesDelete, subscriptionsDelete, entitlementsDelete] = await Promise.all([
        supabase.from("todos").delete().eq("user_id", userId),
        supabase.from("journal_entries").delete().eq("user_id", userId),
        supabase.from("daily_activities").delete().eq("user_id", userId),
        supabase.from("user_subscriptions").delete().eq("user_id", userId),
        supabase.from("user_entitlements").delete().eq("user_id", userId)
      ]);

      const firstError =
        todosDelete.error ??
        journalDelete.error ??
        activitiesDelete.error ??
        subscriptionsDelete.error ??
        entitlementsDelete.error;

      if (firstError) {
        setAccountError(
          t("Failed to delete cloud data. Please try again.", "클라우드 데이터 삭제에 실패했습니다. 다시 시도해 주세요.")
        );
        return;
      }

      clearStoredPlan(userId);
      clearStoredPlan();
      const info = await resolvePlanState(session.user);
      setSymbolPlan(info.plan);
      setPlanInfo(info);
      setSubscriptionInfo(null);
      setAccountMessage(
        t(
          "Cloud data has been deleted. Your account remains active, but data is no longer available.",
          "클라우드 데이터가 삭제되었습니다. 계정은 유지되며 기록은 더 이상 조회할 수 없습니다."
        )
      );
      clearLocalDiaryData(session.user.id);
      emitLocalDataCleared();
    } finally {
      setIsAccountBusy(false);
    }
  };

  const resetAccountForm = () => {
    setNewPassword("");
    setConfirmPassword("");
    setAccountError("");
    setAccountMessage("");
  };
  const isKorean = appLanguage === "ko";
  const appLocale = isKorean ? "ko-KR" : "en-US";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);
  const biometricSupported = isBiometricAvailable();
  const hasSecurityMethod = lockConfig.useBiometric || lockConfig.usePasscode;

  const applyLockConfig = useCallback(
    (next: AppLockConfig, options?: { lockNow?: boolean }) => {
      const normalized: AppLockConfig = {
        ...next,
        enabled: Boolean(next.enabled && (next.useBiometric || next.usePasscode)),
        updatedAt: Date.now()
      };
      setLockConfig(normalized);
      saveAppLockConfig(normalized);

      if (options?.lockNow && shouldRequireAppUnlock(normalized)) {
        lockAutoBiometricTriedRef.current = false;
        setLockScreenPasscode("");
        setLockScreenError("");
        setIsAppLocked(true);
        return;
      }

      if (!shouldRequireAppUnlock(normalized)) {
        setIsAppLocked(false);
      }
    },
    []
  );

  const formatDateOrDash = (value: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString(appLocale);
  };

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) return;
    const isKorean = appLanguage === "ko";
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setAccountError(t("Clipboard is not available.", "클립보드가 비활성화되어 있습니다."));
      return;
    }
    const copyLabel = isKorean
      ? `${label}이(가) 복사되었습니다.`
      : `${label} copied.`;
    const failLabel = isKorean
      ? `${label} 복사에 실패했습니다.`
      : `${label} copy failed.`;
    try {
      await navigator.clipboard.writeText(value);
      setAccountError("");
      setAccountMessage(copyLabel);
    } catch {
      setAccountError(failLabel);
    }
  };

  const setupBiometricLock = async () => {
    if (!biometricSupported) {
      setSecurityError(
        t(
          "Biometric unlock is not available on this device/browser.",
          "이 기기/브라우저에서는 생체 인증 잠금을 사용할 수 없습니다."
        )
      );
      setSecurityMessage("");
      return;
    }

    setIsSecurityBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      const displayName = session?.user?.email || "Daily Flow User";
      const credentialId = await registerBiometricCredential(displayName);
      applyLockConfig({
        ...lockConfig,
        enabled: true,
        useBiometric: true,
        biometricCredentialId: credentialId
      });
      setSecurityMessage(
        t(
          "Biometric unlock is enabled.",
          "생체 인증 잠금이 활성화되었습니다."
        )
      );
    } catch {
      setSecurityError(
        t(
          "Biometric setup was cancelled or failed.",
          "생체 인증 설정이 취소되었거나 실패했습니다."
        )
      );
    } finally {
      setIsSecurityBusy(false);
    }
  };

  const removeBiometricLock = () => {
    const confirmMessage = t(
      "Remove biometric unlock for this device?",
      "이 기기의 생체 인증 잠금을 해제할까요?"
    );
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;
    applyLockConfig({
      ...lockConfig,
      useBiometric: false,
      biometricCredentialId: null,
      enabled: lockConfig.usePasscode
    });
    setSecurityError("");
    setSecurityMessage(t("Biometric unlock removed.", "생체 인증 잠금이 해제되었습니다."));
  };

  const saveAppPasscode = async () => {
    if (securityPasscode.length < 4) {
      setSecurityError(t("Passcode must be at least 4 characters.", "앱 비밀번호는 최소 4자 이상이어야 합니다."));
      setSecurityMessage("");
      return;
    }
    if (securityPasscode !== securityPasscodeConfirm) {
      setSecurityError(t("Passcode confirmation does not match.", "앱 비밀번호 확인이 일치하지 않습니다."));
      setSecurityMessage("");
      return;
    }

    setIsSecurityBusy(true);
    setSecurityError("");
    setSecurityMessage("");
    try {
      const record = await createPasscodeRecord(securityPasscode);
      applyLockConfig({
        ...lockConfig,
        enabled: true,
        usePasscode: true,
        passcodeSalt: record.salt,
        passcodeHash: record.hash
      });
      setSecurityPasscode("");
      setSecurityPasscodeConfirm("");
      setSecurityMessage(t("App passcode is saved.", "앱 비밀번호가 저장되었습니다."));
    } catch {
      setSecurityError(
        t(
          "Passcode setup failed in this browser.",
          "이 브라우저에서는 앱 비밀번호 설정에 실패했습니다."
        )
      );
    } finally {
      setIsSecurityBusy(false);
    }
  };

  const removeAppPasscode = () => {
    const confirmMessage = t(
      "Remove app passcode for this device?",
      "이 기기의 앱 비밀번호를 삭제할까요?"
    );
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;
    applyLockConfig({
      ...lockConfig,
      usePasscode: false,
      passcodeSalt: null,
      passcodeHash: null,
      enabled: lockConfig.useBiometric
    });
    setSecurityPasscode("");
    setSecurityPasscodeConfirm("");
    setSecurityError("");
    setSecurityMessage(t("App passcode removed.", "앱 비밀번호가 삭제되었습니다."));
  };

  const enableAppLock = () => {
    if (!hasSecurityMethod) {
      setSecurityError(
        t(
          "Set biometric unlock or app passcode first.",
          "먼저 생체 인증 또는 앱 비밀번호를 설정해 주세요."
        )
      );
      setSecurityMessage("");
      return;
    }
    applyLockConfig({ ...lockConfig, enabled: true });
    setSecurityError("");
    setSecurityMessage(t("App lock is enabled.", "앱 잠금이 활성화되었습니다."));
  };

  const disableAppLock = () => {
    applyLockConfig({ ...lockConfig, enabled: false });
    setIsAppLocked(false);
    setLockScreenPasscode("");
    setLockScreenError("");
    setSecurityError("");
    setSecurityMessage(t("App lock is disabled.", "앱 잠금이 비활성화되었습니다."));
  };

  const lockNow = () => {
    if (!shouldRequireAppUnlock(lockConfig)) return;
    closeSettings();
    applyLockConfig(lockConfig, { lockNow: true });
  };

  const unlockWithPasscode = async () => {
    if (!lockConfig.usePasscode || !lockConfig.passcodeSalt || !lockConfig.passcodeHash) return;
    if (!lockScreenPasscode) {
      setLockScreenError(t("Enter your passcode.", "앱 비밀번호를 입력해 주세요."));
      return;
    }
    setIsLockScreenBusy(true);
    try {
      const valid = await verifyPasscode(
        lockScreenPasscode,
        lockConfig.passcodeSalt,
        lockConfig.passcodeHash
      );
      if (!valid) {
        setLockScreenError(t("Incorrect passcode.", "앱 비밀번호가 올바르지 않습니다."));
        return;
      }
      setIsAppLocked(false);
      setLockScreenPasscode("");
      setLockScreenError("");
    } catch {
      setLockScreenError(
        t(
          "Passcode verification failed.",
          "앱 비밀번호 확인 중 오류가 발생했습니다."
        )
      );
    } finally {
      setIsLockScreenBusy(false);
    }
  };

  const unlockWithBiometric = async () => {
    if (!lockConfig.useBiometric || !lockConfig.biometricCredentialId) return;
    setIsLockScreenBusy(true);
    setLockScreenError("");
    const success = await authenticateWithBiometric(lockConfig.biometricCredentialId);
    setIsLockScreenBusy(false);
    if (!success) {
      setLockScreenError(
        t(
          "Biometric verification failed. Try again or use passcode.",
          "생체 인증에 실패했습니다. 다시 시도하거나 앱 비밀번호를 사용해 주세요."
        )
      );
      return;
    }
    setIsAppLocked(false);
    setLockScreenPasscode("");
    setLockScreenError("");
  };

  const resetAppLockOnDevice = () => {
    const confirmMessage = t(
      "Reset app lock on this device? This removes local lock settings only.",
      "이 기기의 앱 잠금을 초기화할까요? 로컬 잠금 설정만 삭제됩니다."
    );
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;
    resetAppLockConfig();
    setLockConfig(DEFAULT_APP_LOCK_CONFIG);
    setIsAppLocked(false);
    setLockScreenPasscode("");
    setLockScreenError("");
    setSecurityPasscode("");
    setSecurityPasscodeConfirm("");
    setSecurityError("");
    setSecurityMessage("");
  };

  const buildAccountDeletionDraft = () => {
    if (!session?.user) return "";
    return isKorean
      ? `계정 삭제 요청\n\n계정: ${session.user.email ?? "이메일 없음"}\n사용자 ID: ${session.user.id}\n요청일시: ${new Date().toISOString()}`
      : `Account deletion request\n\nAccount: ${session.user.email ?? "No email"}\nUser ID: ${session.user.id}\nRequested at: ${new Date().toISOString()}`;
  };

  const getAccountDeletionMailto = () => {
    if (!session?.user || !PRIVACY_CONTACT_EMAIL) return "";
    const subject = isKorean
      ? "Daily Flow 계정 삭제 요청"
      : "Daily Flow account deletion request";
    const body = buildAccountDeletionDraft();
    return `mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const requestDeleteAccount = async () => {
    if (!session?.user) return;
    const confirmMessage = isKorean
      ? "계정을 완전히 삭제하시겠습니까? 계정과 연결된 Supabase 사용자, 로컬 캐시까지 제거됩니다. 이 작업은 되돌릴 수 없습니다."
      : "Delete your account permanently? This will remove your Supabase user and local cache data. This action cannot be undone.";
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) return;

    setIsAccountBusy(true);
    setAccountError("");
    setAccountMessage("");

    try {
      const draft = buildAccountDeletionDraft();
      const contactEmail = PRIVACY_CONTACT_EMAIL;
      const endpoint = ACCOUNT_DELETE_ENDPOINT;

      if (!endpoint) {
        if (contactEmail) {
          window.location.assign(getAccountDeletionMailto());
          setAccountMessage(
            t(
              "No deletion API configured. We prepared an email for support and copied the request template.",
              "계정 삭제 API가 설정되지 않았습니다. 지원 요청 이메일을 열고, 요청 템플릿이 준비되어 있습니다."
            )
          );
          void copyToClipboard(draft, t("Account deletion request", "계정 삭제 요청"));
          setIsAccountBusy(false);
          return;
        }

        setAccountError(
          t(
            "No account deletion endpoint or support contact is configured. Please contact support manually.",
            "계정 삭제 API 또는 지원 메일이 설정되지 않았습니다. 수동으로 지원팀에 문의해 주세요."
          )
        );
        void copyToClipboard(draft, t("Account deletion request", "계정 삭제 요청"));
        setIsAccountBusy(false);
        return;
      }

      const { data: latestSession } = await supabase.auth.getSession();
      const accessToken = latestSession.session?.access_token || session.access_token;
      const payload = {
        userId: session.user.id,
        reason: "user_request",
        requestedAt: new Date().toISOString(),
        language: appLanguage
      };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let responseError = "";
        try {
          const json = (await response.json()) as { error?: string; message?: string };
          responseError = json?.error ?? json?.message ?? "";
        } catch {
          responseError = await response.text().catch(() => "");
        }
        throw new Error(responseError || t("Account deletion failed. Please try again.", "계정 삭제에 실패했습니다. 다시 시도해 주세요."));
      }

      setAccountMessage(
        t(
          "Account deletion request has been accepted. Signing out and clearing local data.",
          "계정 삭제 요청이 접수되었습니다. 로그아웃 후 로컬 데이터를 정리합니다."
        )
      );
      await signOut().catch(() => {
        clearLocalDiaryData(session?.user?.id);
        emitLocalDataCleared();
      });
      return;
    } catch (error) {
      setAccountError(
        error instanceof Error && error.message
          ? error.message
          : t("Failed to request account deletion. Please contact support.", "계정 삭제 요청에 실패했습니다. 지원팀에 문의해 주세요.")
      );
    } finally {
      setIsAccountBusy(false);
    }
  };

  const loadAccountSubscription = useCallback(async () => {
    if (!session?.user) {
      setSubscriptionInfo(null);
      return;
    }
    setIsAccountBusy(true);
    setAccountError("");
    setAccountMessage("");
    try {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select(
          "plan,status,source,is_trial,grace_period,expires_at,created_at,updated_at"
        )
        .eq("user_id", session.user.id)
        .maybeSingle<{
          plan: string | null;
          status: string | null;
          source: string | null;
          is_trial: boolean | null;
          grace_period: boolean | null;
          expires_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        }>();
      if (error) {
        setSubscriptionInfo(null);
        setAccountError("");
        setAccountMessage(t("Billing load failed.", "구독 정보를 불러오지 못했습니다."));
        return;
      }
      setSubscriptionInfo(data);
      setAccountError("");
      setAccountMessage(t("Billing info refreshed.", "구독 정보를 갱신했습니다."));
    } finally {
      setIsAccountBusy(false);
    }
  }, [session?.user, t]);

  const updatePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.user) {
      setAccountError(t("Sign in required.", "로그인이 필요합니다."));
      return;
    }

    const provider = String(
      session.user.app_metadata?.provider || session.user.user_metadata?.provider || "email"
    );
    if (provider !== "email") {
      setAccountError(
        t(
          "Password change is only available for email accounts.",
          "비밀번호 변경은 이메일 계정에서만 가능합니다."
        )
      );
      return;
    }

    if (newPassword.length < 8) {
      setAccountError(t("Password must be at least 8 characters.", "비밀번호는 8자 이상 입력해 주세요."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountError(t("Password confirmation does not match.", "비밀번호 확인이 일치하지 않습니다."));
      return;
    }
    setIsAccountBusy(true);
    setAccountError("");
    setAccountMessage("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsAccountBusy(false);
    if (error) {
      setAccountError(t("Password change failed. Please try again.", "비밀번호 변경에 실패했습니다. 다시 시도해 주세요."));
      return;
    }
    setAccountMessage(t("Password changed successfully.", "비밀번호가 변경되었습니다."));
    resetAccountForm();
  };

  useEffect(() => {
    if (!session) {
      setSubscriptionInfo(null);
      setSettingsPanel("settings");
      resetAccountForm();
      return;
    }

    if (isSettingsOpen) {
      setSettingsPanel((prev) => (prev === "settings" || prev === "account" ? prev : "settings"));
      void loadAccountSubscription();
    }
  }, [isSettingsOpen, session, loadAccountSubscription]);

  const [isExporting, setIsExporting] = useState(false);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => loadNotificationSettings());
  const [notifPermission, setNotifPermission] = useState<string>(() => {
    if (typeof window === "undefined") return "default";
    return getNotificationPermission();
  });

  const exportMyData = async () => {
    if (!session?.user) return;
    setIsExporting(true);
    try {
    const [todosRes, journalRes, activitiesRes] = await Promise.all([
      supabase
        .from("todos")
        .select("id,due_date,title,done,created_at,updated_at")
        .eq("user_id", session.user.id)
        .order("due_date"),
      supabase
        .from("journal_entries")
        .select("id,entry_date,content,created_at,updated_at")
        .eq("user_id", session.user.id)
        .order("entry_date"),
      supabase
        .from("daily_activities")
        .select("id,activity_date,emoji,label,hours,start_time,end_time,created_at,updated_at")
        .eq("user_id", session.user.id)
        .order("activity_date")
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      schemaVersion: "1.0",
      todos: todosRes.data ?? [],
      journalEntries: journalRes.data ?? [],
      dailyActivities: activitiesRes.data ?? []
    };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `daily-flow-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const handleNotifToggle = async () => {
    if (notifSettings.enabled) {
      // 비활성화
      const next = { ...notifSettings, enabled: false };
      setNotifSettings(next);
      saveNotificationSettings(next);
      return;
    }
    // 활성화: 권한 요청
    const perm = await requestNotificationPermission();
    setNotifPermission(perm);
    if (perm === "granted") {
      const next = { ...notifSettings, enabled: true };
      setNotifSettings(next);
      saveNotificationSettings(next);
    }
  };

  const handleNotifTimeChange = (time: string) => {
    const next = { ...notifSettings, reminderTime: time };
    setNotifSettings(next);
    saveNotificationSettings(next);
  };

  const applyThemeMode = (mode: "light" | "dark") => {
    setThemeMode(mode);
    if (typeof window === "undefined") return;
    document.documentElement.classList.toggle("dark", mode === "dark");
    localStorage.setItem("diary-theme-mode", mode);
  };

  const applyLanguage = (language: AppLanguage) => {
    setAppLanguage(language);
    if (typeof window === "undefined") return;
    localStorage.setItem("diary-language", language);
    document.documentElement.lang = language;
  };

  const applyFontStyle = (style: FontStyle) => {
    setFontStyle(style);
    if (typeof window === "undefined") return;
    localStorage.setItem(APP_FONT_STYLE_STORAGE_KEY, style);
    document.documentElement.setAttribute("data-font-style", style);
  };

  const exportBackupToJson = async () => {
    if (typeof window === "undefined") return;
    const localData: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        LOCAL_DATA_STORAGE_KEYS.includes(key as (typeof LOCAL_DATA_STORAGE_KEYS)[number]) ||
        LOCAL_DATA_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          localData[key] = value;
        }
      }
    }

    const payload = {
      schemaVersion: "local-backup-v1",
      exportedAt: new Date().toISOString(),
      userId: session?.user?.id ?? null,
      localData
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openRestorePicker = () => {
    backupFileInputRef.current?.click();
  };

  const handleRestoreBackupFile = async (file?: File | null) => {
    if (!file || typeof window === "undefined") return;
    setAccountError("");
    setAccountMessage("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as {
        schemaVersion?: string;
        localData?: Record<string, string>;
      };
      if (parsed.schemaVersion !== "local-backup-v1" || !parsed.localData || typeof parsed.localData !== "object") {
        setAccountError(
          t("Invalid backup file format.", "백업 파일 형식이 올바르지 않습니다.")
        );
        return;
      }

      Object.entries(parsed.localData).forEach(([key, value]) => {
        if (typeof value !== "string") return;
        if (
          LOCAL_DATA_STORAGE_KEYS.includes(key as (typeof LOCAL_DATA_STORAGE_KEYS)[number]) ||
          LOCAL_DATA_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
        ) {
          localStorage.setItem(key, value);
        }
      });

      const savedTheme = localStorage.getItem("diary-theme-mode");
      const restoredTheme: "light" | "dark" = savedTheme === "dark" ? "dark" : "light";
      setThemeMode(restoredTheme);
      document.documentElement.classList.toggle("dark", restoredTheme === "dark");

      const savedLanguage = localStorage.getItem("diary-language");
      const restoredLanguage: AppLanguage = savedLanguage === "ko" ? "ko" : "en";
      setAppLanguage(restoredLanguage);
      document.documentElement.lang = restoredLanguage;

      const savedFontStyle = localStorage.getItem(APP_FONT_STYLE_STORAGE_KEY);
      const restoredFontStyle: FontStyle =
        savedFontStyle === "clean" || savedFontStyle === "rounded" || savedFontStyle === "default"
          ? savedFontStyle
          : "default";
      setFontStyle(restoredFontStyle);
      document.documentElement.setAttribute("data-font-style", restoredFontStyle);

      const restoredLockConfig = loadAppLockConfig();
      setLockConfig(restoredLockConfig);
      setIsAppLocked(shouldRequireAppUnlock(restoredLockConfig));
      emitLocalDataCleared();
      setAccountMessage(
        t("Backup restored on this device.", "이 기기에 백업이 복원되었습니다.")
      );
    } catch {
      setAccountError(
        t("Failed to restore backup file.", "백업 파일 복원에 실패했습니다.")
      );
    } finally {
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = "";
      }
    }
  };

  const triggerManualSync = () => {
    if (typeof window === "undefined") return;
    setIsSyncing(true);
    setAccountError("");
    setAccountMessage("");
    window.dispatchEvent(new CustomEvent("diary:sync-now"));
    window.setTimeout(() => {
      setIsSyncing(false);
    }, 8000);
  };

  const exportCurrentViewToPdf = (range: "day" | "week" | "month") => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("diary:export-pdf", { detail: { range } }));
  };


  useEffect(() => {
    if (!isAppLocked) {
      lockAutoBiometricTriedRef.current = false;
      return;
    }
    if (!lockConfig.useBiometric || !lockConfig.biometricCredentialId || !biometricSupported) return;
    if (lockAutoBiometricTriedRef.current) return;
    lockAutoBiometricTriedRef.current = true;
    setIsLockScreenBusy(true);
    void authenticateWithBiometric(lockConfig.biometricCredentialId).then((success) => {
      setIsLockScreenBusy(false);
      if (!success) {
        setLockScreenError(
          isKorean
            ? "생체 인증에 실패했습니다. 다시 시도하거나 앱 비밀번호를 사용해 주세요."
            : "Biometric verification failed. Try again or use passcode."
        );
        return;
      }
      setIsAppLocked(false);
      setLockScreenError("");
    });
  }, [biometricSupported, isAppLocked, isKorean, lockConfig.biometricCredentialId, lockConfig.useBiometric]);

  const grantProAfterPurchase = useCallback(async (purchaseToken?: string | null) => {
    if (isPro) {
      // 이미 Pro면 중복 호출이 와도 서버 부하를 줄이기 위해 바로 종료한다.
      clearPurchaseState();
      return true;
    }
    if (!session?.user) {
      setPlanError(t("Please sign in first to complete unlock.", "구매 완료 처리를 하려면 로그인하세요."));
      return false;
    }
    if (!consumePurchaseState(session.user.id, purchaseToken, accountProvider)) {
      setPlanError(t("Unable to verify purchase. Please retry from Checkout.", "구매가 검증되지 않았습니다. 결제 화면에서 다시 진행해 주세요."));
      return false;
    }

    const nextPlan: UserSymbolPlan = "pro";
    setSymbolPlan(nextPlan);
    setStoredPlan(nextPlan, session?.user?.id);
    setPlanInfo((prev) => ({
      ...prev,
      plan: nextPlan,
      source: "local",
      isTrial: false,
      gracePeriod: false,
      expiresAt: null,
      features: getPlanLimits(nextPlan)
    }));
    setPlanError("");

    try {
      await syncPlanWithMetadata(session.user, "pro");
      await upsertProSubscription(session.user);
      // 결제 직후 DB 조회는 최종 상태를 다시 가져와 화면과 캐시를 최신화한다.
      const info = await resolvePlanState(session.user);
      setSymbolPlan(info.plan);
      setPlanInfo(info);
      if (settingsPanel === "account") {
        await loadAccountSubscription();
      }
      setPlanError("");
      return true;
    } catch {
      setPlanError(t("Plan saved on this device. Server sync for account failed.", "현재 기기엔 반영되었지만 계정 동기화에 실패했습니다."));
      return false;
    }
  }, [accountProvider, isPro, loadAccountSubscription, session, settingsPanel, t]);

  const startUnlockCheckout = async () => {
    if (isPro) return;
    if (!session?.user) {
      setPlanError(t("Please login first to continue purchase.", "구매를 계속하려면 먼저 로그인해 주세요."));
      setAuthMode("login");
      closeSettings();
      return;
    }

    setPlanError("");
    const purchaseToken = createPurchaseToken();
    setPurchaseState({
      token: purchaseToken,
      userId: session.user.id,
      provider: accountProvider,
      source: "web",
      createdAt: Date.now(),
      expiresAt: Date.now() + PURCHASE_PENDING_TTL_MS
    });

    const purchasePayload = {
      productId: "pro_unlock",
      source: "web",
      provider: accountProvider,
      userId: session.user.id,
      plan: "pro",
      purchaseToken,
      timestamp: new Date().toISOString()
    };

    const toCheckoutUrl = () => {
      if (!checkoutUrl) return null;
      try {
        const url = new URL(checkoutUrl, window.location.href);
        url.searchParams.set("product", "pro_unlock");
        url.searchParams.set("provider", accountProvider);
        url.searchParams.set("uid", session.user.id);
        url.searchParams.set("purchase_token", purchaseToken);
        return url.toString();
      } catch {
        return checkoutUrl;
      }
    };

    // 학습 포인트:
    // iOS 네이티브 브리지 성공 여부에 따라 분기한다.
    // 브리지가 없으면 web checkout URL로 폴백한다.
    if (typeof window !== "undefined") {
      const messageHandlers = window.webkit?.messageHandlers as Record<string, { postMessage: (payload?: unknown) => void }> | undefined;
      const handlerNames = [
        "purchasePro",
        "proPurchase",
        "appleProPurchase",
        "applePurchase",
        "startCheckout",
        "startPurchase"
      ];

      let handledByBridge = false;
      for (const name of handlerNames) {
        const handler = messageHandlers?.[name];
        if (!handler?.postMessage) {
          continue;
        }

        const payloads = [purchasePayload, JSON.stringify(purchasePayload), "pro_unlock"];
        for (const payload of payloads) {
          try {
            handler.postMessage(payload);
            handledByBridge = true;
            break;
          } catch {
            // continue with alternate payload shape
          }
        }
        if (handledByBridge) {
          break;
        }
      }
      if (handledByBridge) return;

      const checkoutLink = toCheckoutUrl();
      if (checkoutLink) {
        window.location.assign(checkoutLink);
        return;
      }
    }

    setPlanError(
      t(
        "Checkout is not configured. Set NEXT_PUBLIC_PRO_CHECKOUT_URL or connect iOS purchase bridge.",
        "결제 연동이 설정되지 않았습니다. NEXT_PUBLIC_PRO_CHECKOUT_URL을 설정하거나 iOS 구매 브리지를 연결해 주세요."
      )
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const completePurchase = (event?: Event) => {
      // 앱 내 브릿지 이벤트로 전달되는 임의 payload에서도
      // 구매 토큰만 추출해 grantProAfterPurchase로 전달한다.
      const detail = event as Event & { detail?: unknown };
      const incomingToken =
        detail && typeof detail === "object" && detail.detail && typeof detail.detail === "object"
          ? (detail.detail as { purchaseToken?: unknown }).purchaseToken
          : null;

      const altToken =
        detail && typeof detail === "object" && detail.detail && typeof detail.detail === "object"
          ? (detail.detail as { token?: unknown }).token
          : null;

      const nextToken =
        typeof incomingToken === "string" && incomingToken.length > 0
          ? incomingToken
          : typeof altToken === "string" && altToken.length > 0
            ? altToken
            : null;

      void grantProAfterPurchase(nextToken);
    };

    const search = new URLSearchParams(window.location.search);
    if (search.get("purchase") === "success") {
      // 학습 포인트:
      // 서버 리다이렉트로 URL이 뒤섞여도, 유효한 토큰일 때만 상태를 처리하고
      // 성공 처리 뒤에만 쿼리를 제거해 재방문 시 중복 처리 위험을 줄인다.
      const purchaseToken = search.get("purchase_token");
      void grantProAfterPurchase(purchaseToken).then((granted) => {
        if (!granted) return;
        search.delete("purchase");
        search.delete("purchase_token");
        const qs = search.toString();
        const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", nextUrl);
      });
    }

    window.addEventListener("diary:pro-purchase-success", completePurchase);
    return () => {
      window.removeEventListener("diary:pro-purchase-success", completePurchase);
    };
  }, [grantProAfterPurchase]);

  const planSourceLabel = (source: PlanState["source"]) => {
    return source === "subscription"
      ? t("Subscription", "구독")
      : source === "metadata"
        ? t("Account", "계정")
        : t("Local", "로컬");
  };

  const accountPlanLabel = () => {
    if (!session?.user) return t("Guest", "게스트");
    if (subscriptionInfo?.plan) {
      return `${subscriptionInfo.plan.toUpperCase()} (${subscriptionInfo.status ?? t("Unknown", "알 수 없음")})`;
    }
    return isPro ? "Pro" : t("Free", "무료");
  };

  const canChangePassword = accountProvider === "email";
  const isAdmin = isAdminUser(session?.user ?? null);
  // 세션 로드 전에는 로딩 UI 표시
  if (!ready) {
    return <main className="min-h-screen flex items-center justify-center">{t("Loading...", "불러오는 중…")}</main>;
  }

  return (
      <ToastProvider appLanguage={appLanguage}>
    <div className="relative">
      {/* 상단 고정 헤더 — 우측 상단 톱니바퀴 아이콘만 표시 */}
      <section
        className="sticky top-0 z-40"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="relative mx-auto flex w-full max-w-5xl items-center justify-end px-4 py-2">
          {/* 설정 버튼 (톱니바퀴) */}
          <button
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              isSettingsOpen
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
            }`}
            aria-label={t("Settings", "설정")}
          >
            <Settings className="h-4 w-4" />
          </button>
          {isSettingsOpen ? (
            <div
              className="absolute right-4 top-full z-40 mt-1 w-72 overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-lg"
              style={{ maxHeight: "calc(100dvh - var(--safe-top) - 4.5rem)" }}
            >
              {/* 비로그인 시: 로그인/회원가입 버튼 */}
              {!session && (
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => { closeSettings(); setAuthMode("signup"); }}
                    className="flex-1 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                  >
                    {t("Sign up", "회원가입")}
                  </button>
                  <button
                    onClick={() => { closeSettings(); setAuthMode("login"); }}
                    className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                  >
                    {t("Login", "로그인")}
                  </button>
                </div>
              )}
              <div className="mb-2 flex rounded-md border border-[var(--border)] overflow-hidden">
                <button
                  onClick={() => setSettingsPanel("settings")}
                  className={`flex-1 py-1.5 text-xs font-semibold ${
                    settingsPanel === "settings"
                      ? "bg-[var(--bg-hover)] text-[var(--ink)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {t("Settings", "설정")}
                </button>
                <button
                  onClick={() => session && setSettingsPanel("account")}
                  disabled={!session}
                  className={`flex-1 py-1.5 text-xs font-semibold ${
                    !session ? "cursor-not-allowed text-[var(--muted)]" : "text-[var(--muted)]"
                  } ${session && settingsPanel === "account" ? "bg-[var(--bg-hover)] text-[var(--ink)]" : ""}`}
                >
                  {t("Account", "계정")}
                </button>
              </div>
              {settingsPanel === "settings" ? (
                <>
                  <div className="mb-2 overflow-hidden rounded-md border border-[var(--border)]">
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-2.5 py-2 text-xs">
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 text-[var(--ink)]">
                          <Globe className="h-3.5 w-3.5" />
                          {t("iCloud sync", "iCloud 동기화")}
                        </span>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                          {!session
                            ? t("Login required for cloud sync.", "클라우드 동기화는 로그인 후 사용 가능합니다.")
                            : lastSyncAt
                            ? `${t("Last sync", "마지막 동기화")}: ${formatDateOrDash(lastSyncAt)}`
                            : t("No recent sync record.", "최근 동기화 기록이 없습니다.")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={triggerManualSync}
                        disabled={!session || isSyncing}
                        className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSyncing ? t("Syncing...", "동기화 중...") : t("Sync now", "지금 동기화")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void exportBackupToJson()}
                      className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-2.5 py-2 text-left text-xs text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        {t("Backup", "백업")}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">{t("JSON", "JSON")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={openRestorePicker}
                      className="flex w-full items-center justify-between gap-2 border-b border-[var(--border)] px-2.5 py-2 text-left text-xs text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        {t("Restore", "복원")}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">{t("From backup file", "백업 파일에서")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => exportCurrentViewToPdf("day")}
                      className="flex w-full items-center justify-between gap-2 px-2.5 pt-2 text-left text-xs text-[var(--ink)]"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Printer className="h-3.5 w-3.5" />
                        {t("Export to PDF", "PDF 내보내기")}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">{t("Choose range", "범위 선택")}</span>
                    </button>
                    <div className="flex gap-1 border-b border-[var(--border)] px-2.5 pb-2 pt-1">
                      <button
                        type="button"
                        onClick={() => exportCurrentViewToPdf("day")}
                        className="flex-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                      >
                        {t("Day", "일간")}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportCurrentViewToPdf("week")}
                        className="flex-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                      >
                        {t("Week", "주간")}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportCurrentViewToPdf("month")}
                        className="flex-1 rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                      >
                        {t("Month", "월간")}
                      </button>
                    </div>
                  </div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Theme", "테마")}</p>
                  <div className="mb-2 flex items-center gap-1 text-xs">
                    <button
                      onClick={() => applyThemeMode("light")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "light"
                          ? "border-[var(--primary)] text-[var(--ink)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label={t("Set light mode", "라이트 모드로 전환")}
                    >
                      <Sun className="h-3.5 w-3.5" /> {t("Light", "라이트")}
                    </button>
                    <button
                      onClick={() => applyThemeMode("dark")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "dark"
                          ? "border-[var(--primary)] text-[var(--ink)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label={t("Set dark mode", "다크 모드로 전환")}
                    >
                      <Moon className="h-3.5 w-3.5" /> {t("Dark", "다크")}
                    </button>
                  </div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Language", "언어")}</p>
                  <div className="mb-2 flex items-center gap-1 text-xs">
                    <button
                      onClick={() => applyLanguage("en")}
                      className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 ${
                        appLanguage === "en"
                          ? "border-[var(--primary)] text-[var(--ink)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label={t("Set English language", "영어로 전환")}
                    >
                      EN
                    </button>
                    <button
                      onClick={() => applyLanguage("ko")}
                      className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 ${
                        appLanguage === "ko"
                          ? "border-[var(--primary)] text-[var(--ink)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label={t("Set Korean language", "한국어로 전환")}
                    >
                      KO
                    </button>
                  </div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Font styles", "폰트 스타일")}</p>
                  <div className="mb-2 rounded-md border border-[var(--border)] p-2">
                    <div className="mb-1.5 flex items-center gap-1 text-[var(--ink)]">
                      <Palette className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">{t("Typography preset", "타이포 프리셋")}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        onClick={() => applyFontStyle("default")}
                        className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 ${
                          fontStyle === "default"
                            ? "border-[var(--primary)] text-[var(--ink)]"
                            : "border-[var(--border)] text-[var(--muted)]"
                        }`}
                      >
                        {t("Default", "기본")}
                      </button>
                      <button
                        onClick={() => applyFontStyle("clean")}
                        className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 ${
                          fontStyle === "clean"
                            ? "border-[var(--primary)] text-[var(--ink)]"
                            : "border-[var(--border)] text-[var(--muted)]"
                        }`}
                      >
                        {t("Clean", "클린")}
                      </button>
                      <button
                        onClick={() => applyFontStyle("rounded")}
                        className={`flex flex-1 items-center justify-center rounded-md border px-2 py-1.5 ${
                          fontStyle === "rounded"
                            ? "border-[var(--primary)] text-[var(--ink)]"
                            : "border-[var(--border)] text-[var(--muted)]"
                        }`}
                      >
                        {t("Rounded", "라운드")}
                      </button>
                    </div>
                  </div>
                  {/* 알림 설정 */}
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Notifications", "알림")}</p>
                  <div className="mb-2 rounded-md border border-[var(--border)] p-2">
                    {notifPermission === "unsupported" ? (
                      <p className="text-[11px] text-[var(--muted)]">{t("Notifications not supported in this browser.", "이 브라우저에서는 알림을 지원하지 않습니다.")}</p>
                    ) : notifPermission === "denied" ? (
                      <p className="text-[11px] text-[var(--muted)]">{t("Notifications are blocked. Allow them in browser settings.", "알림이 차단되어 있습니다. 브라우저 설정에서 허용해 주세요.")}</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--ink)]">{t("Daily reminder", "일일 리마인더")}</span>
                          <button
                            type="button"
                            onClick={() => void handleNotifToggle()}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${notifSettings.enabled ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]"}`}
                            role="switch"
                            aria-checked={notifSettings.enabled}
                          >
                            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${notifSettings.enabled ? "translate-x-4" : "translate-x-0"}`} />
                          </button>
                        </div>
                        {notifSettings.enabled && (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] text-[var(--muted)]">{t("Time", "시간")}</span>
                            <input
                              type="time"
                              value={notifSettings.reminderTime}
                              onChange={(e) => handleNotifTimeChange(e.target.value)}
                              className="n-input h-7 px-2 py-1 text-xs"
                            />
                          </div>
                        )}
                        <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
                          {t("Shows a reminder to record your day at the set time.", "설정한 시간에 오늘 기록을 남기도록 리마인더를 표시합니다.")}
                        </p>
                      </>
                    )}
                  </div>
                  <details className="mb-2 overflow-hidden rounded-md border border-[var(--border)]">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-xs font-semibold text-[var(--ink)]">
                      <span>{t("Security lock", "보안 잠금")}</span>
                      {lockConfig.enabled ? (
                        <span className="rounded-full bg-[var(--primary)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                          {t("On", "켜짐")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                          {t("Off", "꺼짐")}
                        </span>
                      )}
                    </summary>
                    <div className="border-t border-[var(--border)] p-2">
                      <p className="mb-2 text-[11px] leading-5 text-[var(--muted)]">
                        {t(
                          "Protect app access with Face ID/Touch ID and/or a local app passcode.",
                          "Face ID/Touch ID 또는 로컬 앱 비밀번호로 앱 접근을 보호합니다."
                        )}
                      </p>
                      <div className="mb-2 flex gap-2">
                        {lockConfig.enabled ? (
                          <button
                            type="button"
                            onClick={disableAppLock}
                            className="flex-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                          >
                            {t("Disable lock", "잠금 끄기")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={enableAppLock}
                            disabled={!hasSecurityMethod}
                            className="flex-1 rounded-md bg-[var(--primary)] px-2 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {t("Enable lock", "잠금 켜기")}
                          </button>
                        )}
                        {lockConfig.enabled ? (
                          <button
                            type="button"
                            onClick={lockNow}
                            className="flex-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                          >
                            {t("Lock now", "지금 잠그기")}
                          </button>
                        ) : null}
                      </div>

                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--ink)]">
                          <Fingerprint className="h-3.5 w-3.5" />
                          {t("Face ID / Touch ID", "Face ID / Touch ID")}
                        </p>
                        <p className="mb-2 text-[10px] leading-4 text-[var(--muted)]">
                          {biometricSupported
                            ? t("Uses this device's built-in biometric prompt.", "이 기기의 생체 인증 프롬프트를 사용합니다.")
                            : t("Biometric API is unavailable in this browser.", "이 브라우저에서는 생체 인증 API를 사용할 수 없습니다.")}
                        </p>
                        {lockConfig.useBiometric ? (
                          <button
                            type="button"
                            onClick={removeBiometricLock}
                            disabled={isSecurityBusy}
                            className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                          >
                            {t("Remove biometric lock", "생체 인증 잠금 해제")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void setupBiometricLock()}
                            disabled={!biometricSupported || isSecurityBusy}
                            className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSecurityBusy ? t("Setting up...", "설정 중...") : t("Set up biometric lock", "생체 인증 잠금 설정")}
                          </button>
                        )}
                      </div>

                      <div className="mt-2 rounded-md border border-[var(--border)] p-2">
                        <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[var(--ink)]">
                          <Lock className="h-3.5 w-3.5" />
                          {t("App passcode", "앱 비밀번호")}
                        </p>
                        <input
                          value={securityPasscode}
                          onChange={(e) => setSecurityPasscode(e.target.value)}
                          type="password"
                          className="n-input mb-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                          placeholder={t("Enter app passcode", "앱 비밀번호 입력")}
                          autoComplete="new-password"
                        />
                        <input
                          value={securityPasscodeConfirm}
                          onChange={(e) => setSecurityPasscodeConfirm(e.target.value)}
                          type="password"
                          className="n-input w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs"
                          placeholder={t("Confirm app passcode", "앱 비밀번호 확인")}
                          autoComplete="new-password"
                        />
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveAppPasscode()}
                            disabled={isSecurityBusy}
                            className="flex-1 rounded-md bg-[var(--primary)] px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            {lockConfig.usePasscode ? t("Update passcode", "비밀번호 변경") : t("Set passcode", "비밀번호 설정")}
                          </button>
                          {lockConfig.usePasscode ? (
                            <button
                              type="button"
                              onClick={removeAppPasscode}
                              disabled={isSecurityBusy}
                              className="flex-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                            >
                              {t("Remove passcode", "비밀번호 삭제")}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {securityError ? <p className="mt-2 text-[11px] text-[var(--danger)]">{securityError}</p> : null}
                      {securityMessage ? <p className="mt-2 text-[11px] text-[var(--success)]">{securityMessage}</p> : null}
                    </div>
                  </details>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Plan", "플랜")}</p>
                  <div className="mb-2 rounded-md border border-[var(--border)] p-2">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[var(--ink)]">
                        {isPro ? t("Pro (unlocked)", "Pro (활성화됨)") : t("Free", "무료")}
                      </span>
                      {isPro ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                      )}
                    </div>
                  <p className="text-[11px] leading-5 text-[var(--muted)]">
                    {t("Symbol limit", "심볼 제한")}: {isPro ? 40 : 10}
                  </p>
                    {isPro ? null : (
                      <>
                        <button
                          onClick={() => void startUnlockCheckout()}
                          className="mt-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                        >
                          {t("Unlock Pro", "Pro 잠금 해제")}
                        </button>
                        <p className="mt-1.5 text-[11px] leading-5 text-[var(--muted)]">
                          {t("Unlock Pro to remove ads.", "Pro로 업그레이드하면 광고를 제거할 수 있습니다.")}
                        </p>
                      </>
                    )}
                  <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                      {t("Plan source", "플랜 출처")}: {planSourceLabel(planInfo.source)}
                    </p>
                  </div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                    {t("Privacy", "개인정보")}
                  </p>
                  <div className="mb-2 rounded-md border border-[var(--border)] p-2">
                    <div className="mb-1 flex items-start gap-1.5 text-[var(--ink)]">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-[var(--primary)]" />
                      <span className="font-semibold">{t("Data storage policy", "데이터 보관 방식")}</span>
                    </div>
                    <p className="text-[11px] leading-5 text-[var(--muted)]">
                      {session
                        ? t(
                            "Signed-in data (tasks, notes, activities, subscription and entitlements) is stored in Supabase by user_id. Some settings and draft caches are kept on this device.",
                            "로그인 데이터(할 일, 노트, 활동, 구독·혜택)는 Supabase(클라우드)에 사용자 ID 기준으로 저장됩니다. 일부 설정/초안은 이 기기에 저장됩니다."
                          )
                        : t(
                            "Guest data is stored only in this browser's localStorage and does not sync to other devices. It is removed when you clear local data below.",
                            "비로그인 데이터는 이 브라우저의 localStorage에만 저장되며 다른 기기와 동기화되지 않습니다. 아래에서 로컬 데이터 삭제 시 함께 삭제됩니다."
                          )}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-5 text-[var(--muted)]">
                      {t(
                        "Local data is kept as plain localStorage on this device. Do not store secrets here. Clear it on shared devices and sign out on public devices.",
                        "로컬 데이터는 이 기기의 localStorage에 평문으로 저장됩니다. 비밀번호 같은 민감한 정보는 저장하지 마세요. 공유 기기 사용 후 즉시 삭제하고 공용 기기에서는 로그아웃해 주세요."
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => clearDeviceData()}
                      className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                    >
                      {session
                        ? t("Clear device data", "기기 로컬 데이터 삭제")
                        : t("Clear local data", "로컬 데이터 삭제")}
                    </button>
                  </div>
                  {isAdmin ? (
                    <button
                      onClick={() => {
                        closeSettings();
                        if (typeof window !== "undefined") {
                          window.location.assign("/admin");
                        }
                      }}
                      className="mb-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                    >
                      {t("Admin", "관리자")}
                    </button>
                  ) : null}
                  {accountError && <p className="mb-2 text-xs text-[var(--danger)]">{accountError}</p>}
                  {accountMessage && <p className="mb-2 text-xs text-[var(--success)]">{accountMessage}</p>}
                  {planError && <p className="mb-2 text-xs text-[var(--danger)]">{planError}</p>}
                </>
              ) : (
                <>
                  {session ? (
                    <div className="space-y-2 text-xs">
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[var(--ink)]">
                          <UserCircle2 className="h-4 w-4" />
                          <span className="font-semibold">{t("Account Info", "계정 정보")}</span>
                        </div>
                        <div className="grid gap-1 text-[11px]">
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">{t("Email", "이메일")}</span>
                            <span className="flex max-w-[150px] items-center justify-end gap-1 text-right">
                              <span className="truncate">{session.user.email ?? "—"}</span>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(session.user.email || "", t("Email", "이메일"))}
                                className="rounded p-1 text-[var(--muted)] hover:text-[var(--ink)]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </p>
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">{t("User ID", "사용자 ID")}</span>
                            <span className="flex max-w-[150px] items-center justify-end gap-1 text-right">
                              <span className="truncate">{session.user.id}</span>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(session.user.id, t("User ID", "사용자 ID"))}
                                className="rounded p-1 text-[var(--muted)] hover:text-[var(--ink)]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </p>
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">{t("Created at", "가입일")}</span>
                            <span className="text-right text-[11px]">
                              {formatDateOrDash(session.user.created_at)}
                            </span>
                          </p>
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">{t("Email verified", "이메일 인증")}</span>
                            <span className="text-right">{session.user.email_confirmed_at ? t("Yes", "예") : t("No", "아니오")}</span>
                          </p>
                        </div>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[var(--ink)]">
                          <CreditCard className="h-4 w-4" />
                          <span className="font-semibold">{t("Billing & subscription", "결제 및 구독")}</span>
                          <button
                            type="button"
                            onClick={() => void loadAccountSubscription()}
                            className="ml-auto rounded p-1 text-[var(--muted)] hover:text-[var(--ink)]"
                            aria-label={t("Refresh billing", "결제 정보 새로고침")}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isAccountBusy ? (
                          <p className="text-[11px] text-[var(--muted)]">{t("Loading...", "불러오는 중…")}</p>
                        ) : subscriptionInfo ? (
                          <div className="grid gap-1 text-[11px]">
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Plan", "요금제")}</span>
                              <span className="text-right">{accountPlanLabel()}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Status", "상태")}</span>
                              <span className="text-right">{subscriptionInfo.status ?? t("Active", "활성")}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Source", "출처")}</span>
                              <span className="text-right">{subscriptionInfo.source || t("Local", "로컬")}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Trial", "체험")}</span>
                              <span className="text-right">{subscriptionInfo.is_trial ? t("Yes", "예") : t("No", "아니오")}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Grace period", "유예 기간")}</span>
                              <span className="text-right">{subscriptionInfo.grace_period ? t("Yes", "예") : t("No", "아니오")}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Expires", "만료일")}</span>
                              <span className="text-right text-[11px]">{formatDateOrDash(subscriptionInfo.expires_at)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Started", "시작일")}</span>
                              <span className="text-right text-[11px]">{formatDateOrDash(subscriptionInfo.created_at)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">{t("Updated", "수정일")}</span>
                              <span className="text-right text-[11px]">{formatDateOrDash(subscriptionInfo.updated_at)}</span>
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                              {t("Plan source", "플랜 출처")}: {planSourceLabel(planInfo.source)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] leading-5 text-[var(--muted)]">
                            {t("No billing record found.", "결제 기록이 없습니다.")} {t("Current tier", "현재 플랜은")} {planInfo.plan.toUpperCase()} {t("is", "입니다")}.
                          </p>
                        )}
                        {!isPro ? (
                          <button
                            onClick={() => void startUnlockCheckout()}
                            className="mt-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                          >
                            {t("Upgrade", "업그레이드")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsPanel("settings");
                          }}
                          className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                        >
                          {t("Open plan settings", "플랜 설정 열기")}
                        </button>
                        <div className="mt-2 rounded border border-[var(--border)] p-2 text-[11px] leading-5 text-[var(--muted)]">
                          <p className="mb-1 font-semibold text-[var(--ink)]">{t("Plan features", "플랜 기능")}</p>
                          <p>{t("Symbol limit", "심볼 제한")}: {planInfo.features.symbolLimit}</p>
                          <p>{t("Top symbols in summary", "요약 표시 심볼 개수")}: {planInfo.features.topSummaryLimit}</p>
                          <p>{t("Export", "내보내기")}: {planInfo.features.canExport ? t("Admin page only", "관리자 전용") : t("Unavailable", "사용 불가")}</p>
                          <p>{t("Search", "검색")}: {planInfo.features.canSearch ? t("Enabled", "가능") : t("Unavailable", "사용 불가")}</p>
                          <p>{t("Templates", "템플릿")}: {planInfo.features.canTemplates ? t("Enabled", "가능") : t("Unavailable", "사용 불가")}</p>
                          <p>{t("Todo repeat", "할 일 반복")}: {planInfo.features.canTodoRepeat ? t("Enabled", "가능") : t("Unavailable", "사용 불가")}</p>
                          <p>{t("Advanced summary", "고급 요약")}: {planInfo.features.canAdvancedSummary ? t("Enabled", "가능") : t("Unavailable", "사용 불가")}</p>
                        </div>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[var(--ink)]">
                          <KeyRound className="h-4 w-4" />
                        <span className="font-semibold">{t("Password", "비밀번호")}</span>
                        </div>
                        {canChangePassword ? (
                          <>
                            <form className="space-y-2" onSubmit={(e) => void updatePassword(e)}>
                              <div>
                                <label className="mb-1 block text-[10px] font-semibold text-[var(--muted)]">{t("New Password", "새 비밀번호")}</label>
                                <input
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  type="password"
                                  className="n-input w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs"
                                  placeholder={t("At least 8 characters", "최소 8자 이상 입력해 주세요")}
                                  autoComplete="new-password"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-semibold text-[var(--muted)]">
                                  {t("Confirm Password", "비밀번호 재확인")}
                                </label>
                                <input
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  type="password"
                                  className="n-input w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs"
                                  placeholder={t("Repeat same password", "동일한 비밀번호를 다시 입력해 주세요")}
                                  autoComplete="new-password"
                                />
                              </div>
                              <button
                                type="submit"
                                disabled={isAccountBusy || !newPassword || !confirmPassword}
                                className="w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isAccountBusy ? t("Updating...", "변경 중…") : t("Change password", "비밀번호 변경")}
                              </button>
                            </form>
                            <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                              {t("Password updates apply to your login method and will replace the existing password.", "비밀번호 변경은 로그인 방법에 반영되며 기존 비밀번호를 대체합니다.")}
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-[var(--muted)]">
                            {t("Password change is unavailable for this account type.", "이 계정에서는 비밀번호 변경을 사용할 수 없습니다.")}
                          </p>
                        )}
                        {accountError && <p className="mt-1 text-[11px] text-[var(--danger)]">{accountError}</p>}
                        {accountMessage && <p className="mt-1 text-[11px] text-[var(--success)]">{accountMessage}</p>}
                      </div>
                      {/* 개인 데이터 내보내기 */}
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Data policy", "데이터 안내")}</p>
                        <p className="mb-2 text-[10px] leading-5 text-[var(--muted)]">
                        {t(
                            "Data is separated by login state. You can export it, remove local data, delete all cloud data for this account, or request full account deletion.",
                            "로그인 상태별로 데이터가 구분됩니다. 여기에서 내보내기, 로컬 삭제, 클라우드 데이터 전체 삭제, 계정 삭제 요청을 진행할 수 있습니다."
                          )}
                        </p>
                        <p className="mb-2 text-[10px] leading-4 text-[var(--muted)]">
                          {session
                            ? t(
                                "Local clear removes cached drafts, activity templates, symbols, and local settings saved on this device. Cloud delete removes todos, notes, activities, and subscription records stored in Supabase for this account.",
                                "로컬 삭제는 이 기기의 초안, 활동 템플릿, 심볼, 로컬 설정을 제거합니다. 클라우드 삭제는 이 계정의 할 일/노트/활동/구독 기록을 Supabase에서 제거합니다."
                              )
                            : t(
                                "Local clear removes cached drafts, activity templates, symbols, and local settings from this browser.",
                                "로컬 삭제는 이 브라우저의 초안, 활동 템플릿, 심볼, 로컬 설정을 제거합니다."
                              )}
                        </p>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{t("Data", "데이터")}</p>
                        <button
                          type="button"
                          onClick={() => void exportMyData()}
                          disabled={isExporting}
                          className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isExporting ? t("Exporting…", "내보내기 중…") : t("Export my data (JSON)", "JSON으로 내보내기")}
                        </button>
                        <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
                          {t("Downloads all your tasks, notes, and activities as a JSON file.", "모든 할 일, 노트, 활동 데이터를 JSON 파일로 다운로드합니다.")}
                        </p>
                        <button
                          type="button"
                          onClick={() => clearDeviceData()}
                          className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                        >
                          {t("Delete local data on this device", "이 기기의 로컬 데이터 삭제")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteCloudData()}
                          disabled={isAccountBusy}
                          className="mt-2 w-full rounded-md border border-[var(--danger)]/55 px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isAccountBusy ? t("Deleting…", "삭제 중…") : t("Delete all my cloud data", "클라우드 데이터 전체 삭제")}
                        </button>
                        <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
                          {t(
                            "This removes all todos, notes, activities, and plan records from Supabase for this account.",
                            "이 계정의 할 일, 노트, 활동, 요금제 기록을 Supabase에서 모두 삭제합니다."
                          )}
                        </p>
                        <div className="mt-2 rounded border border-[var(--danger)]/40 p-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--danger)]">
                            {t("Delete account", "계정 삭제")}
                          </p>
                          <p className="text-[10px] leading-4 text-[var(--muted)]">
                            {hasAccountDeleteEndpoint
                              ? t(
                                  "Request full account deletion (including login credentials) to the backend API.",
                                  "로그인 계정을 포함한 전체 계정 삭제를 백엔드 API로 요청합니다."
                                )
                              : t(
                                  "No automatic deletion API is configured. This opens a support process with your account context.",
                                  "자동 삭제 API가 없으므로 계정 삭제를 지원 요청 경로로 진행합니다."
                                )}
                          </p>
                          <button
                            type="button"
                            onClick={() => void requestDeleteAccount()}
                            disabled={isAccountBusy}
                            className="mt-2 w-full rounded-md border border-[var(--danger)]/60 px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isAccountBusy ? t("Requesting...", "요청 중…") : t("Request account deletion", "계정 삭제 요청")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-[var(--muted)]">
                        {t("Sign in to view account info.", "계정 정보를 보려면 로그인해 주세요.")}
                      </p>
                    </>
                  )}
                </>
              )}
              <input
                ref={backupFileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => void handleRestoreBackupFile(e.target.files?.[0] ?? null)}
              />
              {session ? (
                <button
                  onClick={() => void signOut()}
                  className="mt-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                >
                  {t("Sign out", "로그아웃")}
                </button>
              ) : null}
            </div>
          ) : null}
          {isSettingsOpen ? (
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="fixed inset-0 -z-10"
              aria-label={t("Close settings", "설정 닫기")}
            />
          ) : null}
        </div>
      </section>
      {/* 메인 다이어리 컴포넌트 — session 전달, 비로그인 시 저장 요청 시 onRequestAuth 콜백 */}
      <ErrorBoundary>
        <DailyDiary
          session={session}
          onRequestAuth={() => setAuthMode("login")}
          symbolPlan={symbolPlan}
          planFeatures={planInfo.features}
          appLanguage={appLanguage}
        />
      </ErrorBoundary>
      {isAppLocked ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 shadow-xl">
            <div className="mb-2 flex items-center gap-2 text-[var(--ink)]">
              <ShieldAlert className="h-5 w-5 text-[var(--primary)]" />
              <h2 className="text-sm font-semibold">{t("App is locked", "앱이 잠겨 있습니다")}</h2>
            </div>
            <p className="mb-3 text-xs leading-5 text-[var(--muted)]">
              {t(
                "Unlock with Face ID/Touch ID or your app passcode to continue.",
                "계속하려면 Face ID/Touch ID 또는 앱 비밀번호로 잠금을 해제해 주세요."
              )}
            </p>

            {lockConfig.useBiometric ? (
              <button
                type="button"
                onClick={() => void unlockWithBiometric()}
                disabled={!biometricSupported || isLockScreenBusy}
                className="mb-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLockScreenBusy
                  ? t("Checking biometric...", "생체 인증 확인 중...")
                  : t("Unlock with Face ID / Touch ID", "Face ID / Touch ID로 잠금 해제")}
              </button>
            ) : null}

            {lockConfig.usePasscode ? (
              <div className="space-y-2">
                <input
                  value={lockScreenPasscode}
                  onChange={(e) => setLockScreenPasscode(e.target.value)}
                  type="password"
                  className="n-input w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs"
                  placeholder={t("Enter app passcode", "앱 비밀번호 입력")}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => void unlockWithPasscode()}
                  disabled={isLockScreenBusy}
                  className="w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {t("Unlock", "잠금 해제")}
                </button>
              </div>
            ) : null}

            {lockScreenError ? <p className="mt-2 text-[11px] text-[var(--danger)]">{lockScreenError}</p> : null}
            <button
              type="button"
              onClick={resetAppLockOnDevice}
              className="mt-3 w-full rounded-md border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--bg-hover)]"
            >
              {t("Reset lock on this device", "이 기기의 잠금 초기화")}
            </button>
          </div>
        </div>
      ) : null}
      {/* 로그인/회원가입 모달 — authMode가 설정되어 있고 비로그인일 때만 표시 */}
      {authMode && !session && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur">
          <AuthPanel
            compact
            mode={authMode}
            onEmailSent={() => setAuthMode(null)}
            onClose={() => setAuthMode(null)}
            appLanguage={appLanguage}
            description={t("Sign in with your email to securely save your diary.", "이메일로 로그인해 일기 데이터를 안전하게 저장하세요.")}
          />
        </div>
      )}

      {/* 온보딩 모달 — 첫 방문 시에만 표시 */}
      {showOnboarding && !session && (
        <OnboardingModal
          appLanguage={appLanguage}
          onComplete={() => setShowOnboarding(false)}
          onRequestSignIn={() => { setShowOnboarding(false); setAuthMode("signup"); }}
        />
      )}
    </div>
    </ToastProvider>
  );
}
