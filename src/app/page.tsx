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
  RefreshCw,
  Settings,
  Sun,
  UserCircle2,
  Sparkles
} from "lucide-react";
import { getPlanLimits, type UserSymbolPlan } from "@/lib/user-symbols";
import {
  resolvePlanState,
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
        purchasePro?: { postMessage: (payload?: unknown) => void };
        proPurchase?: { postMessage: (payload?: unknown) => void };
      };
    };
  }
}

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

  const isPro = symbolPlan === "pro";
  const checkoutUrl = process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL?.trim();

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

  const closeSettings = () => {
    setIsSettingsOpen(false);
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    closeSettings();
  };

  const resetAccountForm = () => {
    setNewPassword("");
    setConfirmPassword("");
    setAccountError("");
    setAccountMessage("");
  };

  const formatDateOrDash = (value: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString();
  };

  const copyToClipboard = async (value: string, label: string) => {
    if (!value) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setAccountError("Clipboard is not available.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setAccountError("");
      setAccountMessage(`${label} copied.`);
    } catch {
      setAccountError(`${label} copy failed.`);
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
        setAccountMessage("Billing load failed.");
        return;
      }
      setSubscriptionInfo(data);
      setAccountError("");
      setAccountMessage("Billing info refreshed.");
    } finally {
      setIsAccountBusy(false);
    }
  }, [session?.user?.id]);

  const updatePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!session?.user) {
      setAccountError("Sign in required.");
      return;
    }

    const provider = String(
      session.user.app_metadata?.provider || session.user.user_metadata?.provider || "email"
    );
    if (provider !== "email") {
      setAccountError("Password change is only available for email accounts.");
      return;
    }

    if (newPassword.length < 8) {
      setAccountError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setAccountError("Password confirmation does not match.");
      return;
    }
    setIsAccountBusy(true);
    setAccountError("");
    setAccountMessage("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsAccountBusy(false);
    if (error) {
      setAccountError(error.message || "Password change failed.");
      return;
    }
    setAccountMessage("Password changed successfully.");
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
        supabase.from("todos").select("*").eq("user_id", session.user.id).order("due_date"),
        supabase.from("journal_entries").select("*").eq("user_id", session.user.id).order("entry_date"),
        supabase.from("daily_activities").select("*").eq("user_id", session.user.id).order("activity_date")
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        user: { id: session.user.id, email: session.user.email },
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
      setPlanError("Plan saved on this device. Server sync for account failed.");
    }
  }, [isPro, session, settingsPanel, loadAccountSubscription]);

  const startUnlockCheckout = async () => {
    if (isPro) return;
    if (!session?.user) {
      setPlanError("Please login first to continue purchase.");
      setAuthMode("login");
      closeSettings();
      return;
    }

    setPlanError("");

    if (typeof window !== "undefined") {
      const iosBridge =
        window.webkit?.messageHandlers?.purchasePro ??
        window.webkit?.messageHandlers?.proPurchase;
      if (iosBridge?.postMessage) {
        iosBridge.postMessage({ productId: "pro_unlock" });
        return;
      }

      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }
    }

    setPlanError("Checkout is not configured. Set NEXT_PUBLIC_PRO_CHECKOUT_URL or connect iOS purchase bridge.");
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
      ? "Subscription"
      : source === "metadata"
        ? "Account profile"
        : "Local device";
  };

  const accountPlanLabel = () => {
    if (!session?.user) return "Guest";
    if (subscriptionInfo?.plan) {
      return `${subscriptionInfo.plan.toUpperCase()} (${subscriptionInfo.status ?? "unknown"})`;
    }
    return isPro ? "Pro" : "Free";
  };

  const canChangePassword = session
    ? String(
        session.user.app_metadata?.provider ||
          session.user.user_metadata?.provider ||
          "email"
      ) === "email"
    : false;
  const isAdmin = isAdminUser(session?.user ?? null);

  // 세션 로드 전에는 로딩 UI 표시
  if (!ready) {
    return <main className="min-h-screen flex items-center justify-center">Loading...</main>;
  }

  return (
    <ToastProvider>
    <div className="relative">
      {/* 상단 고정 헤더: 로그인 시 이메일, 비로그인 시 로그인/회원가입 탭 */}
      <section
        className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}
      >
        <div
          className="mx-auto flex w-full max-w-5xl items-center justify-between overflow-visible rounded-full border border-[var(--border)] bg-[var(--bg)] px-1"
        >
          <div className={`grid min-h-10 grow divide-x divide-[var(--border)] ${session ? "grid-cols-2" : "grid-cols-3"}`}>
            {!session && (
              <>
                <button
                  onClick={() => {
                    setAuthMode("signup");
                    closeSettings();
                  }}
                  className={`px-4 py-2 text-sm font-semibold ${
                    authMode === "signup" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)] text-[var(--ink)]"
                  }`}
                >
                  Sign up
                </button>
                <button
                  onClick={() => {
                    setAuthMode("login");
                    closeSettings();
                  }}
                  className={`px-4 py-2 text-sm font-semibold ${
                    authMode === "login" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)] text-[var(--ink)]"
                  }`}
                >
                  Login
                </button>
              </>
            )}
            <button
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="flex items-center justify-center gap-1 px-4 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
          {session ? (
            <button
              onClick={() => {
                closeSettings();
                void signOut();
              }}
              className="ml-2 rounded-full px-3 py-1 text-xs font-semibold text-[var(--muted)]"
            >
              Sign out
            </button>
          ) : null}
          {isSettingsOpen ? (
            <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-md">
              <div className="mb-2 flex rounded-md border border-[var(--border)] overflow-hidden">
                <button
                  onClick={() => setSettingsPanel("settings")}
                  className={`flex-1 py-1.5 text-xs font-semibold ${
                    settingsPanel === "settings"
                      ? "bg-[var(--bg-hover)] text-[var(--ink)]"
                      : "text-[var(--muted)]"
                  }`}
                >
                  Settings
                </button>
                <button
                  onClick={() => session && setSettingsPanel("account")}
                  disabled={!session}
                  className={`flex-1 py-1.5 text-xs font-semibold ${
                    !session ? "cursor-not-allowed text-[var(--muted)]" : "text-[var(--muted)]"
                  } ${session && settingsPanel === "account" ? "bg-[var(--bg-hover)] text-[var(--ink)]" : ""}`}
                >
                  Account
                </button>
              </div>
              {settingsPanel === "settings" ? (
                <>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Theme</p>
                  <div className="mb-2 flex items-center gap-1 text-xs">
                    <button
                      onClick={() => applyThemeMode("light")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "light"
                          ? "border-[var(--primary)] text-[var(--ink)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label="Set light mode"
                    >
                      <Sun className="h-3.5 w-3.5" /> Light
                    </button>
                    <button
                      onClick={() => applyThemeMode("dark")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "dark"
                          ? "border-[var(--primary)] text-[var(--ink)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label="Set dark mode"
                    >
                      <Moon className="h-3.5 w-3.5" /> Dark
                    </button>
                  </div>
                  {/* 알림 설정 */}
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Notifications</p>
                  <div className="mb-2 rounded-md border border-[var(--border)] p-2">
                    {notifPermission === "unsupported" ? (
                      <p className="text-[11px] text-[var(--muted)]">Notifications not supported in this browser.</p>
                    ) : notifPermission === "denied" ? (
                      <p className="text-[11px] text-[var(--muted)]">Notifications are blocked. Allow them in browser settings.</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--ink)]">Daily reminder</span>
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
                            <span className="text-[11px] text-[var(--muted)]">Time</span>
                            <input
                              type="time"
                              value={notifSettings.reminderTime}
                              onChange={(e) => handleNotifTimeChange(e.target.value)}
                              className="n-input h-7 px-2 py-1 text-xs"
                            />
                          </div>
                        )}
                        <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
                          Shows a reminder to record your day at the set time.
                        </p>
                      </>
                    )}
                  </div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Plan</p>
                  <div className="mb-2 rounded-md border border-[var(--border)] p-2">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-[var(--ink)]">
                        {isPro ? "Pro (unlocked)" : "Free"}
                      </span>
                      {isPro ? (
                        <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                      ) : (
                        <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                      )}
                    </div>
                    <p className="text-[11px] leading-5 text-[var(--muted)]">Symbol limit: {isPro ? 40 : 10}</p>
                    {isPro ? null : (
                      <>
                        <button
                          onClick={() => void startUnlockCheckout()}
                          className="mt-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                        >
                          Unlock Pro
                        </button>
                        <p className="mt-1.5 text-[11px] leading-5 text-[var(--muted)]">Unlock Pro to remove ads.</p>
                      </>
                    )}
                    <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">
                      Plan source: {planSourceLabel(planInfo.source)}
                    </p>
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
                      Admin
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
                          <span className="font-semibold">Account Info</span>
                        </div>
                        <div className="grid gap-1 text-[11px]">
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">Email</span>
                            <span className="flex max-w-[150px] items-center justify-end gap-1 text-right">
                              <span className="truncate">{session.user.email ?? "—"}</span>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(session.user.email || "", "Email")}
                                className="rounded p-1 text-[var(--muted)] hover:text-[var(--ink)]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </p>
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">User ID</span>
                            <span className="flex max-w-[150px] items-center justify-end gap-1 text-right">
                              <span className="truncate">{session.user.id}</span>
                              <button
                                type="button"
                                onClick={() => void copyToClipboard(session.user.id, "User ID")}
                                className="rounded p-1 text-[var(--muted)] hover:text-[var(--ink)]"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </p>
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">Created at</span>
                            <span className="text-right text-[11px]">
                              {formatDateOrDash(session.user.created_at)}
                            </span>
                          </p>
                          <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                            <span className="text-[var(--muted)]">Email verified</span>
                            <span className="text-right">{session.user.email_confirmed_at ? "Yes" : "No"}</span>
                          </p>
                        </div>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[var(--ink)]">
                          <CreditCard className="h-4 w-4" />
                          <span className="font-semibold">Billing & subscription</span>
                          <button
                            type="button"
                            onClick={() => void loadAccountSubscription()}
                            className="ml-auto rounded p-1 text-[var(--muted)] hover:text-[var(--ink)]"
                            aria-label="Refresh billing"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {isAccountBusy ? (
                          <p className="text-[11px] text-[var(--muted)]">Loading...</p>
                        ) : subscriptionInfo ? (
                          <div className="grid gap-1 text-[11px]">
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Plan</span>
                              <span className="text-right">{accountPlanLabel()}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Status</span>
                              <span className="text-right">{subscriptionInfo.status ?? "active"}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Source</span>
                              <span className="text-right">{subscriptionInfo.source || "local"}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Trial</span>
                              <span className="text-right">{subscriptionInfo.is_trial ? "Yes" : "No"}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Grace period</span>
                              <span className="text-right">{subscriptionInfo.grace_period ? "Yes" : "No"}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Expires</span>
                              <span className="text-right text-[11px]">{formatDateOrDash(subscriptionInfo.expires_at)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Started</span>
                              <span className="text-right text-[11px]">{formatDateOrDash(subscriptionInfo.created_at)}</span>
                            </p>
                            <p className="flex items-center justify-between gap-2 text-[var(--ink-light)]">
                              <span className="text-[var(--muted)]">Updated</span>
                              <span className="text-right text-[11px]">{formatDateOrDash(subscriptionInfo.updated_at)}</span>
                            </p>
                            <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
                              Plan source: {planSourceLabel(planInfo.source)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-[11px] leading-5 text-[var(--muted)]">
                            No billing record found. Your current tier is {planInfo.plan.toUpperCase()}.
                          </p>
                        )}
                        {!isPro ? (
                          <button
                            onClick={() => void startUnlockCheckout()}
                            className="mt-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                          >
                            Upgrade
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsPanel("settings");
                          }}
                          className="mt-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                        >
                          Open plan settings
                        </button>
                        <div className="mt-2 rounded border border-[var(--border)] p-2 text-[11px] leading-5 text-[var(--muted)]">
                          <p className="mb-1 font-semibold text-[var(--ink)]">Plan features</p>
                          <p>Symbol limit: {planInfo.features.symbolLimit}</p>
                          <p>Top symbols in summary: {planInfo.features.topSummaryLimit}</p>
                          <p>Export: {planInfo.features.canExport ? "Admin page only" : "Unavailable"}</p>
                          <p>Search: {planInfo.features.canSearch ? "Enabled" : "Unavailable"}</p>
                          <p>Templates: {planInfo.features.canTemplates ? "Enabled" : "Unavailable"}</p>
                          <p>Todo repeat: {planInfo.features.canTodoRepeat ? "Enabled" : "Unavailable"}</p>
                          <p>Advanced summary: {planInfo.features.canAdvancedSummary ? "Enabled" : "Unavailable"}</p>
                        </div>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <div className="mb-1 flex items-center gap-1.5 text-[var(--ink)]">
                          <KeyRound className="h-4 w-4" />
                          <span className="font-semibold">Password</span>
                        </div>
                        {canChangePassword ? (
                          <>
                            <form className="space-y-2" onSubmit={(e) => void updatePassword(e)}>
                              <div>
                                <label className="mb-1 block text-[10px] font-semibold text-[var(--muted)]">New Password</label>
                                <input
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  type="password"
                                  className="n-input w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs"
                                  placeholder="At least 8 characters"
                                  autoComplete="new-password"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[10px] font-semibold text-[var(--muted)]">
                                  Confirm Password
                                </label>
                                <input
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  type="password"
                                  className="n-input w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs"
                                  placeholder="Repeat same password"
                                  autoComplete="new-password"
                                />
                              </div>
                              <button
                                type="submit"
                                disabled={isAccountBusy || !newPassword || !confirmPassword}
                                className="w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isAccountBusy ? "Updating..." : "Change password"}
                              </button>
                            </form>
                            <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                              Password updates apply to your login method and will replace the existing password.
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-[var(--muted)]">
                            Password change is unavailable for this account type.
                          </p>
                        )}
                        {accountError && <p className="mt-1 text-[11px] text-[var(--danger)]">{accountError}</p>}
                        {accountMessage && <p className="mt-1 text-[11px] text-[var(--success)]">{accountMessage}</p>}
                      </div>
                      {/* 개인 데이터 내보내기 */}
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Data</p>
                        <button
                          type="button"
                          onClick={() => void exportMyData()}
                          disabled={isExporting}
                          className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isExporting ? "Exporting…" : "Export my data (JSON)"}
                        </button>
                        <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">
                          Downloads all your tasks, notes, and activities as a JSON file.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-xs text-[var(--muted)]">Sign in to view account info.</p>
                      <button
                        onClick={() => {
                          setAuthMode("login");
                          closeSettings();
                        }}
                        className="mb-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                      >
                        Login
                      </button>
                      <button
                        onClick={() => {
                          setAuthMode("signup");
                          closeSettings();
                        }}
                        className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                      >
                        Sign up
                      </button>
                    </>
                  )}
                </>
              )}
              {session ? (
                <button
                  onClick={() => void signOut()}
                  className="mt-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                >
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
          {isSettingsOpen ? (
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 -z-10"
              aria-label="Close settings"
            />
          ) : null}
        </div>
      </section>
      {/* 메인 다이어리 컴포넌트 — session 전달, 비로그인 시 저장 요청 시 onRequestAuth 콜백 */}
      <DailyDiary
        session={session}
        onRequestAuth={() => setAuthMode("login")}
        symbolPlan={symbolPlan}
        planFeatures={planInfo.features}
      />
      {/* 로그인/회원가입 모달 — authMode가 설정되어 있고 비로그인일 때만 표시 */}
      {authMode && !session && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur">
          <AuthPanel
            compact
            mode={authMode}
            onEmailSent={() => setAuthMode(null)}
            onClose={() => setAuthMode(null)}
            description="Sign in with your email to securely save your diary."
          />
        </div>
      )}

      {/* 온보딩 모달 — 첫 방문 시에만 표시 */}
      {showOnboarding && !session && (
        <OnboardingModal
          onComplete={() => setShowOnboarding(false)}
          onRequestSignIn={() => { setShowOnboarding(false); setAuthMode("signup"); }}
        />
      )}
    </div>
    </ToastProvider>
  );
}
