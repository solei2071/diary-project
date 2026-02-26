/**
 * OnboardingModal — 첫 방문자 앱 소개 화면
 *
 * - localStorage "diary-onboarding-done" 키로 완료 여부 관리
 * - 4단계 슬라이드: 할 일 → 활동 기록 → 노트 → 저장/동기화
 * - 마지막 단계에서 로그인 유도
 */
"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STORAGE_KEY = "diary-onboarding-done";

export function hasCompletedOnboarding(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return true;
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // no-op
  }
}

type Props = {
  onComplete: () => void;
  onRequestSignIn: () => void;
};

type Step = {
  emoji: string;
  title: string;
  description: string;
  hint: string;
};

const STEPS: Step[] = [
  {
    emoji: "✅",
    title: "Track your tasks",
    description: "Add daily to-dos and check them off as you go. Swipe left to delete, swipe right to complete.",
    hint: "Stay on top of your day"
  },
  {
    emoji: "⏱",
    title: "Log your activities",
    description: "Tap an emoji to log how much time you spent on it. Track coding 💻, workouts 🏋️, reading 📚, and more.",
    hint: "Know where your time goes"
  },
  {
    emoji: "📝",
    title: "Reflect with notes",
    description: "Write freely in the Notes section — daily reflections, ideas, or anything on your mind.",
    hint: "Your thoughts, captured"
  },
  {
    emoji: "☁️",
    title: "Sync across devices",
    description: "Sign in with your email to save everything securely and access your diary from any device.",
    hint: "Your data, always with you"
  }
];

export default function OnboardingModal({ onComplete, onRequestSignIn }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleNext = () => {
    if (isLast) {
      markOnboardingDone();
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    markOnboardingDone();
    onComplete();
  };

  const handleSignIn = () => {
    markOnboardingDone();
    onRequestSignIn();
    onComplete();
  };

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center px-4">
      <div className="fade-up w-full max-w-sm overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[var(--bg)] shadow-2xl border border-[var(--border)]">

        {/* 진행 표시 점 */}
        <div className="flex justify-center gap-1.5 pt-5 pb-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className="rounded-full transition-all"
              style={{
                width: i === step ? 20 : 6,
                height: 6,
                background: i === step ? "var(--primary)" : "var(--border-strong)"
              }}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* 콘텐츠 */}
        <div className="px-8 pb-6 pt-4 text-center">
          {/* 이모지 일러스트 */}
          <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-[var(--bg-secondary)] mx-auto border border-[var(--border)]">
            <span className="text-5xl leading-none" aria-hidden="true">{current.emoji}</span>
          </div>

          {/* 힌트 태그 */}
          <span className="inline-block rounded-full bg-[var(--primary)]/12 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)]">
            {current.hint}
          </span>

          {/* 제목 & 설명 */}
          <h2 className="mt-3 text-xl font-bold text-[var(--ink)]">{current.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{current.description}</p>
        </div>

        {/* 버튼 영역 */}
        <div className="border-t border-[var(--border)] px-6 py-4 space-y-2"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {isLast ? (
            <>
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors"
              >
                Sign in to sync data
              </button>
              <button
                type="button"
                onClick={handleComplete_last}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                Continue without signing in
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-hover)]"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2"
              >
                Skip
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function handleComplete_last() {
    markOnboardingDone();
    onComplete();
  }
}
