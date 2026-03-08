"use client";

import { type FormEvent, useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Mail, ShieldCheck, X } from "lucide-react";
import {
  previewCardClass,
  previewIconButtonClass,
  previewInputClass,
  previewLabelClass,
  previewMutedClass,
  previewPrimaryButtonClass,
  previewScreenClass,
  previewSecondaryButtonClass,
  previewTitleClass
} from "@/components/figma/previewTheme";

interface LoginProps {
  onClose?: () => void;
  onLogin?: () => void;
}

export function Login({ onClose, onLogin }: LoginProps) {
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const isSignin = activeTab === "signin";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (email.trim()) {
      onLogin?.();
    }
  };

  return (
    <div className={`relative flex h-full flex-col items-center justify-center overflow-y-auto px-5 py-6 ${previewScreenClass}`}>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className={`absolute right-4 top-4 z-10 ${previewIconButtonClass}`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm space-y-4"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className={`${previewCardClass} overflow-hidden p-5`}
        >
          <div className="w-full">
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className={previewLabelClass}>Daily Flow</p>
                <h1 className={`mt-2 ${previewTitleClass}`}>
                  {isSignin ? "Welcome back" : "Start your diary rhythm"}
                </h1>
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-blue-500 via-sky-500 to-amber-400 shadow-lg shadow-blue-500/20">
                <span className="text-3xl" role="img" aria-label="Diary">
                  {"\uD83D\uDCD2"}
                </span>
              </div>
            </div>

            <p className={previewMutedClass}>
              {isSignin
                ? "Magic-link sign in with a calmer, more native-feeling flow."
                : "Use the Figma idea as reference, but keep it aligned with the project tone."}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { label: "Private", value: "Locked" },
                { label: "Access", value: "Magic Link" },
                { label: "Preview", value: "Demo Ready" }
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[12px] font-medium text-[var(--ink)]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className={`${previewCardClass} p-2`}
        >
          <button
            type="button"
            onClick={() => setActiveTab("signin")}
            className="relative flex-1 py-3 text-sm font-semibold transition-all"
          >
            {activeTab === "signin" ? (
              <motion.div
                layoutId="figma-login-tab"
                className="absolute inset-0 rounded-[18px] bg-white shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            ) : null}
            <span className={`relative z-10 ${activeTab === "signin" ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>
              Sign in
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("signup")}
            className="relative flex-1 py-3 text-sm font-semibold transition-all"
          >
            {activeTab === "signup" ? (
              <motion.div
                layoutId="figma-login-tab"
                className="absolute inset-0 rounded-[18px] bg-white shadow-sm"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            ) : null}
            <span className={`relative z-10 ${activeTab === "signup" ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>
              Sign up
            </span>
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`${previewCardClass} space-y-3 p-4`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={previewLabelClass}>Fast Access</p>
              <p className="mt-1 text-[14px] font-semibold text-[var(--ink)]">Choose a sign-in route</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--primary)]">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>

          <button
            type="button"
            className={`${previewSecondaryButtonClass} w-full justify-start px-4 py-4`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span className="font-medium text-[var(--ink)]">Continue with Google</span>
          </button>

          <button
            type="button"
            className={`${previewSecondaryButtonClass} w-full justify-start px-4 py-4`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            <span className="font-medium text-[var(--ink)]">Continue with Apple</span>
          </button>

          <button
            type="button"
            className={`${previewSecondaryButtonClass} w-full justify-start px-4 py-4`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
            <span className="font-medium text-[var(--ink)]">Continue with LinkedIn</span>
          </button>

          <div className="flex items-center gap-4 py-1">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span className="text-[11px] font-semibold tracking-[0.18em] text-[var(--muted)]">OR</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <motion.form
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="email"
                placeholder="Enter your email..."
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${previewInputClass} py-4 pl-12 pr-4`}
              />
            </div>

            <button type="submit" className={`${previewPrimaryButtonClass} flex w-full py-4`}>
              <span>{isSignin ? "Send sign in link" : "Send sign up link"}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </motion.form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="px-2 text-center text-sm text-[var(--ink-light)]"
        >
          {isSignin
            ? "Sign in with your email to keep daily notes, tasks, and activity snapshots in sync."
            : "Create an account to start saving your diary with the same calm layout used across the app."}
        </motion.p>

        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          onClick={onLogin}
          className="w-full py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink-light)]"
        >
          Skip login (Demo Mode)
        </motion.button>
      </motion.div>
    </div>
  );
}
