"use client";

import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Clock3, FileText, ListTodo, LayoutDashboard } from "lucide-react";

type TourTab = "activity" | "notes" | "todo" | "dashboard";

const STEPS: {
  tab: TourTab;
  Icon: typeof Clock3;
  color: string;
  bgColor: string;
  title: { en: string; ko: string };
  desc: { en: string; ko: string };
  tip: { en: string; ko: string };
}[] = [
  {
    tab: "activity",
    Icon: Clock3,
    color: "text-violet-500",
    bgColor: "bg-violet-50 dark:bg-violet-500/15",
    title: { en: "Activity Log", ko: "활동 기록" },
    desc: {
      en: "Tap any emoji to log how long you spent on it — coding, exercise, reading, or anything you do today.",
      ko: "이모지를 탭해 활동 시간을 기록하세요. 코딩, 운동, 독서 등 오늘 한 모든 활동을 담을 수 있어요.",
    },
    tip: {
      en: "Swipe left on an activity to remove it",
      ko: "항목을 왼쪽으로 스와이프하면 삭제할 수 있어요",
    },
  },
  {
    tab: "notes",
    Icon: FileText,
    color: "text-emerald-500",
    bgColor: "bg-emerald-50 dark:bg-emerald-500/15",
    title: { en: "Daily Notes", ko: "일일 노트" },
    desc: {
      en: "Capture your thoughts, reflections, or ideas for the day. Notes are stored separately for each date.",
      ko: "오늘의 생각, 아이디어, 회고를 자유롭게 적어보세요. 날짜마다 별도의 노트가 저장됩니다.",
    },
    tip: {
      en: "Tap the Save button below the text area to keep your note",
      ko: "텍스트 아래 저장 버튼을 눌러 기록을 남겨요",
    },
  },
  {
    tab: "todo",
    Icon: ListTodo,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-500/15",
    title: { en: "To-do List", ko: "할 일 목록" },
    desc: {
      en: "Add tasks and check them off as you complete them. Swipe right to mark as done, left to delete.",
      ko: "할 일을 추가하고 완료하면 체크하세요. 오른쪽 스와이프로 완료, 왼쪽 스와이프로 삭제할 수 있어요.",
    },
    tip: {
      en: "Use Repeat to schedule recurring tasks automatically",
      ko: "반복 설정으로 매주 반복되는 할 일을 자동 예약해요",
    },
  },
  {
    tab: "dashboard",
    Icon: LayoutDashboard,
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-500/15",
    title: { en: "Dashboard", ko: "대시보드" },
    desc: {
      en: "See your weekly and monthly activity summaries at a glance. Track how you spend your time over the long run.",
      ko: "주간·월간 활동을 한눈에 확인하세요. 내 시간이 어디에 쓰였는지 흐름을 파악할 수 있어요.",
    },
    tip: {
      en: "Toggle between Week and Month views at the top",
      ko: "상단에서 주간·월간 보기를 자유롭게 전환할 수 있어요",
    },
  },
];

const TAB_ORDER: TourTab[] = ["activity", "notes", "todo", "dashboard"];

const TAB_COMPACT_LABELS = {
  activity: { en: "Activity", ko: "활동" },
  notes:    { en: "Notes",    ko: "노트" },
  todo:     { en: "To-do",   ko: "할일" },
  dashboard:{ en: "Dash",    ko: "대시" },
};

type Props = {
  onComplete: () => void;
  onTabChange: (tab: TourTab) => void;
  appLanguage?: "en" | "ko";
};

export default function TabTour({ onComplete, onTabChange, appLanguage = "en" }: Props) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);

  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    onTabChange(STEPS[step].tab);
  }, [step, onTabChange]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const tabIdx = TAB_ORDER.indexOf(current.tab);
  const Icon = current.Icon;

  const goNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setAnimating(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setAnimating(false);
    }, 150);
  };

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-center justify-center px-5 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        onClick={onComplete}
      />

      {/* Main card */}
      <div
        className={`relative z-10 w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        {/* Top accent bar — color per tab */}
        <div
          className="h-1 w-full transition-all duration-500"
          style={{
            background: `linear-gradient(90deg, transparent ${step * 25}%, var(--primary) ${step * 25}%, var(--primary) ${(step + 1) * 25}%, transparent ${(step + 1) * 25}%)`,
          }}
        />

        {/* Skip button */}
        <button
          type="button"
          onClick={onComplete}
          className="absolute right-4 top-5 flex h-7 w-7 items-center justify-center rounded-full bg-black/8 text-[var(--muted)] transition-colors hover:bg-black/14 dark:bg-white/10 dark:hover:bg-white/18"
          aria-label={t("Skip tour", "둘러보기 건너뛰기")}
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 pt-5 pb-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? 22 : 6,
                height: 6,
                background:
                  i < step
                    ? "var(--primary)"
                    : i === step
                    ? "var(--primary)"
                    : "var(--border-strong)",
                opacity: i < step ? 0.4 : 1,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div
          className={`px-7 py-5 text-center transition-all duration-150 ${
            animating ? "opacity-0 scale-95" : "opacity-100 scale-100"
          }`}
        >
          {/* Icon badge */}
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${current.bgColor}`}
          >
            <Icon className={`h-8 w-8 ${current.color}`} />
          </div>

          {/* Step label */}
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">
            {t(`Step ${step + 1} of ${STEPS.length}`, `${step + 1} / ${STEPS.length}`)}
          </p>

          {/* Title */}
          <h3 className="text-[18px] font-bold leading-tight text-[var(--ink)]">
            {t(current.title.en, current.title.ko)}
          </h3>

          {/* Description */}
          <p className="mt-2.5 text-sm leading-6 text-[var(--muted)]">
            {t(current.desc.en, current.desc.ko)}
          </p>

          {/* Tip pill */}
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--bg-secondary)] px-3 py-2.5 text-left">
            <span className="mt-px shrink-0 text-sm">💡</span>
            <p className="text-[11px] leading-relaxed text-[var(--ink-light)]">
              {t(current.tip.en, current.tip.ko)}
            </p>
          </div>
        </div>

        {/* Mini tab bar preview — shows which tab is active */}
        <div className="mx-5 mb-4 grid grid-cols-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
          {TAB_ORDER.map((tab, i) => {
            const s = STEPS.find((x) => x.tab === tab)!;
            const StepIcon = s.Icon;
            const isActive = i === tabIdx;
            return (
              <div
                key={tab}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 transition-all duration-500 ${
                  isActive ? "bg-[var(--primary)] text-white" : "text-[var(--muted)]"
                }`}
              >
                <StepIcon className="h-3.5 w-3.5" strokeWidth={2} />
                <span className="text-[8.5px] font-semibold leading-none">
                  {t(
                    TAB_COMPACT_LABELS[tab].en,
                    TAB_COMPACT_LABELS[tab].ko
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div
          className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={onComplete}
            className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            {t("Skip", "건너뛰기")}
          </button>
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-1.5 rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--primary-hover)] active:scale-95"
          >
            {isLast ? t("Got it!", "완료!") : t("Next", "다음")}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Bottom nav highlight — glows over the active tab position */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0"
        style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div
          className="absolute bottom-[env(safe-area-inset-bottom,0px)] h-16 w-1/4 transition-all duration-500"
          style={{ left: `${tabIdx * 25}%` }}
        >
          <div className="absolute inset-x-1.5 inset-y-1 animate-pulse rounded-xl bg-white/20 ring-2 ring-white/60" />
        </div>
      </div>
    </div>
  );
}
