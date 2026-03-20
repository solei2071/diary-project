/**
 * OnboardingModal — 첫 방문자 앱 소개 화면
 *
 * - localStorage "diary-onboarding-done" 키로 완료 여부 관리
 * - 5단계 슬라이드: Home → Activity → Notes → To-do → Setting
 * - 실제 하단 5탭 구조와 Home 내부 Dashboard 진입 방식을 함께 소개
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  House,
  LayoutDashboard,
  ListTodo,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { markOnboardingDone } from "@/lib/onboarding";

type AppLanguage = "en" | "ko";
type StepId = "home" | "activity" | "notes" | "todo" | "settings";

type Step = {
  id: StepId;
  icon: typeof House;
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

type PreviewTab = {
  id: StepId;
  icon: typeof House;
  label: {
    en: string;
    ko: string;
  };
};

const PREVIEW_TABS: PreviewTab[] = [
  { id: "home", icon: House, label: { en: "Home", ko: "홈" } },
  { id: "activity", icon: Clock3, label: { en: "Activity", ko: "활동" } },
  { id: "notes", icon: FileText, label: { en: "Notes", ko: "노트" } },
  { id: "todo", icon: ListTodo, label: { en: "To-do", ko: "할 일" } },
  { id: "settings", icon: Settings, label: { en: "Setting", ko: "설정" } }
];

const STEPS: Step[] = [
  {
    id: "home",
    icon: House,
    title: { en: "Start from Home", ko: "시작은 Home에서" },
    description: {
      en: "The app opens on Home. See today's summary, monthly calendar, and jump into Dashboard from the Home screen.",
      ko: "앱은 Home에서 시작합니다. 오늘 요약과 월간 캘린더를 보고, Home 화면에서 바로 Dashboard로 들어갈 수 있습니다."
    },
    hint: { en: "Home is your daily hub", ko: "Home이 하루의 허브입니다" },
    eyebrow: { en: "Main landing", ko: "Main landing" },
    gradient: "from-sky-100 via-white to-indigo-50",
    accentClass: "text-sky-700",
    glowClass: "bg-sky-300/25"
  },
  {
    id: "activity",
    icon: Clock3,
    title: { en: "Log time in Activity", ko: "Activity에서 시간 기록" },
    description: {
      en: "Tap symbols, change time quickly, and keep a simple daily activity log without losing momentum.",
      ko: "심볼을 누르고 시간을 빠르게 조정하면서 흐름을 끊지 않고 활동 기록을 남길 수 있습니다."
    },
    hint: { en: "Fast enough for real life", ko: "실사용 속도로 바로 기록" },
    eyebrow: { en: "Live tracking", ko: "Live tracking" },
    gradient: "from-emerald-100 via-white to-teal-50",
    accentClass: "text-emerald-700",
    glowClass: "bg-emerald-300/25"
  },
  {
    id: "notes",
    icon: FileText,
    title: { en: "Keep thoughts in Notes", ko: "Notes에 생각 정리" },
    description: {
      en: "Write freely, let notes auto-save, and keep saved entries readable and easy to remove later.",
      ko: "자유롭게 쓰고 자동 저장된 노트를 쌓아 두세요. 저장된 내용은 다시 읽거나 지우기도 쉽습니다."
    },
    hint: { en: "Write first, organize later", ko: "먼저 쓰고 나중에 정리" },
    eyebrow: { en: "Quiet capture", ko: "Quiet capture" },
    gradient: "from-amber-100 via-white to-rose-50",
    accentClass: "text-amber-700",
    glowClass: "bg-amber-300/25"
  },
  {
    id: "todo",
    icon: ListTodo,
    title: { en: "Manage tasks in To-do", ko: "To-do로 할 일 관리" },
    description: {
      en: "Add tasks, check them off, and keep the day moving with a dedicated task view.",
      ko: "할 일을 추가하고 완료 처리하면서 전용 To-do 화면에서 하루의 실행 흐름을 유지할 수 있습니다."
    },
    hint: { en: "A clear list for the day", ko: "오늘 해야 할 일을 명확하게" },
    eyebrow: { en: "Action list", ko: "Action list" },
    gradient: "from-cyan-100 via-white to-slate-50",
    accentClass: "text-cyan-700",
    glowClass: "bg-cyan-300/25"
  },
  {
    id: "settings",
    icon: Settings,
    title: { en: "Control everything in Setting", ko: "Setting에서 전체 관리" },
    description: {
      en: "Appearance, security, notifications, sync, and account controls now live in the dedicated Setting tab.",
      ko: "Appearance, 보안, 알림, 동기화, 계정 설정은 이제 전용 Setting 탭에서 관리합니다."
    },
    hint: { en: "One place for setup", ko: "설정은 한 탭에서 정리" },
    eyebrow: { en: "Control center", ko: "Control center" },
    gradient: "from-violet-100 via-white to-fuchsia-50",
    accentClass: "text-violet-700",
    glowClass: "bg-violet-300/25"
  }
];

type Props = {
  onComplete: () => void;
  onRequestSignIn: () => void;
  appLanguage?: AppLanguage;
};

const useTranslate = (appLanguage: AppLanguage) =>
  useCallback((en: string, ko: string) => (appLanguage === "ko" ? ko : en), [appLanguage]);

export default function OnboardingModal({ onComplete, onRequestSignIn, appLanguage = "en" }: Props) {
  const t = useTranslate(appLanguage);
  const reduceMotion = useReducedMotion();
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

  const panelTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 280, damping: 26, mass: 0.9 } as const);

  const handlePreviewDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 60) return;
    if (info.offset.x < 0) {
      handleNext();
      return;
    }
    goToStep(step - 1);
  }, [goToStep, handleNext, step]);

  if (!current) return null;

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
                  <span>{t(current.eyebrow.en, current.eyebrow.ko)}</span>
                </div>
                <p className="mt-3 text-xs font-medium text-slate-500">
                  {t("Swipe or tap to explore the current app structure", "현재 앱 구조를 스와이프하거나 탭해서 살펴보기")}
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
              className="relative min-h-[310px]"
            >
              <AnimatePresence custom={direction} mode="wait" initial={false}>
                <motion.div
                  key={current.id}
                  custom={direction}
                  initial={reduceMotion ? false : { opacity: 0, x: direction > 0 ? 40 : -40, rotate: direction > 0 ? 1.2 : -1.2 }}
                  animate={{ opacity: 1, x: 0, rotate: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: direction > 0 ? -36 : 36, rotate: direction > 0 ? -0.8 : 0.8 }}
                  transition={panelTransition}
                >
                  <StepPreview step={current} appLanguage={appLanguage} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
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
                  aria-label={appLanguage === "ko" ? `${index + 1}단계` : `Step ${index + 1}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t(item.title.en, item.title.ko)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.45rem] font-black leading-tight text-[var(--ink)]">
              {t(current.title.en, current.title.ko)}
            </h2>
            <p className="shrink-0 text-[11px] font-semibold text-[var(--muted)]">
              {step + 1} / {STEPS.length}
            </p>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {t(current.description.en, current.description.ko)}
          </p>
          <div className="mt-3 inline-flex rounded-full bg-[var(--bg-secondary)] px-3 py-1 text-[11px] font-semibold text-[var(--primary)]">
            {t(current.hint.en, current.hint.ko)}
          </div>

          {isLast ? (
            <p className="mt-4 text-[11px] leading-5 text-[var(--muted)]">
              {t(
                "If you continue without sign-in, your data stays on this device only. You can sign in later from Setting.",
                "로그인 없이 계속하면 데이터는 이 기기에만 저장됩니다. 나중에 Setting 탭에서 로그인할 수 있습니다."
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

function StepPreview({ step, appLanguage }: { step: Step; appLanguage: AppLanguage }) {
  switch (step.id) {
    case "home":
      return <HomeStepPreview appLanguage={appLanguage} />;
    case "activity":
      return <ActivityStepPreview appLanguage={appLanguage} />;
    case "notes":
      return <NotesStepPreview appLanguage={appLanguage} />;
    case "todo":
      return <TodoStepPreview appLanguage={appLanguage} />;
    case "settings":
      return <SettingsStepPreview appLanguage={appLanguage} />;
    default:
      return null;
  }
}

function PreviewShell({
  activeTab,
  appLanguage,
  children
}: {
  activeTab: StepId;
  appLanguage: AppLanguage;
  children: React.ReactNode;
}) {
  const t = useTranslate(appLanguage);

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-white/75 bg-white/85 shadow-[0_16px_60px_rgba(148,163,184,0.18)] backdrop-blur">
      <div className="border-b border-slate-200/80 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between text-slate-400">
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {t("Daily Flow", "Daily Flow")}
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">3/8 (Sun)</p>
          </div>
          <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-[210px] bg-gradient-to-b from-white via-slate-50/80 to-slate-100/70 px-4 py-4">
        {children}
      </div>

      <div className="grid grid-cols-5 gap-1 border-t border-slate-200/80 bg-white px-2 py-2">
        {PREVIEW_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <div
              key={tab.id}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-center transition-colors ${
                isActive ? "bg-[var(--primary)]/10 text-[var(--primary)]" : "text-slate-400"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "scale-110" : ""}`} />
              <span className="text-[9px] font-semibold">
                {t(tab.label.en, tab.label.ko)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HomeStepPreview({ appLanguage }: { appLanguage: AppLanguage }) {
  const t = useTranslate(appLanguage);

  return (
    <PreviewShell activeTab="home" appLanguage={appLanguage}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniCard title={t("Today's activity summary", "오늘의 활동 요약")}>
            <p className="text-[11px] leading-5 text-slate-700">{t("No records yet", "아직 기록이 없습니다.")}</p>
          </MiniCard>
          <MiniCard title={t("Notes", "노트")}>
            <p className="text-[11px] leading-5 text-slate-700">{t("No notes yet.", "아직 노트가 없습니다.")}</p>
          </MiniCard>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500">March 2026</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {t("Calendar", "캘린더")}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-slate-400">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <span key={i}>{day}</span>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
            {["1", "2", "3", "4", "5", "6", "7"].map((day) => (
              <span key={day} className="py-1 text-slate-500">{day}</span>
            ))}
            <span className="rounded-full bg-slate-950 py-1 text-white">8</span>
            {["9", "10", "11", "12", "13", "14"].map((day) => (
              <span key={day} className="py-1 text-slate-500">{day}</span>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ scale: 0.98 }}
          animate={{ scale: [0.98, 1, 0.98], boxShadow: ["0 10px 24px rgba(59,130,246,0.12)", "0 16px 32px rgba(59,130,246,0.22)", "0 10px 24px rgba(59,130,246,0.12)"] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
          className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 text-white"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                {t("Home action", "Home action")}
              </p>
              <p className="mt-1 text-sm font-bold">
                {t("Dashboard opens from Home", "Dashboard는 Home에서 열립니다")}
              </p>
            </div>
            <LayoutDashboard className="h-5 w-5 shrink-0" />
          </div>
          <p className="mt-2 text-[11px] text-sky-100">DASHBOARD</p>
        </motion.div>
      </div>
    </PreviewShell>
  );
}

function ActivityStepPreview({ appLanguage }: { appLanguage: AppLanguage }) {
  const t = useTranslate(appLanguage);

  return (
    <PreviewShell activeTab="activity" appLanguage={appLanguage}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-900">{t("Activity", "활동")}</p>
          <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
            {t("30m step", "30분 단위")}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
          {t("Filter activity log", "활동 로그 필터")}
        </div>
        <div className="flex flex-wrap gap-2">
          {["💻", "🏃", "📚", "☕", "🧘"].map((emoji, index) => (
            <motion.div
              key={emoji}
              animate={index === 0 ? { y: [0, -4, 0] } : undefined}
              transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut", delay: index * 0.08 }}
              className={`rounded-2xl border px-3 py-2 text-lg ${
                index === 0 ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
              }`}
            >
              {emoji}
            </motion.div>
          ))}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-lg">💻</span>
            <span className="text-sm font-bold text-slate-900">2h</span>
            <div className="ml-auto rounded-xl border border-slate-200 px-2 py-1 text-[11px] text-slate-600">09:00</div>
            <span className="text-xs text-slate-400">-</span>
            <div className="rounded-xl border border-slate-200 px-2 py-1 text-[11px] text-slate-600">11:00</div>
          </div>
          <motion.p
            initial={{ opacity: 0.7 }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
            className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700"
          >
            {t("Focus work sprint", "집중 작업 스프린트")}
          </motion.p>
        </div>
      </div>
    </PreviewShell>
  );
}

function NotesStepPreview({ appLanguage }: { appLanguage: AppLanguage }) {
  const t = useTranslate(appLanguage);

  return (
    <PreviewShell activeTab="notes" appLanguage={appLanguage}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-900">{t("Notes", "노트")}</p>
          <div className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
            {t("Auto-saved", "자동 저장")}
          </div>
        </div>
        <div className="rounded-3xl border border-amber-100 bg-white p-3 shadow-sm">
          <div className="min-h-[92px] rounded-2xl bg-amber-50/70 px-3 py-3 text-[11px] leading-5 text-slate-600">
            {t(
              "Today felt calmer after simplifying the plan. Keep the evening open for reading.",
              "오늘은 계획을 단순하게 하니 훨씬 차분했다. 저녁은 독서 시간으로 비워두자."
            )}
          </div>
          <div className="mt-3 flex justify-between text-[10px] text-slate-400">
            <span>84 / 1,000</span>
            <span>{t("Saved note", "저장된 노트")}</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[11px] leading-5 text-slate-700">
            {t("Today felt calmer after simplifying the plan.", "오늘은 계획을 단순하게 하니 훨씬 차분했다.")}
          </p>
          <div className="mt-3 flex justify-end">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-500">
              {t("Delete", "삭제")}
            </div>
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function TodoStepPreview({ appLanguage }: { appLanguage: AppLanguage }) {
  const t = useTranslate(appLanguage);

  return (
    <PreviewShell activeTab="todo" appLanguage={appLanguage}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-900">{t("To-do", "할 일")}</p>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm text-white">+</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-400">
          {t("Add a task", "할 일을 입력하세요")}
        </div>
        <div className="space-y-2">
          <TodoPreviewRow label={t("Plan workout", "운동 계획 세우기")} done />
          <TodoPreviewRow label={t("Reply to messages", "메시지 답장하기")} />
          <TodoPreviewRow label={t("Review priorities", "우선순위 정리")} />
        </div>
      </div>
    </PreviewShell>
  );
}

function SettingsStepPreview({ appLanguage }: { appLanguage: AppLanguage }) {
  const t = useTranslate(appLanguage);

  return (
    <PreviewShell activeTab="settings" appLanguage={appLanguage}>
      <div className="space-y-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-900">{t("Setting", "설정")}</p>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700">
              {t("Control center", "관리 센터")}
            </span>
          </div>
          <div className="space-y-2">
            <SettingsPreviewRow
              icon={<Sparkles className="h-3.5 w-3.5 text-violet-600" />}
              title={t("Plan", "플랜")}
              subtitle={t("Upgrade or manage subscription", "업그레이드 및 구독 관리")}
            />
            <SettingsPreviewRow
              icon={<Palette className="h-3.5 w-3.5 text-sky-600" />}
              title={t("Appearance", "Appearance")}
              subtitle={t("Round, Clean, Bold fonts", "Round, Clean, Bold 폰트")}
            />
            <SettingsPreviewRow
              icon={<Bell className="h-3.5 w-3.5 text-amber-600" />}
              title={t("Notifications", "Notifications")}
              subtitle={t("Daily reminder settings", "일일 리마인더 설정")}
            />
            <SettingsPreviewRow
              icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
              title={t("Security", "Security")}
              subtitle={t("PIN, biometric, app lock", "PIN, 생체 인증, 앱 잠금")}
            />
          </div>
        </div>
      </div>
    </PreviewShell>
  );
}

function MiniCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-3 shadow-sm">
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{title}</p>
      {children}
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

function SettingsPreviewRow({
  icon,
  title,
  subtitle
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/85 px-3 py-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white shadow-sm">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-[11px] leading-5 text-slate-500">{subtitle}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-300" />
    </div>
  );
}
