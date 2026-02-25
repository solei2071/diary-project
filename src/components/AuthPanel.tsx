"use client";

import { type FormEvent, useState } from "react";
import { Apple, ArrowRight, Chrome, Linkedin, Lock, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Props = {
  compact?: boolean;
  mode?: "login" | "signup";
  onEmailSent?: () => void;
  description?: string;
  onClose?: () => void;
};

const socialItems = [
  { key: "google", label: "Google", provider: "google", icon: Chrome, colorClass: "text-blue-500" },
  { key: "apple", label: "Apple", provider: "apple", icon: Apple, colorClass: "text-black dark:text-white" },
  { key: "linkedin", label: "LinkedIn", provider: "linkedin_oidc", icon: Linkedin, colorClass: "text-sky-600" }
];

export default function AuthPanel({
  compact = false,
  mode = "login",
  onEmailSent,
  description,
  onClose
}: Props) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [socialLoadingKey, setSocialLoadingKey] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const title = isSignup ? "Create account" : "Welcome back";
  const subtitle = isSignup
    ? "Use your email to create your account with a secure link."
    : "Please enter your email to sign in.";
  const submitLabel = isSignup ? "Send sign up link" : "Send sign in link";
  const helperCopy =
    description ??
    (isSignup
      ? "No password required. We will email you a secure link."
      : "No password required. We will send a secure sign-in link.");

  const wrapperClass = compact
    ? "w-full max-w-[440px] rounded-[2rem] border border-[var(--border)] bg-[var(--bg)]/95 p-0 shadow-2xl shadow-black/10 backdrop-blur-2xl"
    : "mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-5 py-14";

  const stateBoxClass = message
    ? "border-green-300/70 bg-green-50 text-green-700 dark:border-green-400/30 dark:bg-green-500/10 dark:text-green-200"
    : error
      ? "border-red-300/70 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200"
      : "border-[var(--border)] bg-[var(--bg-secondary)]/65 text-[var(--muted)]";

  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setIsLoading(true);
    const redirectTo = `${window.location.origin}/`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true
      }
    });

    if (signInError) {
      setError(signInError.message || "Failed to send sign-in link.");
    } else {
      setMessage(
        isSignup
          ? "Sign-up link sent. Open your email and continue."
          : "Sign-in link sent. Open your email and continue."
      );
      onEmailSent?.();
    }
    setIsLoading(false);
  };

  const startSocialAuth = async (
    provider: (typeof socialItems)[number]["provider"],
    socialKey: string,
    label: string
  ) => {
    setError("");
    setMessage("");
    setSocialLoadingKey(socialKey);

    const redirectTo = `${window.location.origin}/`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: provider as any,
      options: {
        redirectTo
      }
    });

    if (oauthError) {
      setSocialLoadingKey(null);
      setError(
        oauthError.message ||
          `${label} login is not available. Enable ${label} provider in Supabase Auth settings.`
      );
    }
  };

  return (
    <section className={wrapperClass}>
      <div className="relative p-4 sm:p-6">
        {onClose ? (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-light)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Close
            </button>
          </div>
        ) : null}

        <form
          onSubmit={sendMagicLink}
          className="relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--bg)] px-5 pb-6 pt-8 sm:px-8"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-70"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(59,130,246,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(59,130,246,0.08) 1px, transparent 1px)",
              backgroundSize: "52px 52px"
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-sky-100/65 to-transparent dark:from-sky-900/20" />

          <div className="relative z-10 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-[2rem] font-black tracking-[-0.02em] text-[var(--ink)]">{title}</h1>
            <p className="mt-2 text-base text-[var(--ink-light)]">{subtitle}</p>
          </div>

          <div className="relative z-10 mt-7 grid grid-cols-3 gap-3">
            {socialItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => void startSocialAuth(item.provider, item.key, item.label)}
                  disabled={isLoading || socialLoadingKey !== null}
                  title={`Continue with ${item.label}`}
                  className="flex h-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {socialLoadingKey === item.key ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--ink)] border-t-transparent" />
                  ) : (
                    <Icon className={`h-5 w-5 ${item.colorClass}`} />
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative z-10 my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)]">OR</span>
            <span className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div className="relative z-10 space-y-4">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="Enter your email..."
                aria-label="Email"
                className="n-input h-14 w-full rounded-2xl border-[var(--border)] bg-[var(--bg)] text-base"
                style={{ paddingLeft: "3rem", paddingRight: "1rem" }}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="inline-flex cursor-pointer items-center gap-2 text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                Remember device
              </label>
              <button type="button" className="text-[var(--ink-light)] underline underline-offset-2">
                Need help?
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-gradient-to-b from-zinc-800 to-black text-base font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.25)] transition-opacity disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </>
              ) : (
                <>
                  {submitLabel}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>

          <div className={`relative z-10 mt-4 rounded-xl border px-3 py-2 text-xs leading-5 ${stateBoxClass}`}>
            {message ? (
              <p>{message}</p>
            ) : error ? (
              <p>{error}</p>
            ) : (
              <p>{helperCopy}</p>
            )}
          </div>

          <p className="relative z-10 mt-5 text-center text-sm text-[var(--ink-light)]">
            {isSignup ? "Already have an account? Use sign in mode." : "No account yet? Sign in with email to create one."}
          </p>
        </form>
      </div>
    </section>
  );
}
