"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Apple, ArrowRight, Chrome, Linkedin, Mail, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  compact?: boolean;
  mode?: "login" | "signup";
  onEmailSent?: () => void;
  description?: string;
  onClose?: () => void;
};

const socialItems = [
  { key: "google",   label: "Google",   provider: "google",        icon: Chrome,   colorClass: "text-[#4285F4]" },
  { key: "apple",    label: "Apple",    provider: "apple",          icon: Apple,    colorClass: "text-[var(--ink)]" },
  { key: "linkedin", label: "LinkedIn", provider: "linkedin_oidc",  icon: Linkedin, colorClass: "text-[#0A66C2]" },
];

export default function AuthPanel({
  compact = false,
  mode = "login",
  onEmailSent,
  description,
  onClose,
}: Props) {
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
  const submitLabel = isSignup ? "Send sign up link" : "Send sign in link";
  const helperCopy  =
    description ??
    (isSignup
      ? "No password needed — we'll email you a secure sign-up link."
      : "No password needed — we'll email you a secure sign-in link.");

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

    if (!email.trim()) { setError("Please enter your email."); return; }

    setIsLoading(true);
    const redirectTo = `${window.location.origin}/`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });

    if (signInError) {
      setError(signInError.message || "Failed to send link.");
    } else {
      setMessage(
        isSignup
          ? "Sign-up link sent! Check your inbox."
          : "Sign-in link sent! Check your inbox.",
      );
      onEmailSent?.();
    }
    setIsLoading(false);
  };

  /* ── OAuth ── */
  const startSocialAuth = async (
    provider: (typeof socialItems)[number]["provider"],
    socialKey: string,
    label: string,
  ) => {
    setError(""); setMessage("");
    setSocialLoadingKey(socialKey);

    const redirectTo = `${window.location.origin}/`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: { redirectTo },
    });

    if (oauthError) {
      setSocialLoadingKey(null);
      setError(
        oauthError.message ||
          `${label} sign-in is not configured yet. Enable it in Supabase → Auth → Providers.`,
      );
    }
  };

  /* ── full-page (non-compact) wrapper ── */
  if (!compact) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-sm items-center justify-center px-5 py-14">
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
  submitLabel: string;
  helperCopy: string;
  sendMagicLink: (e: FormEvent) => void;
  startSocialAuth: (provider: string, key: string, label: string) => void;
  onClose?: () => void;
};

function CompactCard({
  isSignup, currentMode, switchMode,
  email, setEmail, isLoading, message, error,
  socialLoadingKey, submitLabel, helperCopy,
  sendMagicLink, startSocialAuth, onClose,
}: CardProps) {
  return (
    <div className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl shadow-black/15">

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3.5 top-3.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/6 text-[var(--ink-light)] transition-colors hover:bg-black/12"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* ── Top: logo + tab switcher ── */}
      <div className="bg-gradient-to-b from-blue-50/80 to-transparent px-6 pb-4 pt-7 text-center dark:from-blue-950/30">
        {/* Logo badge */}
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm shadow-blue-100 ring-1 ring-black/5 dark:bg-zinc-800 dark:shadow-none">
          <span className="text-xl">📔</span>
        </div>

        {/* Tab switcher */}
        <div className="mx-auto mt-3 flex w-fit rounded-full bg-black/6 p-0.5 dark:bg-white/8">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-full px-5 py-1.5 text-sm font-semibold transition-all ${
                currentMode === m
                  ? "bg-white text-[var(--ink)] shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-[var(--ink-light)] hover:text-[var(--ink)]"
              }`}
            >
              {m === "login" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-6 pb-6 pt-1">
        {/* Social buttons */}
        <div className="space-y-2">
          {socialItems.map((item) => {
            const Icon = item.icon;
            const isSpinning = socialLoadingKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => void startSocialAuth(item.provider, item.key, item.label)}
                disabled={isLoading || socialLoadingKey !== null}
                className="flex h-11 w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSpinning ? (
                  <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-[var(--ink)] border-t-transparent" />
                ) : (
                  <Icon className={`h-[17px] w-[17px] flex-shrink-0 ${item.colorClass}`} />
                )}
                <span>Continue with {item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-[var(--border)]" />
          <span className="text-[11px] font-semibold tracking-widest text-[var(--muted)]">OR</span>
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        {/* Email form */}
        <form onSubmit={sendMagicLink} className="space-y-2.5">
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              placeholder="Enter your email…"
              aria-label="Email"
              className="n-input h-11 w-full rounded-2xl border-[var(--border)] bg-[var(--bg-secondary)] text-sm"
              style={{ paddingLeft: "2.5rem", paddingRight: "1rem" }}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending…
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
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs leading-relaxed ${
            message
              ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300"
              : "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
          }`}>
            {message || error}
          </p>
        ) : (
          <p className="mt-3 text-center text-[11px] leading-relaxed text-[var(--muted)]">
            {helperCopy}
          </p>
        )}
      </div>
    </div>
  );
}
