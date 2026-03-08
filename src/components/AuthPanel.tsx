"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Apple, ArrowRight, Chrome, Mail, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

/** Capacitor iOS 네이티브 환경 여부 감지 */
const isIosNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === "ios";
};

/**
 * iOS 네이티브에서 Apple Sign In 처리
 * @capacitor-community/apple-sign-in 플러그인 사용.
 * 플러그인이 없거나 실패하면 에러를 throw.
 */
const signInWithAppleNative = async (): Promise<void> => {
  // 동적 import — 플러그인 미설치 환경에서도 빌드 오류 없이 처리
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in").catch(() => {
    throw new Error("Apple Sign In plugin is not installed. Run: npm install @capacitor-community/apple-sign-in");
  });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const redirectURI = supabaseUrl
    ? `${supabaseUrl}/auth/v1/callback`
    : `${window.location.origin}/auth/v1/callback`;

  const result = await SignInWithApple.authorize({
    clientId: "com.dailyflow.diary",
    redirectURI,
    scopes: "email name",
    state: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
  });

  const { identityToken } = result.response;
  if (!identityToken) throw new Error("Apple Sign In did not return an identity token.");

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: identityToken,
  });
  if (error) throw error;
};

type Props = {
  compact?: boolean;
  mode?: "login" | "signup";
  onEmailSent?: () => void;
  description?: string;
  onClose?: () => void;
  appLanguage?: "en" | "ko";
};

const ALL_SOCIAL_ITEMS = [
  { key: "google", label: "Google", provider: "google", icon: Chrome, colorClass: "text-[#4285F4]" },
  { key: "apple",  label: "Apple",  provider: "apple",  icon: Apple,  colorClass: "text-[var(--ink)]" },
] as const;
type SocialProvider = (typeof ALL_SOCIAL_ITEMS)[number]["provider"];

const mapMagicLinkError = (
  message: string | undefined,
  t: (en: string, ko: string) => string
) => {
  const normalized = (message ?? "").toLowerCase();
  if (
    normalized.includes("error sending confirmation email") ||
    normalized.includes("error sending magic link email")
  ) {
    return t(
      "Email delivery failed on Supabase. Check Supabase Auth > Email (SMTP) settings and sender configuration.",
      "Supabase에서 메일 발송에 실패했습니다. Supabase Auth > Email(SMTP) 설정과 발신자 구성을 확인해 주세요."
    );
  }
  return message || t("Failed to send link.", "링크 전송에 실패했습니다.");
};

export default function AuthPanel({
  compact = false,
  mode = "login",
  onEmailSent,
  description,
  onClose,
  appLanguage = "en",
}: Props) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);

  /* ── internal mode so the tab can switch without re-mounting ── */
  const [currentMode, setCurrentMode] = useState<"login" | "signup">(mode);

  /* sync when the parent changes the mode prop (e.g. external Sign up / Login buttons) */
  useEffect(() => { setCurrentMode(mode); }, [mode]);

  const [email, setEmail]                       = useState("");
  const [isLoading, setIsLoading]               = useState(false);
  const [message, setMessage]                   = useState("");
  const [error, setError]                       = useState("");
  const [socialLoadingKey, setSocialLoadingKey] = useState<string | null>(null);

  const isSignup    = currentMode === "signup";
  const submitLabel = isSignup ? t("Send sign up link", "회원가입 링크 보내기") : t("Send sign in link", "로그인 링크 보내기");
  const helperCopy  =
    description ??
    (isSignup
      ? t("No password needed — we'll email you a secure sign-up link.", "비밀번호가 필요 없습니다. 안전한 회원가입 링크를 이메일로 보냅니다.")
      : t("No password needed — we'll email you a secure sign-in link.", "비밀번호가 필요 없습니다. 안전한 로그인 링크를 이메일로 보냅니다."));

  const switchMode = (m: "login" | "signup") => {
    setCurrentMode(m);
    setMessage("");
    setError("");
    setEmail("");
  };

  /* ── magic-link submit ── */
  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setMessage("");

    if (!email.trim()) { setError(t("Please enter your email.", "이메일 주소를 입력해 주세요.")); return; }

    setIsLoading(true);
    const redirectTo = `${window.location.origin}/`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });

    if (signInError) {
      setError(mapMagicLinkError(signInError.message, t));
    } else {
      setMessage(
        isSignup
          ? t("Sign-up link sent! Check your inbox.", "회원가입 링크가 전송되었습니다. 메일함을 확인해 주세요.")
          : t("Sign-in link sent! Check your inbox.", "로그인 링크가 전송되었습니다. 메일함을 확인해 주세요."),
      );
      onEmailSent?.();
    }
    setIsLoading(false);
  };

  /* ── OAuth ── */
  const startSocialAuth = async (
    provider: SocialProvider,
    socialKey: string,
    label: string,
  ) => {
    setError(""); setMessage("");
    setSocialLoadingKey(socialKey);

    try {
      // iOS 네이티브에서 Apple Sign In → 네이티브 플러그인 사용
      if (provider === "apple" && isIosNative()) {
        await signInWithAppleNative();
        // 성공 시 supabase.auth.onAuthStateChange가 세션을 업데이트함
        setSocialLoadingKey(null);
        return;
      }

      // Web 또는 비-Apple: 기존 Supabase OAuth 흐름
      const redirectTo = `${window.location.origin}/`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (oauthError) {
        setError(
          oauthError.message ||
            `${label} ${t("sign-in is not configured yet. Enable it in Supabase → Auth → Providers.", "가 아직 연결되지 않았습니다. Supabase → Auth → Providers에서 설정해 주세요.")}`,
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${label} ${t("sign-in failed.", "로그인에 실패했습니다.")}`,
      );
    } finally {
      setSocialLoadingKey(null);
    }
  };

  /* ── full-page (non-compact) wrapper ── */
  if (!compact) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_35%),radial-gradient(circle_at_bottom,_rgba(245,158,11,0.08),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_48%,_#ffffff_100%)] px-5 py-14">
        <CompactCard
          isSignup={isSignup}
          currentMode={currentMode}
          switchMode={switchMode}
          email={email}
          setEmail={setEmail}
          isLoading={isLoading}
          message={message}
          error={error}
          socialLoadingKey={socialLoadingKey}
          t={t}
          submitLabel={submitLabel}
          helperCopy={helperCopy}
          sendMagicLink={sendMagicLink}
          startSocialAuth={startSocialAuth}
          onClose={undefined}
        />
      </div>
    );
  }

  return (
    <CompactCard
      isSignup={isSignup}
      currentMode={currentMode}
      switchMode={switchMode}
      email={email}
      setEmail={setEmail}
      isLoading={isLoading}
      message={message}
      error={error}
      socialLoadingKey={socialLoadingKey}
      t={t}
      submitLabel={submitLabel}
      helperCopy={helperCopy}
      sendMagicLink={sendMagicLink}
      startSocialAuth={startSocialAuth}
      onClose={onClose}
    />
  );
}

/* ─────────────────────────────────────────────
   Inner card — shared between compact & full
───────────────────────────────────────────── */
type CardProps = {
  isSignup: boolean;
  currentMode: "login" | "signup";
  switchMode: (m: "login" | "signup") => void;
  email: string;
  setEmail: (v: string) => void;
  isLoading: boolean;
  message: string;
  error: string;
  socialLoadingKey: string | null;
  t: (en: string, ko: string) => string;
  submitLabel: string;
  helperCopy: string;
  sendMagicLink: (e: FormEvent) => void;
  startSocialAuth: (provider: SocialProvider, key: string, label: string) => void;
  onClose?: () => void;
};

function CompactCard({
  isSignup, currentMode, switchMode,
  email, setEmail, isLoading, message, error,
  socialLoadingKey, t, submitLabel, helperCopy,
  sendMagicLink, startSocialAuth, onClose,
}: CardProps) {
  return (
    <div className="relative w-full max-w-[400px] overflow-hidden rounded-[32px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] shadow-2xl shadow-black/10 backdrop-blur-xl dark:bg-[linear-gradient(180deg,rgba(19,23,32,0.96)_0%,rgba(28,33,48,0.98)_100%)] dark:shadow-black/50">

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close", "닫기")}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/8 text-[var(--ink-light)] transition-colors hover:bg-black/14 dark:bg-white/10 dark:hover:bg-white/18"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* ── Header ── */}
      <div className="relative overflow-hidden border-b border-[var(--border)] px-7 pb-6 pt-8 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_70%)]" />

        {/* Logo */}
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-500 via-sky-500 to-indigo-600 shadow-lg shadow-blue-500/25">
          <span className="text-2xl">📔</span>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Daily Flow</p>
        <h2 className="mt-2 text-[17px] font-bold tracking-tight text-[var(--ink)]">
          {isSignup ? t("Create your account", "계정 만들기") : t("Welcome back", "다시 오셨군요")}
        </h2>
        <p className="mx-auto mt-2 max-w-[18rem] text-[12px] leading-5 text-[var(--muted)]">
          {t(
            "Use the same calm card language as the diary while keeping authentication lightweight.",
            "다이어리와 같은 차분한 카드 언어를 유지하면서 인증은 가볍게 처리합니다."
          )}
        </p>
      </div>

      {/* ── Tab switcher ── */}
      <div className="mx-7 mb-5 mt-5 flex rounded-2xl bg-[var(--bg-secondary)] p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-[14px] py-2.5 text-[13px] font-semibold transition-all ${
              currentMode === m
                ? "bg-[var(--bg)] text-[var(--ink)] shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {m === "login" ? t("Sign in", "로그인") : t("Sign up", "회원가입")}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="px-7 pb-7">
        {/* Social buttons — side by side */}
        <div className="grid grid-cols-2 gap-2.5">
          {ALL_SOCIAL_ITEMS.map((item) => {
            const Icon = item.icon;
            const isSpinning = socialLoadingKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => void startSocialAuth(item.provider, item.key, item.label)}
                disabled={isLoading || socialLoadingKey !== null}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] text-[13px] font-medium text-[var(--ink)] transition-all hover:border-[var(--primary)]/40 hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSpinning ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ink)] border-t-transparent" />
                ) : (
                  <Icon className={`h-[18px] w-[18px] ${item.colorClass}`} />
                )}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[11px] font-medium tracking-widest text-[var(--muted)]">{t("OR", "또는")}</span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Email form */}
        <form onSubmit={sendMagicLink} className="space-y-2.5">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder={t("Enter your email…", "이메일 주소 입력…")}
              aria-label={t("Email", "이메일")}
              className="n-input h-12 w-full rounded-2xl border-[var(--border)] bg-[var(--bg-secondary)] text-[13px] transition-colors focus:border-[var(--primary)]/60"
              style={{ paddingLeft: "2.4rem", paddingRight: "1rem" }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-600 text-[13px] font-semibold text-white shadow-md shadow-blue-500/25 transition-all hover:shadow-blue-500/40 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("Sending…", "전송 중…")}
              </>
            ) : (
              <>
                {submitLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Status message */}
        {(message || error) ? (
          <p className={`mt-3.5 rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed ${
            message
              ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
              : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
          }`}>
            {message || error}
          </p>
        ) : (
          <p className="mt-3.5 text-center text-[11px] leading-relaxed text-[var(--muted)]">
            {helperCopy}
          </p>
        )}
      </div>
    </div>
  );
}
