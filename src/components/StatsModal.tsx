/**
 * StatsModal — 활동 통계 & 분석 화면
 *
 * 표시 내용:
 * - 이번 주 일별 활동 시간 바 차트
 * - 이번 달 상위 활동 (이모지별 총 시간)
 * - 이번 달 활성 일수 & 총 기록 시간
 * - 할 일 완료율 (이번 달)
 * - 연속 기록 스트릭
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CheckCircle2, Flame, X, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

type DailyActivity = {
  activity_date: string;
  emoji: string;
  label: string | null;
  hours: number;
};

type DailyTodo = {
  due_date: string;
  done: boolean;
};

type Props = {
  session: Session | null;
  /** 현재 선택 날짜 (기준 월 계산용) */
  selectedDate: string;
  onClose: () => void;
};

/** YYYY-MM-DD → Date (로컬 기준) */
function parseLocalDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

/** Date → YYYY-MM-DD */
function toLocalDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 해당 월의 첫날 ~ 마지막날 */
function getMonthRange(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toLocalDateString(start), end: toLocalDateString(end) };
}

/** 해당 날짜가 속한 주 월~일 배열 */
function getWeekDates(date: Date): string[] {
  const dayOfWeek = date.getDay();
  const daysToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}

/** 시간 → "Xh Ym" 형식 */
function formatHours(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** 연속 스트릭 계산 (오늘 기준, 거꾸로) */
function calcStreak(activeDates: Set<string>, today: string): number {
  let streak = 0;
  let current = parseLocalDate(today);
  while (true) {
    const dateStr = toLocalDateString(current);
    if (!activeDates.has(dateStr)) break;
    streak++;
    current.setDate(current.getDate() - 1);
  }
  return streak;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StatsModal({ session, selectedDate, onClose }: Props) {
  const user = session?.user ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [monthActivities, setMonthActivities] = useState<DailyActivity[]>([]);
  const [monthTodos, setMonthTodos] = useState<DailyTodo[]>([]);
  const [streak, setStreak] = useState(0);

  const refDate = parseLocalDate(selectedDate);
  const today = toLocalDateString(new Date());
  const { start: monthStart, end: monthEnd } = getMonthRange(refDate);
  const weekDates = getWeekDates(refDate);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!user) {
        // 게스트: localStorage에서 읽기
        const rawActivities = localStorage.getItem("diary-draft-activities");
        const rawTodos = localStorage.getItem("diary-draft-todos");

        if (rawActivities) {
          const byDate = JSON.parse(rawActivities) as Record<string, DailyActivity[]>;
          const inMonth: DailyActivity[] = [];
          Object.entries(byDate).forEach(([date, items]) => {
            if (date >= monthStart && date <= monthEnd) {
              items.forEach((item) => inMonth.push({ ...item, activity_date: date }));
            }
          });
          setMonthActivities(inMonth);
        }

        if (rawTodos) {
          const byDate = JSON.parse(rawTodos) as Record<string, DailyTodo[]>;
          const inMonth: DailyTodo[] = [];
          Object.entries(byDate).forEach(([date, items]) => {
            if (date >= monthStart && date <= monthEnd) {
              items.forEach((item) => inMonth.push({ ...item, due_date: date }));
            }
          });
          setMonthTodos(inMonth);
        }
        return;
      }

      // 로그인: Supabase에서 읽기
      const [actRes, todoRes, streakActRes] = await Promise.all([
        supabase
          .from("daily_activities")
          .select("activity_date, emoji, label, hours")
          .eq("user_id", user.id)
          .gte("activity_date", monthStart)
          .lte("activity_date", monthEnd),
        supabase
          .from("todos")
          .select("due_date, done")
          .eq("user_id", user.id)
          .gte("due_date", monthStart)
          .lte("due_date", monthEnd),
        // 스트릭용: 최근 90일
        supabase
          .from("daily_activities")
          .select("activity_date")
          .eq("user_id", user.id)
          .gte("activity_date", toLocalDateString(new Date(new Date().setDate(new Date().getDate() - 90))))
          .lte("activity_date", today)
      ]);

      setMonthActivities((actRes.data ?? []) as DailyActivity[]);
      setMonthTodos((todoRes.data ?? []) as DailyTodo[]);

      // 스트릭 계산
      const activeDates = new Set<string>(
        (streakActRes.data ?? []).map((r) => (r as { activity_date: string }).activity_date)
      );
      setStreak(calcStreak(activeDates, today));
    } finally {
      setIsLoading(false);
    }
  }, [user, monthStart, monthEnd, today]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── 계산 ──

  // 이번 주 일별 시간
  const weekHours: Record<string, number> = {};
  weekDates.forEach((d) => { weekHours[d] = 0; });
  monthActivities.forEach((a) => {
    if (weekDates.includes(a.activity_date)) {
      weekHours[a.activity_date] = (weekHours[a.activity_date] ?? 0) + a.hours;
    }
  });
  const maxWeekHours = Math.max(...Object.values(weekHours), 1);

  // 이번 달 이모지별 총 시간 (상위 6개)
  const emojiTotals: Record<string, { hours: number; label: string }> = {};
  monthActivities.forEach((a) => {
    if (!emojiTotals[a.emoji]) {
      emojiTotals[a.emoji] = { hours: 0, label: a.label ?? "" };
    }
    emojiTotals[a.emoji].hours += a.hours;
  });
  const topActivities = Object.entries(emojiTotals)
    .sort((a, b) => b[1].hours - a[1].hours)
    .slice(0, 6);

  // 이번 달 총 시간 & 활성 일수
  const totalMonthHours = monthActivities.reduce((s, a) => s + a.hours, 0);
  const activeDaysSet = new Set(monthActivities.map((a) => a.activity_date));
  const activeDaysCount = activeDaysSet.size;

  // 할 일 완료율
  const totalTodos = monthTodos.length;
  const doneTodos = monthTodos.filter((t) => t.done).length;
  const completionRate = totalTodos > 0 ? Math.round((doneTodos / totalTodos) * 100) : null;

  const monthLabel = refDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="fade-up w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Stats</h2>
            <p className="text-xs text-[var(--muted)]">{monthLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
            aria-label="Close stats"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 65px)" }}>
          {isLoading ? (
            <p className="px-5 py-10 text-center text-xs text-[var(--muted)]">Loading stats…</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">

              {/* ── 요약 카드 4개 ── */}
              <div className="grid grid-cols-2 gap-3 px-5 py-5 sm:grid-cols-4">
                {/* 총 시간 */}
                <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3">
                  <span className="text-xl leading-none">⏱</span>
                  <p className="text-xl font-bold text-[var(--ink)]">{formatHours(totalMonthHours)}</p>
                  <p className="text-[10px] text-[var(--muted)]">Total hours</p>
                </div>
                {/* 활성 일수 */}
                <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3">
                  <Zap className="h-5 w-5 text-amber-500" />
                  <p className="text-xl font-bold text-[var(--ink)]">{activeDaysCount}</p>
                  <p className="text-[10px] text-[var(--muted)]">Active days</p>
                </div>
                {/* 스트릭 */}
                <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3">
                  <Flame className="h-5 w-5 text-orange-500" />
                  <p className="text-xl font-bold text-[var(--ink)]">{streak}</p>
                  <p className="text-[10px] text-[var(--muted)]">Day streak</p>
                </div>
                {/* 할 일 완료율 */}
                <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3">
                  <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
                  <p className="text-xl font-bold text-[var(--ink)]">
                    {completionRate !== null ? `${completionRate}%` : "—"}
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">Task done</p>
                </div>
              </div>

              {/* ── 이번 주 바 차트 ── */}
              <div className="px-5 py-5">
                <p className="mb-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">This week</p>
                <div className="flex items-end gap-1.5" style={{ height: 80 }}>
                  {weekDates.map((date, i) => {
                    const hours = weekHours[date] ?? 0;
                    const barHeight = maxWeekHours > 0 ? Math.max(2, (hours / maxWeekHours) * 72) : 2;
                    const isSelected = date === selectedDate;
                    const isToday = date === today;
                    return (
                      <div key={date} className="flex flex-1 flex-col items-center gap-1">
                        {hours > 0 && (
                          <span className="text-[9px] text-[var(--muted)]">{formatHours(hours)}</span>
                        )}
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: barHeight,
                            background: isSelected
                              ? "var(--primary)"
                              : isToday
                                ? "var(--primary)/60"
                                : "var(--border-strong)",
                            opacity: hours === 0 ? 0.25 : 1,
                          }}
                        />
                        <span className={`text-[9px] font-medium ${isSelected ? "text-[var(--primary)]" : isToday ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>
                          {WEEKDAY_LABELS[i]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── 이번 달 상위 활동 ── */}
              <div className="px-5 py-5">
                <p className="mb-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Top activities this month</p>
                {topActivities.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No activities logged yet this month</p>
                ) : (
                  <div className="space-y-2.5">
                    {topActivities.map(([emoji, { hours, label }]) => {
                      const pct = totalMonthHours > 0 ? (hours / totalMonthHours) * 100 : 0;
                      return (
                        <div key={emoji} className="flex items-center gap-3">
                          <span className="w-6 text-center text-xl leading-none">{emoji}</span>
                          <div className="flex-1 min-w-0">
                            {label && (
                              <p className="mb-0.5 truncate text-xs text-[var(--ink-light)]">{label}</p>
                            )}
                            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-strong)]">
                              <div
                                className="h-full rounded-full bg-[var(--primary)]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-[var(--ink)]">{formatHours(hours)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── 할 일 완료 현황 ── */}
              {totalTodos > 0 && (
                <div className="px-5 py-5">
                  <p className="mb-3 text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Task completion</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--border-strong)]">
                        <div
                          className="h-full rounded-full bg-[var(--success)] transition-all"
                          style={{ width: `${completionRate ?? 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-[var(--ink)]">
                      {doneTodos}/{totalTodos}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                    {doneTodos} completed · {totalTodos - doneTodos} remaining this month
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
