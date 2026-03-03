/**
 * 메인 홈 페이지 (page.tsx)
 *
 * "use client" — 클라이언트 컴포넌트로 마킹 (useState, useEffect 등 훅 사용)
 * - App Router 기본은 서버 컴포넌트이므로, 훅 사용 시 반드시 "use client" 필요
 */
"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
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
  Copy,
  KeyRound,
  Moon,
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

const LOCAL_DATA_STORAGE_KEYS = [
  "diary-draft-todos",
  "diary-draft-journal",
  "diary-draft-activities",
  "diary-activity-step-minutes",
  "diary-dashboard-view",
  "diary-activity-templates",
  "diary-user-symbols",
  "diary-notification-settings",
  "diary-admin-export-audit",
  "diary-onboarding-done",
  "diary-theme-mode",
  "diary-language",
  "daily-diary-ios-hint-dismissed-v1",
  "daily-diary-install-banner-dismissed-v1"
] as const;
const LOCAL_DATA_STORAGE_PREFIXES = ["diary-symbol-plan-"] as const;
const ACCOUNT_DELETE_ENDPOINT = process.env.NEXT_PUBLIC_ACCOUNT_DELETE_ENDPOINT?.trim();
const PRIVACY_CONTACT_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim();

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

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };
  const signOut = async () => {
    const userId = session?.user?.id ?? null;
    await supabase.auth.signOut();
    clearLocalDiaryData(userId);
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
  const t = (en: string, ko: string) => (isKorean ? ko : en);

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
  }, [session?.user]);

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

  const grantProAfterPurchase = useCallback(async () => {
    if (isPro) return;
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

    if (!session?.user) {
      return;
    }
    try {
      await syncPlanWithMetadata(session.user, "pro");
      await upsertProSubscription(session.user);
      const info = await resolvePlanState(session.user);
      setSymbolPlan(info.plan);
      setPlanInfo(info);
      if (settingsPanel === "account") {
        await loadAccountSubscription();
      }
      setPlanError("");
    } catch {
      setPlanError(t("Plan saved on this device. Server sync for account failed.", "현재 기기엔 반영되었지만 계정 동기화에 실패했습니다."));
    }
  }, [isPro, session, settingsPanel, loadAccountSubscription]);

  const startUnlockCheckout = async () => {
    if (isPro) return;
    if (!session?.user) {
      setPlanError(t("Please login first to continue purchase.", "구매를 계속하려면 먼저 로그인해 주세요."));
      setAuthMode("login");
      closeSettings();
      return;
    }

    setPlanError("");
    const purchasePayload = {
      productId: "pro_unlock",
      source: "web",
      provider: accountProvider,
      userId: session.user.id,
      plan: "pro",
      timestamp: new Date().toISOString()
    };

    const toCheckoutUrl = () => {
      if (!checkoutUrl) return null;
      try {
        const url = new URL(checkoutUrl, window.location.href);
        url.searchParams.set("product", "pro_unlock");
        url.searchParams.set("provider", accountProvider);
        url.searchParams.set("uid", session.user.id);
        return url.toString();
      } catch {
        return checkoutUrl;
      }
    };

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

    const completePurchase = () => {
      void grantProAfterPurchase();
    };

    const search = new URLSearchParams(window.location.search);
    if (search.get("purchase") === "success") {
      void grantProAfterPurchase();
      search.delete("purchase");
      const qs = search.toString();
      const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
      window.history.replaceState({}, "", nextUrl);
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
            <div className="absolute right-4 top-full z-40 mt-1 w-72 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-lg">
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
