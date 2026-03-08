/**
 * OnboardingModal — 첫 방문자 앱 소개 화면
 *
 * - localStorage "diary-onboarding-done" 키로 완료 여부 관리
 * - 3단계 슬라이드: 할 일 → 활동 기록 → 노트
 * - 마지막 단계에서 로그인 또는 바로 시작 선택
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  ListTodo,
  Sparkles
} from "lucide-react";
import { markOnboardingDone } from "@/lib/onboarding";

type Step = {
  id: "todo" | "activity" | "notes";
  icon: typeof ListTodo;
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
  eyebrow: {
    en: string;
    ko: string;
  };
  gradient: string;
  accentClass: string;
  glowClass: string;
};

const STEPS: Step[] = [
  {
    id: "todo",
    icon: ListTodo,
    title: { en: "Track your tasks", ko: "할 일 관리" },
    description: {
      en: "Add daily to-dos, finish them with a swipe, and keep the day moving without opening extra screens.",
      ko: "매일 해야 할 일을 빠르게 추가하고, 스와이프로 완료 처리하면서 흐름을 끊지 않고 하루를 관리하세요."
    },
    hint: { en: "Stay on top of your day", ko: "오늘의 흐름을 놓치지 않기" },
    eyebrow: { en: "Daily rhythm", ko: "Daily rhythm" },
    gradient: "from-sky-100 via-white to-cyan-50",
    accentClass: "text-sky-700",
    glowClass: "bg-sky-300/25"
  },
  {
    id: "activity",
    icon: Clock3,
    title: { en: "Log your activities", ko: "활동 기록" },
    description: {
      en: "Tap an emoji, adjust time, and see the day take shape. It is fast enough to use between real tasks.",
      ko: "이모지를 누르고 시간을 조정하면 하루가 바로 정리됩니다. 실제 일상 사이에서도 빠르게 기록할 수 있습니다."
    },
    hint: { en: "See where your time goes", ko: "시간의 흐름을 바로 파악하기" },
    eyebrow: { en: "Live tracking", ko: "Live tracking" },
    gradient: "from-emerald-100 via-white to-teal-50",
    accentClass: "text-emerald-700",
    glowClass: "bg-emerald-300/25"
  },
  {
    id: "notes",
    icon: FileText,
    title: { en: "Reflect with notes", ko: "노트로 정리하기" },
    description: {
      en: "Write thoughts while they are fresh. Notes stay lightweight, readable, and easy to revisit from home.",
      ko: "생각이 떠오른 순간 바로 적어두세요. 노트는 가볍고 읽기 쉬운 형태로 유지되어 홈에서 다시 보기 쉽습니다."
    },
    hint: { en: "Capture the day clearly", ko: "하루를 또렷하게 남기기" },
    eyebrow: { en: "Quiet reflection", ko: "Quiet reflection" },
    gradient: "from-amber-100 via-white to-rose-50",
    accentClass: "text-amber-700",
    glowClass: "bg-amber-300/25"
  }
];

type Props = {
  onComplete: () => void;
  onRequestSignIn: () => void;
  appLanguage?: "en" | "ko";
};

export default function OnboardingModal({ onComplete, onRequestSignIn, appLanguage = "en" }: Props) {
  const isKorean = appLanguage === "ko";
  const reduceMotion = useReducedMotion();
  const t = (en: string, ko: string) => (isKorean ? ko : en);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const completeOnboarding = useCallback(() => {
    markOnboardingDone();
    onComplete();
  }, [onComplete]);

  const goToStep = useCallback((nextStep: number) => {
    if (nextStep < 0 || nextStep >= STEPS.length || nextStep === step) return;
    setDirection(nextStep > step ? 1 : -1);
    setStep(nextStep);
  }, [step]);

  const handleNext = useCallback(() => {
    if (isLast) {
      completeOnboarding();
      return;
    }
    goToStep(step + 1);
  }, [completeOnboarding, goToStep, isLast, step]);

  const handleSignIn = useCallback(() => {
    markOnboardingDone();
    onRequestSignIn();
    onComplete();
  }, [onComplete, onRequestSignIn]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
      }
      if (event.key === "ArrowLeft" && step > 0) {
        event.preventDefault();
        goToStep(step - 1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        completeOnboarding();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [completeOnboarding, goToStep, handleNext, step]);

  if (!current) return null;

  const panelTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 280, damping: 26, mass: 0.9 } as const);

  const handlePreviewDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 60) return;
    if (info.offset.x < 0) {
      handleNext();
      return;
    }
    goToStep(step - 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 px-4 backdrop-blur-md sm:items-center">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
        transition={panelTransition}
        className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--bg)] shadow-[0_28px_90px_rgba(15,23,42,0.32)]"
      >
        <div className={`relative overflow-hidden border-b border-[var(--border)] bg-gradient-to-br ${current.gradient} px-5 pb-5 pt-5`}>
          <div className={`absolute -left-8 top-6 h-24 w-24 rounded-full blur-3xl ${current.glowClass}`} />
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-white/45 blur-3xl" />
          <div className="relative">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className={`inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/75 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${current.accentClass}`}>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isKorean ? current.eyebrow.ko : current.eyebrow.en}</span>
                </div>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {t("Swipe or tap to explore", "스와이프하거나 탭해서 살펴보기")}
                </p>
              </div>
              <button
                type="button"
                onClick={completeOnboarding}
                className="rounded-full border border-white/60 bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:text-slate-900"
              >
                {t("Skip", "건너뛰기")}
              </button>
            </div>

            <motion.div
              drag={reduceMotion ? false : "x"}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={handlePreviewDragEnd}
              className="relative min-h-[220px]"
            >
              <AnimatePresence custom={direction} mode="wait" initial={false}>
                <motion.div
                  key={current.id}
                  custom={direction}
                  initial={reduceMotion ? false : { opacity: 0, x: direction > 0 ? 40 : -40, rotate: direction > 0 ? 1.5 : -1.5 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: direction > 0 ? -36 : 36, rotate: direction > 0 ? -1 : 1 }}
                  transition={panelTransition}
                >
                  <StepPreview step={current} appLanguage={appLanguage} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {STEPS.map((item, index) => {
                const Icon = item.icon;
                const active = index === step;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goToStep(index)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                      active
                        ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                        : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"
                    }`}
                    aria-label={isKorean ? `${index + 1}단계` : `Step ${index + 1}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{index + 1}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-semibold text-[var(--muted)]">
              {step + 1} / {STEPS.length}
            </p>
          </div>

          <h2 className="text-[1.45rem] font-black leading-tight text-[var(--ink)]">
            {isKorean ? current.title.ko : current.title.en}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {isKorean ? current.description.ko : current.description.en}
          </p>
          <div className="mt-3 inline-flex rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-[11px] font-semibold text-[var(--primary)]">
            {isKorean ? current.hint.ko : current.hint.en}
          </div>

          {isLast ? (
            <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">
              {t(
                "If you continue without sign-in, your data stays on this device only. You can sign in later from Settings.",
                "로그인 없이 계속하면 데이터는 이 기기에만 저장됩니다. 나중에 설정에서 로그인할 수 있습니다."
              )}
            </p>
          ) : null}

          <div
            className="mt-5 space-y-2 border-t border-[var(--border)] pt-4"
            style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {isLast ? (
              <>
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t("Sign in to save securely", "안전하게 저장하려면 로그인")}</span>
                </button>
                <button
                  type="button"
                  onClick={completeOnboarding}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] py-3 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  {t("Continue without signing in", "로그인 없이 계속")}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => goToStep(step - 1)}
                  disabled={step === 0}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-35"
                  aria-label={t("Previous step", "이전 단계")}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[var(--primary)] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)]"
                >
                  <span>{t("Next", "다음")}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function StepPreview({ step, appLanguage }: { step: Step; appLanguage: "en" | "ko" }) {
  switch (step.id) {
    case "todo":
      return <TodoStepPreview appLanguage={appLanguage} />;
    case "activity":
      return <ActivityStepPreview appLanguage={appLanguage} />;
    case "notes":
      return <NotesStepPreview appLanguage={appLanguage} />;
    default:
      return null;
  }
}

function TodoStepPreview({ appLanguage }: { appLanguage: "en" | "ko" }) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);

  return (
    <div className="relative rounded-[1.75rem] border border-white/70 bg-white/80 p-4 shadow-[0_16px_60px_rgba(148,163,184,0.18)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-500">
            {t("Today", "Today")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{t("Morning checklist", "아침 체크리스트")}</p>
        </div>
        <motion.div
          initial={{ scale: 0.95, opacity: 0.6 }}
          animate={{ scale: [0.95, 1, 0.95], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
          className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700"
        >
          {t("Swipe done", "스와이프 완료")}
        </motion.div>
      </div>
      <div className="space-y-2.5">
        <TodoPreviewRow label={t("Review priorities", "우선순위 정리")} done />
        <TodoPreviewRow label={t("Plan workout", "운동 계획 세우기")} />
        <TodoPreviewRow label={t("Reply to messages", "메시지 답장하기")} />
      </div>
      <motion.div
        initial={{ x: -8, opacity: 0 }}
        animate={{ x: [0, 22, 0], opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
        className="pointer-events-none absolute bottom-4 right-5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white shadow-lg"
      >
        {t("Done", "완료")}
      </motion.div>
    </div>
  );
}

function TodoPreviewRow({ label, done = false }: { label: string; done?: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ x: done ? 10 : 0 }}
      transition={{ repeat: Infinity, repeatType: "reverse", duration: done ? 2.2 : 3.2, ease: "easeInOut" }}
      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${
        done
          ? "border-emerald-200 bg-emerald-50/80"
          : "border-slate-200 bg-white/90"
      }`}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${done ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"}`}>
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${done ? "text-emerald-800 line-through decoration-2" : "text-slate-700"}`}>
          {label}
        </p>
      </div>
    </motion.div>
  );
}

function ActivityStepPreview({ appLanguage }: { appLanguage: "en" | "ko" }) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);
  const chips = [
    { emoji: "💻", label: t("Deep work", "집중 작업"), width: "72%" },
    { emoji: "🏃", label: t("Workout", "운동"), width: "48%" },
    { emoji: "📚", label: t("Reading", "독서"), width: "36%" }
  ];

  return (
    <div className="grid gap-3">
      <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-4 shadow-[0_16px_60px_rgba(16,185,129,0.14)] backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
              {t("Live activity log", "실시간 활동 로그")}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{t("Tap a symbol and adjust time", "이모지를 누르고 시간을 조정하세요")}</p>
          </div>
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-2xl"
          >
            ⏱
          </motion.div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {["💻", "🏃", "📚", "☕"].map((emoji, index) => (
            <motion.button
              key={emoji}
              type="button"
              initial={false}
              animate={{
                y: index === 0 ? [0, -4, 0] : 0,
                boxShadow: index === 0 ? ["0 0 0 rgba(16,185,129,0)", "0 10px 24px rgba(16,185,129,0.25)", "0 0 0 rgba(16,185,129,0)"] : undefined
              }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut", delay: index * 0.12 }}
              className={`rounded-2xl border px-3 py-2 text-xl ${
                index === 0
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              {emoji}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-white/70 bg-slate-950 px-4 py-3 text-white shadow-[0_14px_36px_rgba(15,23,42,0.22)]">
        <div className="mb-2 flex items-center justify-between text-[11px] text-white/70">
          <span>{t("Today's flow", "오늘의 흐름")}</span>
          <span>{t("Auto summary", "자동 요약")}</span>
        </div>
        <div className="space-y-2">
          {chips.map((chip, index) => (
            <div key={chip.label}>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2">
                  <span className="text-base">{chip.emoji}</span>
                  <span>{chip.label}</span>
                </span>
                <span className="text-white/60">{index + 1}h</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: chip.width }}
                  transition={{ duration: 0.9, delay: 0.15 + index * 0.18, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-300"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotesStepPreview({ appLanguage }: { appLanguage: "en" | "ko" }) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);
  const lines = [
    t("Today felt calmer after I simplified the plan.", "오늘은 계획을 단순하게 하니 훨씬 차분했다."),
    t("The workout was short, but it reset my head.", "운동은 짧았지만 머리를 다시 정리해 줬다."),
    t("Keep the evening clear for reading.", "저녁은 독서 시간으로 비워두자.")
  ];

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white/85 p-4 shadow-[0_16px_60px_rgba(245,158,11,0.14)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-600">
            {t("Quick note", "빠른 노트")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{t("Write while the day is still fresh", "하루의 감각이 남아 있을 때 바로 기록")}</p>
        </div>
        <div className="rounded-2xl bg-amber-100 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
          {t("Auto-saved", "자동 저장")}
        </div>
      </div>
      <div className="rounded-[1.5rem] border border-amber-100 bg-gradient-to-b from-white to-amber-50/80 p-4">
        <div className="space-y-2">
          {lines.map((line, index) => (
            <motion.div
              key={line}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.16, duration: 0.45 }}
              className="overflow-hidden rounded-xl border border-amber-100/80 bg-white/90 px-3 py-2"
            >
              <p className="text-xs leading-5 text-slate-700">{line}</p>
            </motion.div>
          ))}
        </div>
        <motion.div
          initial={{ opacity: 0.4 }}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white"
        >
          <span>{t("Writing", "작성 중")}</span>
          <span className="h-2 w-1 rounded-full bg-white" />
        </motion.div>
      </div>
    </div>
  );
}
