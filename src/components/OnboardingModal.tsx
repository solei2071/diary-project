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

type Step = {
  emoji: string;
  title: {
    en: string;
    ko: string;
  };
  description: {
    en: string;
    ko: string;
  };
  hint: {
    en: string;
    ko: string;
  };
};

const STEPS: Step[] = [
  {
    emoji: "✅",
    title: { en: "Track your tasks", ko: "할 일 관리" },
    description: {
      en: "Add daily to-dos and check them off as you go. Swipe left to delete, swipe right to complete.",
      ko: "매일 해야 할 일을 추가하고 체크해 주세요. 왼쪽으로 스와이프해 삭제하고, 오른쪽으로 스와이프해 완료할 수 있어요."
    },
    hint: { en: "Stay on top of your day", ko: "오늘 일정을 확실히 관리하세요" }
  },
  {
    emoji: "⏱",
    title: { en: "Log your activities", ko: "활동 기록" },
    description: {
      en: "Tap an emoji to log how much time you spent on it. Track coding 💻, workouts 🏋️, reading 📚, and more.",
      ko: "이모지를 탭해 활동 시간을 기록하세요. 코딩, 운동, 독서 등 일상의 활동을 모두 정리할 수 있어요."
    },
    hint: { en: "Know where your time goes", ko: "시간이 어디에 쓰였는지 확인하세요" }
  },
  {
    emoji: "📝",
    title: { en: "Reflect with notes", ko: "노트로 정리하기" },
    description: {
      en: "Write freely in the Notes section — daily reflections, ideas, or anything on your mind.",
      ko: "노트에 오늘의 생각, 아이디어, 회고를 자유롭게 기록하세요."
    },
    hint: { en: "Your thoughts, captured", ko: "생각을 빠르게 적어두는 습관" }
  },
  {
    emoji: "☁️",
    title: { en: "Sync across devices", ko: "기기 간 동기화" },
    description: {
      en: "Sign in with your email to save everything securely and access your diary from any device.",
      ko: "이메일로 로그인하면 안전하게 저장되고, 어느 기기에서든 일기를 이어서 볼 수 있어요."
    },
    hint: { en: "Your data, always with you", ko: "데이터는 언제나 당신과 함께" }
  }
];

type Props = {
  onComplete: () => void;
  onRequestSignIn: () => void;
  appLanguage?: "en" | "ko";
};

export default function OnboardingModal({ onComplete, onRequestSignIn, appLanguage = "en" }: Props) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);
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
              aria-label={isKorean ? `${i + 1}단계` : `Step ${i + 1}`}
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
            {isKorean ? current.hint.ko : current.hint.en}
          </span>

          {/* 제목 & 설명 */}
          <h2 className="mt-3 text-xl font-bold text-[var(--ink)]">{isKorean ? current.title.ko : current.title.en}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {isKorean ? current.description.ko : current.description.en}
          </p>
          {isLast ? (
            <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
              {t(
                "If you continue without sign-in, all local data is kept in this browser only and is not synced. You can delete it later from Privacy settings.",
                "로그인 없이 계속하면 모든 로컬 데이터는 이 브라우저에만 저장되며 동기화되지 않습니다. 나중에 개인정보에서 삭제할 수 있습니다."
              )}
            </p>
          ) : null}
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
                {t("Sign in to sync data", "동기화를 위해 로그인하기")}
              </button>
              <button
                type="button"
                onClick={handleComplete_last}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
              >
                {t("Continue without signing in", "로그인 없이 계속")}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-hover)]"
                  aria-label={t("Previous step", "이전 단계")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors"
              >
                {t("Next", "다음")}
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--ink)] px-2"
              >
                {t("Skip", "건너뛰기")}
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
