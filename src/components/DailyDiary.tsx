/**
 * DailyDiary — 메인 다이어리 컴포넌트
 *
 * 기능 요약:
 * - 캘린더로 날짜 선택
 * - To-do (할 일 체크리스트)
 * - 활동 기록 (이모지 + 시간, 예: 💻 2h)
 * - 메모/회고 (일기)
 * - 비로그인: 로컬 draft만 저장, 저장 시 로그인 유도
 * - 로그인: Supabase에 영구 저장
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent, TouchEvent } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  Palette,
  Search,
  Settings,
  Trash2,
  ListTodo,
  LayoutDashboard
} from "lucide-react";
import { useToast } from "./Toast";
import type { Session } from "@supabase/supabase-js";
import type { DailyActivityRow, JournalRow } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
  loadUserSymbols,
  saveUserSymbols,
  getDefaultSymbols,
  type PlanFeatures,
  getPlanLimits,
  type UserSymbolPlan
} from "@/lib/user-symbols";
import type { UserSymbol } from "@/lib/user-symbols";
import SymbolPicker from "./SymbolPicker";
import SearchModal from "./SearchModal";
import StatsModal from "./StatsModal";

/** Date → YYYY-MM-DD (로컬 기준. toISOString은 UTC라 한국 등에서 하루 밀림) */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const initialDate = toLocalDateString(new Date());
const NOTE_CHAR_LIMIT = 2000;
const TODO_REPEAT_WEEKS = [1, 2, 3, 4, 5];
const TODO_REPEAT_DAY_LABELS = [
  { value: 1, en: "Mon", ko: "월" },
  { value: 2, en: "Tue", ko: "화" },
  { value: 3, en: "Wed", ko: "수" },
  { value: 4, en: "Thu", ko: "목" },
  { value: 5, en: "Fri", ko: "금" }
];
type AppLanguage = "en" | "ko";
const APP_LANGUAGE_STORAGE_KEY = "diary-language";

const resolveLanguageFromStorage = (appLanguage?: AppLanguage): AppLanguage => {
  if (appLanguage === "en" || appLanguage === "ko") return appLanguage;
  if (typeof window === "undefined") return "en";

  const storedLanguage = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  if (storedLanguage === "en" || storedLanguage === "ko") return storedLanguage;

  const docLanguage = typeof document !== "undefined" ? document.documentElement.lang : "";
  if (docLanguage.toLowerCase().startsWith("ko")) return "ko";

  return "en";
};

const localizeText = (appLanguage: AppLanguage, en: string, ko: string) =>
  appLanguage === "ko" ? ko : en;

const WEEK_DAYS_BY_LOCALE: Record<AppLanguage, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ko: ["일", "월", "화", "수", "목", "금", "토"]
};
const getLocale = (isKorean: boolean) => (isKorean ? "ko-KR" : "en-US");
const getWeekdayLabels = (isKorean: boolean) => (isKorean ? WEEK_DAYS_BY_LOCALE.ko : WEEK_DAYS_BY_LOCALE.en);

const getSafeSupabaseError = (message?: string | null, appLanguage?: AppLanguage) => {
  if (!message) return "";
  const locale = resolveLanguageFromStorage(appLanguage);
  const hasSchemaCachePrefix = message.includes("Could not find the table");
  const hasKnownTable =
    message.includes("public.daily_activities") ||
    message.includes("public.journal_entries") ||
    message.includes("public.todos");
  const inSchemaCache = message.includes("schema cache");
  if (hasSchemaCachePrefix && hasKnownTable && inSchemaCache) {
    return "";
  }

  const lower = message.toLowerCase();
  if (/duplicate key value/.test(lower) || /23505/.test(lower)) {
    return localizeText(locale, "This item already exists. Please check and try again.", "이미 저장된 항목입니다. 다시 확인해 주세요.");
  }

  if (
    /new row violates row-level security policy/.test(lower) ||
    /permission denied for relation/.test(lower) ||
    /insufficient privilege/i.test(lower) ||
    /not authorized/.test(lower) ||
    /forbidden/.test(lower)
  ) {
    return localizeText(
      locale,
      "You do not have permission for this action. Please re-login and try again.",
      "이 작업을 실행할 권한이 없습니다. 로그인 상태를 확인해 주세요."
    );
  }

  if (/invalid input syntax/.test(lower) || /invalid .*format/.test(lower) || /invalid time/.test(lower)) {
    return localizeText(locale, "Some input values are invalid. Please check and retry.", "일부 입력값이 올바르지 않습니다. 다시 확인해 주세요.");
  }

  if (/foreign key constraint/.test(lower)) {
    return localizeText(locale, "Referenced data is missing or deleted. Please refresh and try again.", "연결된 데이터가 없거나 삭제되었습니다. 다시 불러와서 시도해 주세요.");
  }

  if (
    /jwt expired/.test(lower) ||
    /invalid jwt/.test(lower) ||
    /not authenticated/.test(lower) ||
    /could not verify/.test(lower)
  ) {
    return localizeText(
      locale,
      "Your session is invalid. Please sign in again.",
      "세션이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요."
    );
  }

  if (/network/.test(lower) || /connection/.test(lower)) {
    return localizeText(locale, "Network is unstable. Please check your connection.", "네트워크 상태를 확인해 주세요.");
  }

  return localizeText(
    locale,
    "Unable to process the request. Please try again.",
    "요청을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
  );
};

const shouldIgnoreSupabaseSchemaError = (message?: string | null) => {
  return getSafeSupabaseError(message) === "";
};

/** 날짜 문자열을 읽기 쉬운 형식으로 변환 (예: 2/17 (Mon)) */
function prettyDateLabel(value: string, locale = "en-US") {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()} (${date.toLocaleDateString(locale, {
    weekday: "short"
  })})`;
}

/** 선택한 날짜가 속한 주의 7일 배열 (월~일 기준, YYYY-MM-DD[]) */
function getWeekRangeDates(value: string): string[] {
  const date = new Date(`${value}T00:00:00`);
  const dayOfWeek = date.getDay(); // 0=일, 1=월, ..., 6=토
  const daysToMonday = (dayOfWeek + 6) % 7; // 일→6, 월→0, 화→1, ..., 토→5
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}

/** 해당 월의 모든 날짜 배열 반환 (YYYY-MM-DD[]) — 대시보드 일별 행 렌더링용 */
function getMonthRangeDates(value: string) {
  const selected = new Date(`${value}T00:00:00`);
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const dayCount = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate(); // 해당 월 일수
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(monthStart.getTime());
    date.setDate(index + 1);
    return toLocalDateString(date);
  });
}

function normalizeMonthLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatWeekLabelBySelectedDate(value: string, locale = "en-US", isKorean = false) {
  const date = new Date(`${value}T00:00:00`);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "short"
  }).format(date);
  const dayOfMonth = date.getDate();
  const weekOfMonth = Math.floor((dayOfMonth - 1) / 7) + 1;
  return isKorean ? `${monthLabel} ${weekOfMonth}주차` : `${monthLabel} Week ${weekOfMonth}`;
}

const ACTIVITY_STEP_OPTIONS = [1, 5, 10, 15, 20, 30, 45, 60] as const;
type ActivityStepMinutes = (typeof ACTIVITY_STEP_OPTIONS)[number];
const ACTIVITY_STEP_STORAGE_KEY = "diary-activity-step-minutes";

// 기본 활동 이모지 — 빈 상태로 시작 (사용자가 직접 추가)

/** 캘린더 그리드용 날짜 배열 — 앞쪽 빈 칸(null) + 해당 월 일자들 (7열 그리드 맞추기) */
function getMonthDaysForCalendar(baseMonth: string) {
  const date = new Date(`${baseMonth}-01T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDate = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDate.getDay();
  const items = [];
  for (let i = 0; i < startOffset; i += 1) {
    items.push(null);
  }
  for (let day = 1; day <= lastDay; day += 1) {
    const current = new Date(year, month, day);
    items.push(toLocalDateString(current));
  }
  return items;
}

/** 월 이동 (diff: -1 이전 달, +1 다음 달) */
function shiftMonth(baseMonth: string, diff: number) {
  const date = new Date(`${baseMonth}-01T00:00:00`);
  date.setMonth(date.getMonth() + diff);
  return toLocalDateString(date);
}

function getMonthLabel(baseMonth: string, locale = "en-US") {
  const date = new Date(`${baseMonth}-01T00:00:00`);
  return date.toLocaleDateString(locale, {
    month: "long",
    year: "numeric"
  });
}

/** UI용 할 일 타입 (DB 컬럼과 거의 동일) */
type UiTodo = {
  id: string;
  due_date: string;
  title: string;
  done: boolean;
};

/** UI용 활동 타입 (이모지별 시간 합산된 형태) */
type UiActivity = {
  id?: string;
  emoji: string;
  label: string;
  hours: number;
  startTime?: string;
  endTime?: string;
};

type UiActivityDraft = {
  id: string;
  activity_date: string;
  emoji: string;
  label: string;
  hours: number;
  start_time?: string;
  end_time?: string;
};

type SyncScope = "journal" | "todo" | "activity";
type SyncConflictState = {
  scope: SyncScope;
  date: string;
};

type DiaryTab = "todo" | "activity" | "dashboard" | "notes";
type PdfRange = "day" | "week" | "month";

type Props = {
  session: Session | null;
  onRequestAuth: () => void; // 비로그인 시 저장 요청 시 부모가 로그인 모달 띄우도록 호출
  symbolPlan?: UserSymbolPlan;
  planFeatures?: PlanFeatures;
  appLanguage?: "en" | "ko";
};

/** 시간 값을 분 단위로 정규화 (0.0167h=1m) */
function normalizeHourInput(value: number) {
  const hours = Number(value);
  if (!Number.isFinite(hours)) return 0;
  const maxHours = 24;
  const minutes = Math.round(Math.min(maxHours * 60, Math.max(0, hours * 60)));
  return minutes / 60;
}

const trimActivityLabel = (value: string | undefined) => (value ?? "").trim();
const normalizeActivityLabelInput = (value: string | undefined) => {
  return (value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "");
};

const normalizeActivityHours = (value: number) => normalizeHourInput(value);

const normalizeClockValue = (value?: string) => {
  if (!value) return "00:00";
  const parts = value.trim().split(":");
  if (parts.length !== 2) return "00:00";
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "00:00";
  const normalizedHour = String(Math.max(0, Math.min(23, hour)).toString().padStart(2, "0"));
  const normalizedMinute = String(Math.max(0, Math.min(59, minute)).toString().padStart(2, "0"));
  return `${normalizedHour}:${normalizedMinute}`;
};

const formatStartTime = (value?: string) => normalizeClockValue(value);

const normalizeActivitySource = (row: DailyActivityRow): UiActivity => ({
  id: row.id,
  emoji: row.emoji ?? "",
  label: trimActivityLabel(row.label),
  hours: normalizeActivityHours(row.hours),
  startTime: normalizeClockValue(row.start_time),
  endTime: normalizeClockValue(row.end_time)
});

const pickLatestUpdatedAt = (rows: Array<{ updated_at?: string | null }>): string | null => {
  return rows.reduce<string | null>((acc, row) => {
    const next = row.updated_at;
    if (!next) return acc;
    if (!acc || next > acc) return next;
    return acc;
  }, null);
};

const buildSyncConflictMessage = (scope: SyncScope, dateLabel: string, isKorean: boolean) => {
  return isKorean
    ? scope === "journal"
      ? `${dateLabel}의 일기 노트가 다른 기기에서 변경되었습니다. 편집 전에 새로고침하세요.`
      : scope === "todo"
        ? `${dateLabel}의 할 일이 다른 기기에서 변경되었습니다. 편집 전에 새로고침하세요.`
        : `${dateLabel}의 활동이 다른 기기에서 변경되었습니다. 편집 전에 새로고침하세요.`
    : scope === "journal"
      ? `Journal notes changed on ${dateLabel} from another device. Please reload before editing.`
      : scope === "todo"
        ? `To-do changed on ${dateLabel} from another device. Please reload before editing.`
        : `Activity changed on ${dateLabel} from another device. Please reload before editing.`;
};

const sortTodosForDisplay = (items: UiTodo[]) =>
  [...items].sort((a, b) => {
    if (a.done !== b.done) {
      return a.done ? 1 : -1;
    }
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();
    if (aTitle !== bTitle) {
      return aTitle.localeCompare(bTitle);
    }
    return a.due_date.localeCompare(b.due_date);
  });

const normalizeDraftActivity = (row: UiActivityDraft): UiActivity => ({
  id: row.id,
  emoji: row.emoji ?? "",
  label: trimActivityLabel(row.label),
  hours: normalizeActivityHours(row.hours),
  startTime: normalizeClockValue(row.start_time),
  endTime: normalizeClockValue(row.end_time)
});

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** 자동 포맷 시간 입력 (HH:MM) — 숫자만 허용, 자동 ":" 삽입, 4자리 완성 시 다음 필드 이동 */
function TimeInput({ value, onCommit, onAutoAdvance, ariaLabel, dataField }: {
  value: string;
  onCommit: (n: string) => void;
  onAutoAdvance?: () => void;
  ariaLabel: string;
  dataField?: string;
}) {
  const [display, setDisplay] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);
  useEffect(() => { if (document.activeElement !== inputRef.current) setDisplay(value); }, [value]);
  const normalize = (raw: string): string => {
    const d = raw.replace(/[^\d]/g, "");
    if (d.length === 0) return "00:00";
    if (d.length <= 2) { const h = Math.min(23, parseInt(d, 10)); return `${String(h).padStart(2, "0")}:00`; }
    const h = Math.min(23, parseInt(d.slice(0, 2), 10));
    const mRaw = d.length === 3 ? d.slice(2) + "0" : d.slice(2, 4);
    const m = Math.min(59, parseInt(mRaw, 10));
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const handleChange = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, "").slice(0, 4);
    const fmt = digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
    setDisplay(fmt);
    if (digits.length === 4) {
      const n = normalize(fmt); setDisplay(n); onCommit(n); skipBlurRef.current = true;
      if (onAutoAdvance) setTimeout(() => onAutoAdvance(), 0);
      else setTimeout(() => inputRef.current?.blur(), 0);
    }
  };
  const handleBlur = () => {
    if (skipBlurRef.current) { skipBlurRef.current = false; return; }
    const n = normalize(display); setDisplay(n); onCommit(n);
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault(); const n = normalize(display); setDisplay(n); onCommit(n); skipBlurRef.current = true;
      if (onAutoAdvance) onAutoAdvance(); else inputRef.current?.blur();
    }
  };
  return (
    <input ref={inputRef} type="text" inputMode="numeric" value={display}
      onChange={(e) => handleChange(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown}
      onFocus={() => setTimeout(() => inputRef.current?.select(), 0)}
      data-diary-time-field={dataField}
      className="n-time-input shrink-0 rounded border border-[var(--border)] bg-transparent text-center text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      style={{ width: "5rem", height: "1.75rem", padding: "0 0.25rem" }}
      aria-label={ariaLabel} placeholder="00:00" maxLength={5} />
  );
}

/** 스와이프로 완료/삭제가 가능한 할 일 아이템
 * - 오른쪽 스와이프: 완료 토글 (초록)
 * - 왼쪽 스와이프: 삭제 (빨강)
 * - 마우스 호버: 삭제 버튼 노출
 */
type SwipeableTodoItemProps = {
  todo: UiTodo;
  onToggle: () => void;
  onDelete: () => void;
  onDeleteTodoLabel: string;
};

function SwipeableTodoItem({ todo, onToggle, onDelete, onDeleteTodoLabel }: SwipeableTodoItemProps) {
  const [swipeX, setSwipeX] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dirLocked = useRef<"h" | "v" | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const THRESHOLD = 72;

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    dirLocked.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;

    if (dirLocked.current === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        dirLocked.current = "h";
        // 가로 스와이프 감지 시 스크롤 즉시 차단
        if (contentRef.current) {
          contentRef.current.style.touchAction = "none";
        }
      } else if (Math.abs(dy) > 8) {
        dirLocked.current = "v";
        return;
      } else {
        return;
      }
    }

    if (dirLocked.current !== "h") return;
    setIsActive(true);
    setSwipeX(Math.max(-THRESHOLD * 1.4, Math.min(THRESHOLD * 1.4, dx)));
  };

  const handleTouchEnd = () => {
    if (contentRef.current) {
      contentRef.current.style.touchAction = "";
    }
    if (swipeX >= THRESHOLD) onToggle();
    else if (swipeX <= -THRESHOLD) onDelete();
    setSwipeX(0);
    setIsActive(false);
    touchStart.current = null;
    dirLocked.current = null;
  };

  const progress = Math.min(1, Math.abs(swipeX) / THRESHOLD);
  const isRight = swipeX > 8;
  const isLeft = swipeX < -8;

  return (
    <li className="group relative overflow-hidden border-b border-[var(--border)] last:border-b-0">
      {/* 스와이프 배경 레이어 */}
      {(isRight || isLeft) && (
        <div
          className="absolute inset-0 flex items-center px-4"
          style={{
            background: isRight ? "var(--success)" : "var(--danger)",
            justifyContent: isRight ? "flex-start" : "flex-end",
            opacity: progress,
          }}
          aria-hidden="true"
        >
          {isRight ? (
            <CheckCircle2 className="h-5 w-5 text-white" />
          ) : (
            <Trash2 className="h-5 w-5 text-white" />
          )}
        </div>
      )}

      {/* 콘텐츠 레이어 */}
      <div
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: isActive ? "none" : "transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)",
          position: "relative",
          zIndex: 1,
          touchAction: "pan-y",
        }}
        className="flex items-center gap-2 bg-[var(--bg)] px-3 py-3"
      >
        <label className="flex flex-1 cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={todo.done}
            onChange={onToggle}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          <span className={`text-sm leading-6 ${todo.done ? "text-[var(--muted)] line-through" : "text-[var(--ink)]"}`}>
            {todo.title}
          </span>
        </label>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="h-6 w-6 shrink-0 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--danger)]"
          aria-label={onDeleteTodoLabel}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export default function DailyDiary({
  session,
  onRequestAuth,
  symbolPlan: symbolPlanOverride,
  planFeatures: planFeaturesOverride,
  appLanguage = "en"
}: Props) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);
  const user = session?.user ?? null;
  const isGuest = !user;
  const { show: showToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [todos, setTodos] = useState<UiTodo[]>([]);
  const [activities, setActivities] = useState<UiActivity[]>([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(true);
  const [isTodoDirty, setIsTodoDirty] = useState(false);
  const [isJournalDirty, setIsJournalDirty] = useState(false);
  const [isActivityDirty, setIsActivityDirty] = useState(false);
  const [isSavingActivity, setIsSavingActivity] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [todoError, setTodoError] = useState("");
  const [journalError, setJournalError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [isAddingTodo, setIsAddingTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [draftTodosByDate, setDraftTodosByDate] = useState<Record<string, UiTodo[]>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("diary-draft-todos") : null;
      return raw ? (JSON.parse(raw) as Record<string, UiTodo[]>) : {};
    } catch { return {}; }
  });
  const [draftJournalByDate, setDraftJournalByDate] = useState<Record<string, string>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("diary-draft-journal") : null;
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const [draftActivitiesByDate, setDraftActivitiesByDate] = useState<Record<string, UiActivityDraft[]>>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("diary-draft-activities") : null;
      return raw ? (JSON.parse(raw) as Record<string, UiActivityDraft[]>) : {};
    } catch { return {}; }
  });
  const [monthActivitiesByDate, setMonthActivitiesByDate] = useState<Record<string, UiActivity[]>>({});
  const [monthJournalByDate, setMonthJournalByDate] = useState<Record<string, string>>({});
  const [monthLoading, setMonthLoading] = useState(true);
  const [monthError, setMonthError] = useState("");
  const [journalUpdatedAt, setJournalUpdatedAt] = useState<string | null>(null);
  const [todoUpdatedAt, setTodoUpdatedAt] = useState<string | null>(null);
  const [activityUpdatedAt, setActivityUpdatedAt] = useState<string | null>(null);
  const [activeDiaryTab, setActiveDiaryTab] = useState<DiaryTab>("todo");
  const [syncConflict, setSyncConflict] = useState<SyncConflictState | null>(null);
  const [customEmoji, setCustomEmoji] = useState("");
  const [customHours, setCustomHours] = useState("");
  const [customStartTime, setCustomStartTime] = useState("");
  const [activityLabelEditingByDate, setActivityLabelEditingByDate] = useState<Record<string, boolean>>({});
  const [todoRepeatDays, setTodoRepeatDays] = useState<number[]>([]);
  const [todoRepeatWeeks, setTodoRepeatWeeks] = useState<number>(TODO_REPEAT_WEEKS[1] ?? 1);
  const [isTodoRepeatSettingsOpen, setIsTodoRepeatSettingsOpen] = useState(false);
  const [activityConflictWarnings, setActivityConflictWarnings] = useState<Record<string, string>>({});
  const diaryTabs: { id: DiaryTab; label: string; icon: typeof ListTodo; compactLabel?: string }[] = useMemo(
    () => [
      { id: "activity", label: t("Activity", "활동"), compactLabel: t("activity", "활동"), icon: Clock3 },
      { id: "notes", label: t("Notes", "노트"), icon: FileText },
      { id: "todo", label: t("To-do", "할 일"), icon: ListTodo },
      { id: "dashboard", label: t("Dashboard", "대시보드"), compactLabel: t("dash", "대시"), icon: LayoutDashboard }
    ],
    [isKorean]
  );
  const activityListRef = useRef<HTMLDivElement | null>(null);
  const activityTrashRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingActivity, setIsDraggingActivity] = useState(false);
  const [isOverActivityTrash, setIsOverActivityTrash] = useState(false);
  const [activitySwipeXByEmoji, setActivitySwipeXByEmoji] = useState<Record<string, number>>({});
  const activitySwipeStartRef = useRef<{ emoji: string; x: number; y: number } | null>(null);
  const activitySwipeLockRef = useRef<"h" | "v" | null>(null);
  const todoInputRef = useRef<HTMLInputElement | null>(null);
  const journalDraftDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activityContextMenu, setActivityContextMenu] = useState<{
    x: number;
    y: number;
    activity: UiActivity;
  } | null>(null);
  const [activityStepMinutes, setActivityStepMinutes] = useState<ActivityStepMinutes>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(ACTIVITY_STEP_STORAGE_KEY) : null;
      const next = raw ? Number(raw) : null;
      if (next && ACTIVITY_STEP_OPTIONS.includes(next as ActivityStepMinutes)) {
        return next as ActivityStepMinutes;
      }
    } catch {
      // no-op
    }
    return 15;
  });
  const [isActivityStepPickerOpen, setIsActivityStepPickerOpen] = useState(false);
  const toggleSymbolPicker = useCallback(() => {
    setIsSymbolPickerOpen((prev) => !prev);
  }, []);
  const closeSymbolPicker = useCallback(() => {
    setIsSymbolPickerOpen(false);
  }, []);
  const [dashboardQuery, setDashboardQuery] = useState("");
  const [activityLogQuery, setActivityLogQuery] = useState("");
  const [userSymbols, setUserSymbols] = useState<UserSymbol[]>(getDefaultSymbols);
  const [isSymbolPickerOpen, setIsSymbolPickerOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [dashboardViewMode, setDashboardViewMode] = useState<"week" | "month">(() => {
    try {
      const v = typeof window !== "undefined" ? localStorage.getItem("diary-dashboard-view") : null;
      return v === "week" || v === "month" ? v : "month";
    } catch { return "month"; }
  });
  const shiftDateByDays = (value: string, dayOffset: number) => {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + dayOffset);
    return toLocalDateString(date);
  };
  const currentMonth = selectedDate.slice(0, 7);
  const today = toLocalDateString(new Date());
  const symbolPlan = symbolPlanOverride ?? "free";
  const planLimits = useMemo(
    () => planFeaturesOverride ?? getPlanLimits(symbolPlan),
    [symbolPlan, planFeaturesOverride]
  );
  const symbolLimit = planLimits.symbolLimit;
  const orderedUserSymbols = useMemo(
    () => [...userSymbols].sort((a, b) => a.order - b.order),
    [userSymbols]
  );
  const handleSymbolPickerSymbolsChange = useCallback((updated: UserSymbol[]) => {
    setUserSymbols(updated);
    saveUserSymbols(updated, symbolPlan, planLimits.symbolLimit);
  }, [symbolPlan, planLimits.symbolLimit]);
  const canSearchSummary = planLimits.canSearch;
  const hasAdvancedSummary = planLimits.canAdvancedSummary;
  const canTodoRepeat = planLimits.canTodoRepeat;
  const appLocale = getLocale(isKorean);
  const weekdayLabels = getWeekdayLabels(isKorean);
  const diaryTabOrder: DiaryTab[] = ["activity", "notes", "todo", "dashboard"];
  const [tabSwipeOffset, setTabSwipeOffset] = useState(0);
  const tabSwipeStartRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    isHorizontalSwipe: boolean;
  } | null>(null);
  const isTabSwipeTarget = (target: EventTarget | null) => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !el.closest(
      "input, textarea, button, select, option, [contenteditable='true'], .n-btn-primary, .n-btn-ghost, .n-input, .n-textarea"
    );
  };
  const handleTabSwipeStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    if (!isTabSwipeTarget(event.target)) return;
    const { clientX, clientY } = event.touches[0];
    tabSwipeStartRef.current = {
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      isHorizontalSwipe: false
    };
  };
  const handleTabSwipeMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const state = tabSwipeStartRef.current;
    if (!state) return;

    const { clientX, clientY } = event.touches[0];
    const deltaX = clientX - state.startX;
    const deltaY = clientY - state.startY;

    if (!state.isHorizontalSwipe) {
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      if (absDeltaX > 10 || absDeltaY > 10) {
        if (absDeltaX > absDeltaY) {
          state.isHorizontalSwipe = true;
        } else {
          tabSwipeStartRef.current = null;
          setTabSwipeOffset(0);
          return;
        }
      }
    }

    if (!state.isHorizontalSwipe) return;

    state.lastX = clientX;
    setTabSwipeOffset(Math.max(-96, Math.min(96, deltaX)));
  };
  const handleTabSwipeEnd = () => {
    const state = tabSwipeStartRef.current;
    tabSwipeStartRef.current = null;
    if (!state || !state.isHorizontalSwipe) {
      setTabSwipeOffset(0);
      return;
    }

    const deltaX = state.lastX - state.startX;
    const currentIndex = diaryTabOrder.indexOf(activeDiaryTab);
    if (currentIndex < 0) {
      setTabSwipeOffset(0);
      return;
    }
    const SWIPE_THRESHOLD = 48;

    if (Math.abs(deltaX) >= SWIPE_THRESHOLD) {
      if (deltaX < 0 && currentIndex < diaryTabOrder.length - 1) {
        setActiveDiaryTab(diaryTabOrder[currentIndex + 1]);
      } else if (deltaX > 0 && currentIndex > 0) {
        setActiveDiaryTab(diaryTabOrder[currentIndex - 1]);
      }
    }
    setTabSwipeOffset(0);
  };
  const selectedDateRef = useRef(selectedDate);
  const ACTIVITY_SWIPE_THRESHOLD = 84;
  const ACTIVITY_SWIPE_MAX = 120;
  const syncStateRef = useRef({
    todo: false,
    journal: false,
    activity: false
  });

  useEffect(() => {
    selectedDateRef.current = selectedDate;
    syncStateRef.current = {
      todo: isTodoDirty,
      journal: isJournalDirty,
      activity: isActivityDirty
    };
  }, [selectedDate, isTodoDirty, isJournalDirty, isActivityDirty]);

  useEffect(() => {
    const saved = loadUserSymbols(symbolPlan, planLimits.symbolLimit);
    const next = saved.length > 0 ? saved : getDefaultSymbols();
    setUserSymbols(next);
  }, [symbolPlan, planLimits.symbolLimit]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem("diary-activity-templates");
    } catch {
      // no-op
    }
  }, []);

  const calendarDays = useMemo(() => getMonthDaysForCalendar(currentMonth), [currentMonth]);

  const formatMinutesToClock = useCallback((minutes: number) => {
    const normalized = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = Math.floor(normalized / 60).toString().padStart(2, "0");
    const minute = (normalized % 60).toString().padStart(2, "0");
    return `${hour}:${minute}`;
  }, []);

  const parseClockTimeToMinutes = (value: string) => {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  };

  const parseActivityDurationInput = (value: string) => {
    const raw = value.trim();
    if (!raw) return null;

    const rangeMatch = raw.match(/^(\s*\d{1,2}:\d{2}\s*)[-–—]\s*(\s*\d{1,2}:\d{2}\s*)$/);
    if (rangeMatch) {
      const startMinutes = parseClockTimeToMinutes(rangeMatch[1]);
      const endMinutes = parseClockTimeToMinutes(rangeMatch[2]);
      if (startMinutes === null || endMinutes === null) return null;

      let durationMinutes = endMinutes - startMinutes;
      if (durationMinutes <= 0) {
        durationMinutes += 24 * 60;
      }

      return {
        hours: normalizeActivityHours(durationMinutes / 60),
        startTime: formatMinutesToClock(startMinutes),
        endTime: formatMinutesToClock(endMinutes)
      };
    }

    const minuteMatch = raw.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
    if (minuteMatch) {
      const hourValue = Number.parseInt(minuteMatch[1] ?? "0", 10);
      const minuteValue = Number.parseInt(minuteMatch[2] ?? "0", 10);
      if (Number.isNaN(hourValue) || Number.isNaN(minuteValue)) return null;
      const durationMinutes = hourValue * 60 + minuteValue;
      if (durationMinutes <= 0) return null;
      return { hours: normalizeActivityHours(durationMinutes / 60) };
    }

    const numberValue = Number.parseFloat(raw);
    if (!Number.isNaN(numberValue) && numberValue > 0) {
      return { hours: normalizeActivityHours(numberValue) };
    }

    return null;
  };

  const appendSymbolToTodo = (emoji: string) => {
    if (!isAddingTodo) {
      setIsAddingTodo(true);
      setNewTodoTitle(`${emoji} `);
    } else {
      setNewTodoTitle((prev) => (prev ? `${emoji} ${prev}` : `${emoji} `));
    }
    setTimeout(() => todoInputRef.current?.focus(), 0);
  };

  const formatHoursLabel = (hours: number) => {
    const minutes = Math.max(0, Math.round(hours * 60));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0 && m === 0) return isKorean ? "0분" : "0m";
    if (isKorean) {
      const hourText = h > 0 ? `${h}시간` : "";
      const minuteText = m > 0 ? `${m}분` : "";
      return `${hourText} ${minuteText}`.trim();
    }
    const hourText = h > 0 ? `${h}h` : "";
    const minuteText = m > 0 ? `${m}m` : "";
    return `${hourText}${hourText && minuteText ? "\u00A0" : ""}${minuteText}`.trim();
  };

  const calculateHoursFromRange = (startTime?: string, endTime?: string) => {
    const normalizedStart = startTime ? parseClockTimeToMinutes(formatStartTime(startTime)) : null;
    const normalizedEnd = endTime ? parseClockTimeToMinutes(formatStartTime(endTime)) : null;
    if (normalizedStart === null || normalizedEnd === null) {
      return null;
    }
    let durationMinutes = normalizedEnd - normalizedStart;
    if (durationMinutes <= 0) {
      durationMinutes += 24 * 60;
    }
    if (durationMinutes <= 0) return null;
    return normalizeActivityHours(durationMinutes / 60);
  };

  const calculateEndTimeFromHours = useCallback((startTime: string, hours: number) => {
    const normalizedStart = parseClockTimeToMinutes(formatStartTime(startTime));
    if (normalizedStart === null) {
      return undefined;
    }
    const totalMinutes = normalizedStart + Math.max(0, Math.round(hours * 60));
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    return formatMinutesToClock(normalizedMinutes);
  }, [formatMinutesToClock]);

  const getEffectiveEndTime = (activity: UiActivity) => {
    const normalizedStart = formatStartTime(activity.startTime ?? "00:00");
    const normalizedEnd = formatStartTime(activity.endTime ?? "00:00");
    const hasExplicitEnd = Boolean(activity.endTime && !(normalizedStart === "00:00" && normalizedEnd === "00:00"));
    if (hasExplicitEnd) return normalizedEnd;
    return calculateEndTimeFromHours(normalizedStart, activity.hours) ?? "00:00";
  };

  const hasExplicitTimeInput = (activity: UiActivity) => {
    const normalizedStart = formatStartTime(activity.startTime ?? "00:00");
    const normalizedEnd = formatStartTime(activity.endTime ?? "00:00");
    return normalizedStart !== "00:00" || normalizedEnd !== "00:00";
  };

  const formatActivityTimeWindow = (activity: UiActivity) => {
    const start = formatStartTime(activity.startTime ?? "00:00");
    const end = getEffectiveEndTime(activity);
    return end ? `${start} - ${end}` : start;
  };

  const buildTodoRepeatDates = (baseDate: string, repeatDays: number[], repeatWeekCount: number) => {
    if (!baseDate || !repeatDays.length) {
      return [baseDate];
    }

    const base = new Date(`${baseDate}T00:00:00`);
    const baseWeekday = base.getDay();
    const weekCount = TODO_REPEAT_WEEKS.includes(repeatWeekCount) ? repeatWeekCount : TODO_REPEAT_WEEKS[1] ?? 1;
    const days = [...new Set(repeatDays.filter((value) => value >= 0 && value <= 6))].sort((a, b) => a - b);
    const generated = new Set<string>();

    for (let weekOffset = 0; weekOffset < weekCount; weekOffset += 1) {
      days.forEach((targetWeekday) => {
        const dayOffset = targetWeekday - baseWeekday + weekOffset * 7;
        if (weekOffset === 0 && dayOffset < 0) {
          return;
        }
        const date = new Date(base);
        date.setDate(base.getDate() + dayOffset);
        generated.add(toLocalDateString(date));
      });
    }

    const nextDates = Array.from(generated).sort();
    return nextDates.length ? nextDates : [baseDate];
  };

const buildActivityConflictWarnings = useCallback((rows: UiActivity[], isKorean: boolean) => {
    type ActivityWindow = {
      start: number;
      end: number;
    };

    const getActivityWindows = (activity: UiActivity): ActivityWindow[] | null => {
      const start = parseClockTimeToMinutes(formatStartTime(activity.startTime));
      if (start === null) return null;

      const parsedHours = normalizeActivityHours(activity.hours);
      const hasExplicitEnd = Boolean(
        activity.endTime &&
          !(
            formatStartTime(activity.startTime ?? "00:00") === "00:00" &&
            formatStartTime(activity.endTime) === "00:00"
          )
      );
      const endCandidate = parseClockTimeToMinutes(
        hasExplicitEnd
          ? formatStartTime(activity.endTime ?? "00:00")
          : calculateEndTimeFromHours(formatStartTime(activity.startTime ?? "00:00"), parsedHours) ?? "00:00"
      );

      if (endCandidate === null || parsedHours <= 0) return null;
      const startMinutes = start;
      let endMinutes = endCandidate;
      if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
      }
      if (endMinutes <= startMinutes) {
        return null;
      }

      if (endMinutes <= 24 * 60) {
        return [{ start: startMinutes, end: endMinutes }];
      }
      return [
        { start: 0, end: endMinutes - 24 * 60 },
        { start: startMinutes, end: 24 * 60 }
      ];
    };

    const hasTimeWindowOverlap = (source: ActivityWindow[], target: ActivityWindow[]) => {
      return source.some((left) => target.some((right) => left.start < right.end && right.start < left.end));
    };

    const warnings: Record<string, string> = {};
    const windowsByEmoji = rows
      .filter((activity) => activity.hours > 0 && hasExplicitTimeInput(activity))
      .map((activity) => ({ activity, windows: getActivityWindows(activity) }))
      .filter((entry): entry is { activity: UiActivity; windows: ActivityWindow[] } => entry.windows !== null);
    if (windowsByEmoji.length < 2) {
      return warnings;
    }

    for (let i = 0; i < windowsByEmoji.length - 1; i += 1) {
      for (let j = i + 1; j < windowsByEmoji.length; j += 1) {
        const left = windowsByEmoji[i];
        const right = windowsByEmoji[j];
        if (!hasTimeWindowOverlap(left.windows, right.windows)) {
          continue;
        }
        const leftEmoji = left.activity.emoji;
        const rightEmoji = right.activity.emoji;
        if (!warnings[leftEmoji]) {
          warnings[leftEmoji] = isKorean
            ? `시간 구간이 ${rightEmoji}와 겹칩니다.`
            : `Time range overlaps with ${rightEmoji}`;
        }
        if (!warnings[rightEmoji]) {
          warnings[rightEmoji] = isKorean
            ? `시간 구간이 ${leftEmoji}와 겹칩니다.`
            : `Time range overlaps with ${leftEmoji}`;
        }
      }
    }

  return warnings;
  }, [calculateEndTimeFromHours]);

/** 같은 이모지의 여러 행을 합산해 하나의 UiActivity로 */
const normalizeActivities = (rows: DailyActivityRow[]) =>
    Object.values(
      rows.reduce<Record<string, UiActivity>>((acc, row) => {
      const next = normalizeActivitySource(row);
      if (!next.emoji) return acc;
      if (!acc[next.emoji]) {
        acc[next.emoji] = next;
        return acc;
      }

      const existing = acc[next.emoji];
      acc[next.emoji] = {
        ...existing,
        id: existing.id ?? next.id,
        label: existing.label || next.label,
        hours: normalizeActivityHours(existing.hours + next.hours),
        startTime: existing.startTime ?? next.startTime,
        endTime: existing.endTime ?? next.endTime
      };
      return acc;
    }, {})
  );

  /** 월별 활동을 날짜별로 그룹화 (대시보드용) */
const normalizeActivitiesByMonth = (rows: DailyActivityRow[]) => {
  const grouped = rows.reduce<Record<string, UiActivity[]>>((acc, row) => {
      const normalized = normalizeActivitySource(row);
      if (!normalized.emoji) return acc;
      const target = (acc[row.activity_date] ?? []);
      const merged = (() => {
        const key = normalized.emoji;
        const exists = target.find((item) => item.emoji === key);
        if (!exists) {
          return [
            ...target,
            {
              ...normalized,
              hours: normalizeActivityHours(normalized.hours)
            }
          ];
        }
        return target.map((item) =>
          item.emoji === key
            ? {
                ...item,
                id: item.id ?? normalized.id,
                hours: normalizeActivityHours(item.hours + normalized.hours),
                label: item.label || normalized.label,
                startTime: item.startTime ?? normalized.startTime,
                endTime: item.endTime ?? normalized.endTime
              }
            : item
        );
      })();
      acc[row.activity_date] = merged;
      return acc;
    }, {});
    return grouped;
  };

  const monthDays = useMemo(() => getMonthRangeDates(selectedDate), [selectedDate]);
  const weekRangeDates = useMemo(() => getWeekRangeDates(selectedDate), [selectedDate]);
  const displayedDays = dashboardViewMode === "week" ? weekRangeDates : monthDays;
  const displayedSummaryLabel = dashboardViewMode === "week" ? t("Weekly Summary", "주간 요약") : t("Monthly Summary", "월간 요약");
  const displayedSummaryEmptyText = dashboardViewMode === "week" ? t("No activity this week.", "이번 주 활동이 없습니다.") : t("No activity this month.", "이번 달 활동이 없습니다.");
  const weeklyRangeLabel = useMemo(() => {
    if (dashboardViewMode !== "week") return "";
    return formatWeekLabelBySelectedDate(selectedDate, appLocale, isKorean);
  }, [dashboardViewMode, selectedDate, appLocale, isKorean]);

  const monthlyRangeLabel = useMemo(() => {
    if (dashboardViewMode !== "month") return "";
    return new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString(appLocale, {
      month: "short",
      year: "numeric"
    });
  }, [dashboardViewMode, currentMonth]);
  const symbolLabelByEmoji = useMemo(() => {
    const map = new Map<string, string>();
    userSymbols.forEach((symbol) => {
      const label = trimActivityLabel(symbol.label);
      if (label) {
        map.set(symbol.emoji, label);
      }
    });
    return map;
  }, [userSymbols]);
  const summaryActivities = useMemo(
    () =>
      Object.entries(
        displayedDays.reduce<Record<string, { hours: number; label: string }>>((acc, day) => {
          const rowActivities = monthActivitiesByDate[day] ?? [];
          rowActivities.forEach((activity) => {
            const target = acc[activity.emoji] ?? {
              hours: 0,
              label: ""
            };
            const activityLabel = trimActivityLabel(activity.label);
            target.hours += Number(activity.hours) || 0;
            if (!target.label && activityLabel) {
              target.label = activityLabel;
            }
            acc[activity.emoji] = target;
          });
          Object.keys(acc).forEach((emoji) => {
            if (!acc[emoji].label) {
              acc[emoji].label = symbolLabelByEmoji.get(emoji) ?? "";
            }
          });
          return acc;
        }, {})
      )
        .map(([emoji, item]) => ({
          emoji,
          hours: Number(item.hours.toFixed(2)),
          label: item.label
        }))
        .sort((a, b) => b.hours - a.hours || a.emoji.localeCompare(b.emoji)),
      [displayedDays, monthActivitiesByDate, symbolLabelByEmoji]
  );
  const topThreeActivities = useMemo(
    () => summaryActivities.slice(0, 3),
    [summaryActivities]
  );

  const normalizedDashboardQuery = dashboardQuery.trim().toLowerCase();
  const filteredSummaryActivities = useMemo(
    () =>
      summaryActivities
        .filter((activity) => {
          if (!normalizedDashboardQuery) return true;
          const emoji = activity.emoji.toLowerCase();
          const label = activity.label.toLowerCase();
          return emoji.includes(normalizedDashboardQuery) || label.includes(normalizedDashboardQuery);
        })
        .slice(0, planLimits.topSummaryLimit),
    [summaryActivities, normalizedDashboardQuery, planLimits.topSummaryLimit]
  );
  const normalizedActivityLogQuery = activityLogQuery.trim().toLowerCase();
  const filteredActivities = useMemo(() => {
    if (!normalizedActivityLogQuery) return activities;
    return activities.filter((activity) => {
      const emoji = activity.emoji.toLowerCase();
      const label = trimActivityLabel(activity.label).toLowerCase();
      return emoji.includes(normalizedActivityLogQuery) || label.includes(normalizedActivityLogQuery);
    });
  }, [activities, normalizedActivityLogQuery]);

  const dashboardTotalHours = useMemo(
    () =>
      displayedDays.reduce((sum, day) => {
        const row = monthActivitiesByDate[day] ?? [];
        return row.reduce((acc, item) => acc + Number(item.hours || 0), sum);
      }, 0),
    [displayedDays, monthActivitiesByDate]
  );

  const dashboardActiveDays = useMemo(
    () =>
      displayedDays.reduce((sum, day) => {
        const hasActivity = (monthActivitiesByDate[day] ?? []).some((item) => item.hours > 0);
        return hasActivity ? sum + 1 : sum;
      }, 0),
    [displayedDays, monthActivitiesByDate]
  );

  const dashboardLongestStreak = useMemo(() => {
    let best = 0;
    let current = 0;
    displayedDays.forEach((day) => {
      const hasActivity = (monthActivitiesByDate[day] ?? []).some((item) => item.hours > 0);
      if (hasActivity) {
        current += 1;
        if (current > best) best = current;
      } else {
        current = 0;
      }
    });
    return best;
  }, [displayedDays, monthActivitiesByDate]);
  const dashboardRestDayRatio = useMemo(() => {
    if (!displayedDays.length) return 0;
    const restDays = displayedDays.length - dashboardActiveDays;
    return Math.round((restDays / displayedDays.length) * 100);
  }, [displayedDays.length, dashboardActiveDays]);

  /** 각 이모지별로 가장 많은 시간을 기록한 날 (M/D 형식) */
  const topDayByEmoji = useMemo(() => {
    const result: { emoji: string; date: string; hours: number }[] = [];
    const emojiSet = new Set<string>();
    displayedDays.forEach((day) => {
      (monthActivitiesByDate[day] ?? []).forEach((a) => emojiSet.add(a.emoji));
    });
    emojiSet.forEach((emoji) => {
      let bestDate = "";
      let bestHours = 0;
      displayedDays.forEach((day) => {
        const activities = monthActivitiesByDate[day] ?? [];
        const item = activities.find((a) => a.emoji === emoji);
        const hours = item ? Number(item.hours) || 0 : 0;
        if (hours > bestHours) {
          bestHours = hours;
          bestDate = day;
        }
      });
      if (bestDate && bestHours > 0) {
        result.push({ emoji, date: bestDate, hours: bestHours });
      }
    });
    return result.sort((a, b) => {
      const aIdx = summaryActivities.findIndex((s) => s.emoji === a.emoji);
      const bIdx = summaryActivities.findIndex((s) => s.emoji === b.emoji);
      return aIdx - bIdx;
    });
  }, [displayedDays, monthActivitiesByDate, summaryActivities]);

  const setDashboardViewModeAndSave = (mode: "week" | "month") => {
    setDashboardViewMode(mode);
    try { localStorage.setItem("diary-dashboard-view", mode); } catch { /* ignore */ }
  };

  const formatFlowActivityText = (items: UiActivity[]) => {
    if (!items.length) return isKorean ? "휴식" : "Rest";
      return items
      .filter((item) => item.hours > 0)
      .map((item) => `${item.emoji} ${formatHoursLabel(item.hours)} [${item.startTime ?? "00:00"}]`)
      .join(" ");
  };

  const splitMemoLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  const loadDataRef = useRef<(targetDate: string) => Promise<void>>(async () => {});
  const loadMonthFlowRef = useRef<(targetDate: string) => Promise<void>>(async () => {});

  const handleRemoteChange = useCallback(async (scope: SyncScope, changedDate: string) => {
    const isCurrentDate = changedDate === selectedDateRef.current;
    const isCurrentMonth = changedDate.slice(0, 7) === selectedDateRef.current.slice(0, 7);
    const reloadCurrentData = loadDataRef.current;
    const reloadMonthFlow = loadMonthFlowRef.current;

    if (!isCurrentDate) {
      if (isCurrentMonth) {
        await reloadMonthFlow(selectedDateRef.current);
      }
      return;
    }

    const dirty = scope === "journal" ? syncStateRef.current.journal : scope === "todo" ? syncStateRef.current.todo : syncStateRef.current.activity;
    if (!dirty) {
      await reloadCurrentData(selectedDateRef.current);
      await reloadMonthFlow(selectedDateRef.current);
      setSyncConflict(null);
      return;
    }

    setSyncConflict({ scope, date: changedDate });
  }, [selectedDateRef, syncStateRef]);

  const resolveSyncConflict = async () => {
    const targetDate = selectedDateRef.current;
    setSyncConflict(null);
    await loadDataRef.current(targetDate);
    await loadMonthFlowRef.current(targetDate);
    setSyncConflict(null);
  };

  const cancelSyncConflict = () => setSyncConflict(null);

  /** 선택한 날짜의 To-do, 일기, 활동 로드 (로그인 시 Supabase, 비로그인 시 draft) */
  const loadData = useCallback(async (targetDate: string) => {
    setTodoError("");
    setJournalError("");
    setActivityError("");
    setSyncConflict(null);

    if (!user) {
      setIsLoadingTodos(false);
      const seededTodos = draftTodosByDate[targetDate];
      const seededJournal = draftJournalByDate[targetDate];
      const seededActivities = draftActivitiesByDate[targetDate];

      setTodos(sortTodosForDisplay(seededTodos ?? []));
      setJournalText(seededJournal ?? "");
      if (seededActivities?.length) {
        setActivities(
          seededActivities
            .map(normalizeDraftActivity)
            .filter((item) => item.hours > 0)
        );
      } else {
        setActivities([]);
      }
      setIsTodoDirty(false);
      setIsJournalDirty(false);
      setIsActivityDirty(false);
      setJournalUpdatedAt(null);
      setTodoUpdatedAt(null);
      setActivityUpdatedAt(null);
      return;
    }

    setIsLoadingTodos(true);
    const [todoResponse, journalResponse, activityResponse] = await Promise.all([
      supabase
        .from("todos")
        .select("*")
        .eq("user_id", user.id)
        .eq("due_date", targetDate)
        .order("created_at", { ascending: false }),
      supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user.id)
        .eq("entry_date", targetDate)
        .maybeSingle(),
      supabase
        .from("daily_activities")
        .select("*")
        .eq("user_id", user.id)
        .eq("activity_date", targetDate)
        .order("created_at", { ascending: false })
    ]);

    setIsLoadingTodos(false);
    const localDraftJournal = draftJournalByDate[targetDate] ?? "";

    if (todoResponse.error) {
      setTodoError(getSafeSupabaseError(todoResponse.error.message));
      if (!shouldIgnoreSupabaseSchemaError(todoResponse.error.message)) {
        setTodos([]);
      }
      setTodoUpdatedAt(null);
    } else {
      setTodoUpdatedAt(pickLatestUpdatedAt((todoResponse.data ?? []) as Array<{ updated_at?: string | null }>));
      setTodos(
        sortTodosForDisplay(
          (todoResponse.data ?? []).map((item) => ({
          id: item.id,
          due_date: item.due_date,
          title: item.title,
          done: item.done
          }))
        )
      );
    }

    if (journalResponse.error) {
      setJournalError(getSafeSupabaseError(journalResponse.error.message));
      if (!shouldIgnoreSupabaseSchemaError(journalResponse.error.message)) {
        setJournalText(localDraftJournal);
      }
      setJournalUpdatedAt(null);
    } else if (journalResponse.data) {
      setJournalUpdatedAt((journalResponse.data as JournalRow).updated_at ?? null);
      const remoteContent = (journalResponse.data as JournalRow).content ?? "";
      setJournalText(localDraftJournal ? localDraftJournal : remoteContent);
    } else {
      setJournalUpdatedAt(null);
      setJournalText(localDraftJournal);
    }

    if (activityResponse.error) {
      setActivityError(getSafeSupabaseError(activityResponse.error.message));
      if (!shouldIgnoreSupabaseSchemaError(activityResponse.error.message)) {
        setActivities([]);
      }
      setActivityUpdatedAt(null);
    } else {
      setActivityUpdatedAt(pickLatestUpdatedAt((activityResponse.data ?? []) as Array<{ updated_at?: string | null }>));
      setActivities(normalizeActivities((activityResponse.data ?? []) as DailyActivityRow[]));
    }

    setIsTodoDirty(false);
    setIsJournalDirty(false);
    setIsActivityDirty(false);
  }, [
    user,
    draftTodosByDate,
    draftJournalByDate,
    draftActivitiesByDate
  ]);
  loadDataRef.current = loadData;

  /** 해당 월의 일별 활동/일기 요약 로드 (대시보드 리스트용) */
  const loadMonthFlow = useCallback(async (targetDate: string) => {
    setMonthLoading(true);
    setMonthError("");

    const firstDay = new Date(`${targetDate}T00:00:00`);
    const monthStart = toLocalDateString(new Date(firstDay.getFullYear(), firstDay.getMonth(), 1));
    const nextMonth = toLocalDateString(new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 1));

    if (!user) {
      const targetRange = getMonthRangeDates(targetDate);
      const activitiesByDate = Object.fromEntries(
        targetRange.map((day) => {
          const draftForDay = draftActivitiesByDate[day];
          return [
            day,
            draftForDay?.length
              ? draftForDay
                .map(normalizeDraftActivity)
                .filter((item) => item.hours > 0)
              : []
          ];
        })
      );
    const journalByDate = Object.fromEntries(
      targetRange.map((day) => {
        const draftMemo = draftJournalByDate[day];
        if (draftMemo !== undefined) return [day, draftMemo];
        return [day, ""];
      })
    );
      setMonthActivitiesByDate(activitiesByDate);
      setMonthJournalByDate(journalByDate);
      setMonthLoading(false);
      return;
    }

    const [journalResponse, activityResponse] = await Promise.all([
      supabase
        .from("journal_entries")
        .select("*")
        .eq("user_id", user.id)
        .gte("entry_date", monthStart)
        .lt("entry_date", nextMonth),
      supabase
        .from("daily_activities")
        .select("*")
        .eq("user_id", user.id)
        .gte("activity_date", monthStart)
        .lt("activity_date", nextMonth)
        .order("created_at", { ascending: true })
    ]);

    setMonthLoading(false);

    if (journalResponse.error || activityResponse.error) {
      const messages = [journalResponse.error?.message, activityResponse.error?.message]
        .map((item) => getSafeSupabaseError(item))
        .filter(Boolean)
        .join(" / ");
      setMonthError(messages);
    }

    const journalBuckets = Object.fromEntries(
      (journalResponse.data ?? []).map((item) => [item.entry_date, item.content ?? ""])
    );

    const normalizedMonthActivities = normalizeActivitiesByMonth((activityResponse.data ?? []) as DailyActivityRow[]);
    const dayKeys = getMonthRangeDates(targetDate);
    const monthActivities = Object.fromEntries(
      dayKeys.map((day) => [day, normalizedMonthActivities[day] ?? []])
    );
    const monthJournals = Object.fromEntries(dayKeys.map((day) => [day, journalBuckets[day] ?? ""]));

    setMonthActivitiesByDate(monthActivities);
    setMonthJournalByDate(monthJournals);
  }, [
    user,
    draftActivitiesByDate,
    draftJournalByDate
  ]);
  loadMonthFlowRef.current = loadMonthFlow;

  const hasSyncConflictForSave = useCallback(async (scope: SyncScope, targetDate: string) => {
    if (!user) return false;

    const expectedUpdatedAt =
      scope === "journal" ? journalUpdatedAt : scope === "todo" ? todoUpdatedAt : activityUpdatedAt;

    const latestUpdatedAt = await (async () => {
      if (scope === "journal") {
        const response = await supabase
          .from("journal_entries")
          .select("updated_at")
          .eq("user_id", user.id)
          .eq("entry_date", targetDate)
          .maybeSingle();

        if (response.error) {
          return {
            latestUpdatedAt: null as string | null,
            error: getSafeSupabaseError(response.error.message)
          };
        }

        return {
          latestUpdatedAt: (response.data as JournalRow | null)?.updated_at ?? null,
          error: null as string | null
        };
      }

      const response = await supabase
        .from(scope === "todo" ? "todos" : "daily_activities")
        .select("updated_at")
        .eq("user_id", user.id)
        .eq(scope === "todo" ? "due_date" : "activity_date", targetDate);

      if (response.error) {
        return {
          latestUpdatedAt: null as string | null,
          error: getSafeSupabaseError(response.error.message)
        };
      }

      return {
        latestUpdatedAt: pickLatestUpdatedAt((response.data ?? []) as Array<{ updated_at?: string | null }>),
        error: null as string | null
      };
    })();

    if (latestUpdatedAt.error) {
      if (scope === "journal") setJournalError(latestUpdatedAt.error);
      if (scope === "todo") setTodoError(latestUpdatedAt.error);
      if (scope === "activity") setActivityError(latestUpdatedAt.error);
      return true;
    }

    if (latestUpdatedAt.latestUpdatedAt !== expectedUpdatedAt) {
      setSyncConflict({ scope, date: targetDate });
      await loadData(targetDate);
      await loadMonthFlow(targetDate);
      return true;
    }

    return false;
  }, [
    user,
    journalUpdatedAt,
    todoUpdatedAt,
    activityUpdatedAt,
    loadData,
    loadMonthFlow
  ]);

  const updateDraftTodo = (items: UiTodo[]) => {
    setDraftTodosByDate((prev) => {
      const next = { ...prev, [selectedDate]: sortTodosForDisplay(items) };
      try {
        localStorage.setItem("diary-draft-todos", JSON.stringify(next));
      } catch (err) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
          console.warn("[Draft] localStorage quota exceeded — todo draft not saved");
          showToast(t("Storage full — draft not saved", "저장 공간 부족 — 임시저장 실패"), "error");
        }
      }
      return next;
    });
  };

  const updateDraftJournal = useCallback((text: string) => {
    setDraftJournalByDate((prev) => {
      const next = { ...prev, [selectedDate]: text };
      try {
        localStorage.setItem("diary-draft-journal", JSON.stringify(next));
      } catch (err) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
          console.warn("[Draft] localStorage quota exceeded — journal draft not saved");
          showToast(t("Storage full — draft not saved", "저장 공간 부족 — 임시저장 실패"), "error");
        }
      }
      return next;
    });
  }, [selectedDate]);

  const updateDraftActivities = (items: UiActivity[]) => {
    setDraftActivitiesByDate((prev) => {
      const mapped = items
        .filter((item) => normalizeActivityHours(item.hours) > 0)
        .map((item) => ({
        id: item.id ?? makeLocalTodoId(),
        activity_date: selectedDate,
        emoji: item.emoji,
        label: trimActivityLabel(item.label),
        hours: normalizeActivityHours(item.hours),
        start_time: formatStartTime(item.startTime),
        end_time: formatStartTime(item.endTime)
      }));
      const next = { ...prev, [selectedDate]: mapped };
      try {
        localStorage.setItem("diary-draft-activities", JSON.stringify(next));
      } catch (err) {
        if (err instanceof DOMException && err.name === "QuotaExceededError") {
          console.warn("[Draft] localStorage quota exceeded — activity draft not saved");
          showToast(t("Storage full — draft not saved", "저장 공간 부족 — 임시저장 실패"), "error");
        }
      }
      return next;
    });
  };

  useEffect(() => {
    void loadData(selectedDate);
    void loadMonthFlow(selectedDate);
  }, [selectedDate, loadData, loadMonthFlow]); // user/드래프트 변경 시 함수가 바뀌면 자동 반영

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`diary-sync-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "journal_entries",
          filter: `user_id=eq.${user.id}`
        },
        (payload: { new: unknown; old: unknown }) => {
          const row = (payload.new as Partial<JournalRow>) || (payload.old as Partial<JournalRow>) || null;
          const changedDate = row?.entry_date;
          if (!changedDate) return;
          void handleRemoteChange("journal", changedDate);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "todos",
          filter: `user_id=eq.${user.id}`
        },
        (payload: { new: unknown; old: unknown }) => {
          const row = (payload.new as Partial<UiTodo>) || (payload.old as Partial<UiTodo>) || null;
          const changedDate = row?.due_date;
          if (!changedDate) return;
          void handleRemoteChange("todo", changedDate);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "daily_activities",
          filter: `user_id=eq.${user.id}`
        },
        (payload: { new: unknown; old: unknown }) => {
          const row = (payload.new as Partial<DailyActivityRow>) || (payload.old as Partial<DailyActivityRow>) || null;
          const changedDate = row?.activity_date;
          if (!changedDate) return;
          void handleRemoteChange("activity", changedDate);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, handleRemoteChange]);

  const makeLocalTodoId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as Crypto).randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  };

/** 할 일 체크/해제 토글 (Optimistic UI: 즉시 반영 후 에러 시 롤백) */
  const toggleTodo = async (todo: UiTodo) => {
    // 학습 포인트:
    // 1) UI는 즉시 변경(낙관적 업데이트)하고,
    // 2) 서버 저장 실패 시 이전 상태로 복구한다.
    // 3) 인증 사용자에서는 id/user_id 둘 다 조건으로 업데이트해 소유권 위조를 방어한다.
    const optimistic = todos.map((item) => (item.id === todo.id ? { ...item, done: !item.done } : item));
    setTodos(sortTodosForDisplay(optimistic));
    setTodoError("");
    setIsTodoDirty(true);

    if (await hasSyncConflictForSave("todo", selectedDate)) {
      return;
    }

    if (!user) {
      updateDraftTodo(optimistic);
      setIsTodoDirty(false);
      return;
    }

    const { error } = await supabase
      .from("todos")
      .update({ done: !todo.done })
      .eq("id", todo.id)
      .eq("user_id", user.id);

    if (error) {
      if (!shouldIgnoreSupabaseSchemaError(error.message)) {
        setTodos(sortTodosForDisplay(todos)); // 롤백
      }
      setTodoError(getSafeSupabaseError(error.message));
      setIsTodoDirty(false);
      return;
    }
    setIsTodoDirty(false);
  };

/** 할 일 삭제 (Optimistic UI + Undo 지원) */
  const deleteTodo = async (todo: UiTodo) => {
    // 학습 포인트:
    // 삭제도 낙관적 업데이트 + Undo(복구)을 붙였지만,
    // 실제 delete 쿼리는 id 만으로 제거하지 않고 user_id를 같이 검사한다.
    const prev = [...todos];
    const updated = todos.filter((t) => t.id !== todo.id);
    setTodos(updated);

    showToast(t("Task deleted", "할 일 삭제"), "info", {
      undoLabel: t("Undo", "실행 취소"),
      onUndo: () => {
        setTodos(sortTodosForDisplay([...updated, todo]));
        if (user) {
          void supabase.from("todos").insert({
            id: todo.id,
            user_id: user.id,
            due_date: todo.due_date,
            title: todo.title,
            done: todo.done
          });
        } else {
          updateDraftTodo([...updated, todo]);
        }
      }
    });

    if (user) {
      const { error } = await supabase
        .from("todos")
        .delete()
        .eq("id", todo.id)
        // [보안] 현재 로그인 사용자(user.id) 소유 데이터만 삭제되도록 추가 제한
        .eq("user_id", user.id);
      if (error) {
        if (!shouldIgnoreSupabaseSchemaError(error.message)) {
          setTodos(sortTodosForDisplay(prev));
          setTodoError(getSafeSupabaseError(error.message));
        }
      }
    } else {
      updateDraftTodo(updated);
    }
  };

  /** 새 To-do 즉시 추가 */
  const toggleTodoRepeatDay = (dayValue: number) => {
    if (!canTodoRepeat) return;
    setTodoRepeatDays((prev) => {
      const exists = prev.includes(dayValue);
      const next = exists ? prev.filter((value) => value !== dayValue) : [...prev, dayValue];
      return next.sort((a, b) => a - b);
    });
  };

  const addTodo = async () => {
    const title = newTodoTitle.trim();
    if (!title) {
      setTodoError(t("Please enter a task.", "할 일을 입력해 주세요."));
      return;
    }
    setTodoError("");
    const normalizedRepeatWeeks = TODO_REPEAT_WEEKS.includes(todoRepeatWeeks) ? todoRepeatWeeks : TODO_REPEAT_WEEKS[1] ?? 1;
    const repeatDays = canTodoRepeat ? todoRepeatDays : [];
    const repeatDates = repeatDays.length > 0
      ? buildTodoRepeatDates(selectedDate, repeatDays, normalizedRepeatWeeks)
      : [selectedDate];

    const currentSelectedTasks = sortTodosForDisplay(todos);
    const baseTodo: UiTodo = {
      id: makeLocalTodoId(),
      due_date: selectedDate,
      title,
      done: false
    };
    const nextTodos = currentSelectedTasks.some((item) => item.title === title)
      ? currentSelectedTasks
      : sortTodosForDisplay([baseTodo, ...currentSelectedTasks]);
    setTodos(nextTodos);
    setNewTodoTitle("");
    setIsAddingTodo(false);
    setIsTodoRepeatSettingsOpen(false);
    setIsTodoDirty(true);
    showToast(t("Task added", "할 일이 추가되었습니다"), "success");

    if (isGuest) {
      const nextDraft = { ...draftTodosByDate };
      const uniqueDates = Array.from(new Set(repeatDates)).sort();
      uniqueDates.forEach((date) => {
        const nextDateTaskId = makeLocalTodoId();
        const currentList = [...(nextDraft[date] ?? [])];
        const exists = currentList.some((item) => item.title === title);
        if (!exists) {
          currentList.unshift({
            id: nextDateTaskId,
            due_date: date,
            title,
            done: false
          });
        }
        nextDraft[date] = sortTodosForDisplay(currentList);
      });

      setDraftTodosByDate(nextDraft);
      try { localStorage.setItem("diary-draft-todos", JSON.stringify(nextDraft)); } catch { /* no-op */ }
      setTodos(nextDraft[selectedDate] ?? []);
      setIsTodoDirty(false);
      return;
    }

    if (repeatDates.length > 1) {
      const conflict = await hasSyncConflictForSave("todo", selectedDate);
      if (conflict) {
        setIsTodoDirty(false);
        return;
      }

      const existingByDate = new Map<string, Set<string>>();
      const { data: existingRows, error: existingError } = await supabase
        .from("todos")
        .select("due_date,title")
        .eq("user_id", user.id)
        .in("due_date", repeatDates);

      if (existingError) {
        setTodoError(getSafeSupabaseError(existingError.message));
        await loadData(selectedDate);
        setIsTodoDirty(false);
        return;
      }

      (existingRows ?? []).forEach((row) => {
        const bucket = existingByDate.get(row.due_date) ?? new Set<string>();
        bucket.add(row.title);
        existingByDate.set(row.due_date, bucket);
      });

      const uniqueDates = Array.from(new Set(repeatDates));
      const rowsToInsert = uniqueDates
        .filter((date) => !((existingByDate.get(date) ?? new Set<string>()).has(title)))
        .map((date) => ({
          user_id: user.id,
          due_date: date,
          title,
          done: false
        }));

      if (rowsToInsert.length === 0) {
        setTodoError("");
        setIsTodoDirty(false);
        await loadMonthFlow(selectedDate);
        return;
      }

      const { error } = await supabase.from("todos").insert(rowsToInsert);
      if (error) {
        setTodoError(getSafeSupabaseError(error.message));
        await loadData(selectedDate);
        setIsTodoDirty(false);
        return;
      }

      setIsTodoDirty(false);
      await loadData(selectedDate);
      await loadMonthFlow(selectedDate);
      return;
    }

    const hasConflict = await hasSyncConflictForSave("todo", selectedDate);
    if (hasConflict) {
      setIsTodoDirty(false);
      return;
    }

    const { error } = await supabase.from("todos").insert({
      user_id: user.id,
      due_date: selectedDate,
      title,
      done: false
    });
    if (error) {
      setTodoError(getSafeSupabaseError(error.message));
      await loadData(selectedDate);
      await loadMonthFlow(selectedDate);
      setIsTodoDirty(false);
      return;
    }
    setIsTodoDirty(false);
    await loadData(selectedDate);
    await loadMonthFlow(selectedDate);
    return;
  };

  const composeUpdatedActivities = (
    emoji: string,
    nextHours: number,
    nextLabel?: string,
    nextStartTime?: string,
    nextEndTime?: string
  ) => {
    const hours = normalizeActivityHours(nextHours);
    const cleanLabel = trimActivityLabel(nextLabel);
    const existing = activities.find((item) => item.emoji === emoji);
    if (hours <= 0) {
      return activities.filter((item) => item.emoji !== emoji);
    }
    if (existing) {
      return activities.map((item) =>
        item.emoji === emoji
          ? {
              ...item,
              hours,
              label: nextLabel !== undefined ? cleanLabel : item.label,
              startTime: nextStartTime !== undefined ? formatStartTime(nextStartTime) : item.startTime,
              endTime: nextEndTime !== undefined ? formatStartTime(nextEndTime) : item.endTime
            }
          : item
      );
    }
    return [
      {
        id: makeLocalTodoId(),
        emoji,
        label: cleanLabel,
        startTime: formatStartTime(nextStartTime),
        endTime: formatStartTime(nextEndTime),
        hours
      },
      ...activities
    ];
  };

  const saveActivity = async (
    emoji: string,
    nextHours: number,
    nextLabel: string,
    nextStartTime: string,
    nextEndTime?: string
  ) => {
    if (!user) return;
    setIsActivityDirty(true);
    setIsSavingActivity(true);

    const hasConflict = await hasSyncConflictForSave("activity", selectedDate);
    if (hasConflict) {
      setIsSavingActivity(false);
      return;
    }

    const hours = normalizeActivityHours(nextHours);
    const label = trimActivityLabel(nextLabel);
    const startTime = formatStartTime(nextStartTime);
    const endTime = formatStartTime(nextEndTime);

    if (hours <= 0) {
      const { error } = await supabase.from("daily_activities").delete().eq("user_id", user.id).eq("activity_date", selectedDate).eq("emoji", emoji);
      if (error) {
        setActivityError(getSafeSupabaseError(error.message));
        if (shouldIgnoreSupabaseSchemaError(error.message)) {
          setIsActivityDirty(false);
          setIsSavingActivity(false);
          return;
        }
        await loadData(selectedDate);
        setIsActivityDirty(false);
      }
      setIsActivityDirty(false);
      setIsSavingActivity(false);
      return;
    }

    const cleanupError = await supabase
      .from("daily_activities")
      .delete()
      .eq("user_id", user.id)
      .eq("activity_date", selectedDate)
      .eq("emoji", emoji);

    if (cleanupError.error) {
      setActivityError(getSafeSupabaseError(cleanupError.error.message));
      if (shouldIgnoreSupabaseSchemaError(cleanupError.error.message)) {
        setIsActivityDirty(false);
        setIsSavingActivity(false);
        return;
      }
      await loadData(selectedDate);
      setIsActivityDirty(false);
      setIsSavingActivity(false);
      return;
    }

      const { error } = await supabase.from("daily_activities").upsert(
      {
        user_id: user.id,
        activity_date: selectedDate,
        emoji,
        label: label || "",
        hours,
        start_time: startTime,
        end_time: endTime
      },
      {
        onConflict: "user_id,activity_date,emoji,label"
      }
    );
    if (error) {
      setActivityError(getSafeSupabaseError(error.message));
      if (shouldIgnoreSupabaseSchemaError(error.message)) {
        setIsActivityDirty(false);
        setIsSavingActivity(false);
        return;
      }
      await loadData(selectedDate);
      setIsActivityDirty(false);
    }
    setIsActivityDirty(false);
    setIsSavingActivity(false);
  };

  /** 활동 시간 갱신 (로컬 state + 로그인 시 DB 저장) */
const updateActivity = (emoji: string, nextHours: number, nextLabel?: string, nextStartTime?: string, nextEndTime?: string) => {
    const updated = composeUpdatedActivities(emoji, nextHours, nextLabel, nextStartTime, nextEndTime);
    setActivities(updated);
    setIsActivityDirty(true);
    if (!user) {
      updateDraftActivities(updated);
      setIsActivityDirty(false);
      return;
    }
    const source = activities.find((item) => item.emoji === emoji);
    const current = updated.find((item) => item.emoji === emoji);
    void saveActivity(
      emoji,
      current?.hours ?? 0,
      trimActivityLabel(nextLabel ?? current?.label ?? source?.label ?? ""),
      nextStartTime ?? current?.startTime ?? source?.startTime ?? "00:00",
      nextEndTime ?? current?.endTime ?? source?.endTime
    );
  };

  const setActivityHours = (activity: UiActivity, nextHours: number) => {
    updateActivity(activity.emoji, nextHours, activity.label);
  };

  const getActivityStepHours = () => activityStepMinutes / 60;

  const shiftActivityStep = (direction: -1 | 1) => {
    const index = ACTIVITY_STEP_OPTIONS.indexOf(activityStepMinutes);
    const nextIndex = Math.max(0, Math.min(ACTIVITY_STEP_OPTIONS.length - 1, index + direction));
    const nextValue = ACTIVITY_STEP_OPTIONS[nextIndex];
    setActivityStepMinutes(nextValue);
    try {
      localStorage.setItem(ACTIVITY_STEP_STORAGE_KEY, String(nextValue));
    } catch {
      // no-op
    }
  };

  const setActivityStepMinutesValue = (value: ActivityStepMinutes) => {
    setActivityStepMinutes(value);
    try {
      localStorage.setItem(ACTIVITY_STEP_STORAGE_KEY, String(value));
    } catch {
      // no-op
    }
  };

  const setActivityStartTime = (activity: UiActivity, nextStartTime: string) => {
    const normalizedStartTime = formatStartTime(nextStartTime);
    const recalculated = calculateHoursFromRange(normalizedStartTime, activity.endTime);
    const nextHours = recalculated ?? activity.hours;
    updateActivity(activity.emoji, nextHours, activity.label, normalizedStartTime, activity.endTime);
  };

  const setActivityEndTime = (activity: UiActivity, nextEndTime: string) => {
    const normalizedEndTime = formatStartTime(nextEndTime);
    const recalculated = calculateHoursFromRange(activity.startTime, normalizedEndTime);
    const nextHours = recalculated ?? activity.hours;
    updateActivity(activity.emoji, nextHours, activity.label, activity.startTime, normalizedEndTime);
  };

  const normalizeStartTimeInput = (value: string) => formatStartTime(value || "00:00");

  /** 퀵 이모지 버튼 클릭: 기존 있으면 +step, 없으면 새로 step 추가 */
  const addActivityFromTemplate = (emoji: string) => {
    const keyItem = activities.find((item) => item.emoji === emoji);
    const step = getActivityStepHours();
    if (keyItem) {
      updateActivity(emoji, keyItem.hours + step, keyItem.label);
    } else {
      updateActivity(emoji, step, "");
    }
    setActivityLabelEditingByDate((prev) => ({
      ...prev,
      [emoji]: true
    }));
  };

  /** 사용자 입력 이모지+시간으로 활동 추가 */
  const addCustomActivity = async () => {
    const emoji = customEmoji.trim();
    if (!emoji) {
      setActivityError(t("Please enter an emoji.", "이모지를 입력해 주세요."));
      return;
    }

    const parsed = parseActivityDurationInput(customHours);
    if (!parsed || parsed.hours <= 0) {
      setActivityError(
        t(
          "Invalid duration format. Use hours/minutes or HH:MM - HH:MM.",
          "시간 형식이 올바르지 않습니다. 시간/분(예: 2h, 1h 30m) 또는 HH:MM - HH:MM 형식을 사용해 주세요."
        )
      );
      return;
    }

    const label = "";
    const hours = normalizeHourInput(parsed.hours);
    const keyItem = activities.find((item) => item.emoji === emoji);
    const startTime = parsed.startTime ?? customStartTime;
    const endTime = parsed.endTime ?? calculateEndTimeFromHours(startTime, hours);
    if (startTime) {
      setCustomStartTime(startTime);
    }
    updateActivity(
      emoji,
      keyItem ? keyItem.hours + hours : hours,
      keyItem ? keyItem.label : label,
      startTime,
      endTime
    );
    setCustomEmoji("");
    setCustomHours("");
    setCustomStartTime("00:00");
    setActivityError("");
    setActivityLabelEditingByDate((prev) => ({
      ...prev,
      [emoji]: true
    }));
  };

  /** 활동 삭제 (시간 0으로 저장 = DB에서 해당 행 삭제) */
  const removeActivity = async (activity: UiActivity) => {
    const updated = activities.filter((item) => item.emoji !== activity.emoji);
    setActivities(updated);
    setIsActivityDirty(true);
    if (user) {
      await saveActivity(activity.emoji, 0, activity.label, activity.startTime ?? "00:00", activity.endTime);
    } else {
      updateDraftActivities(updated);
      setIsActivityDirty(false);
    }
  };

  const updateActivityLabel = (emoji: string, nextLabel: string) => {
    const safeLabel = normalizeActivityLabelInput(nextLabel);
    const updated = activities.map((item) => (item.emoji === emoji ? { ...item, label: safeLabel } : item));
    setActivities(updated);
    setIsActivityDirty(true);
    if (user) {
      return;
    }
    updateDraftActivities(updated);
    setIsActivityDirty(false);
  };

  const commitActivityLabel = (activity: UiActivity, nextLabel: string) => {
    const cleanLabel = trimActivityLabel(normalizeActivityLabelInput(nextLabel));
    const latestActivity = activities.find((item) => item.emoji === activity.emoji) ?? activity;
    if (trimActivityLabel(latestActivity.label) === cleanLabel) {
      setActivityLabelEditingByDate((prev) => {
        const next = { ...prev };
        delete next[activity.emoji];
        return next;
      });
      return;
    }
    updateActivityLabel(activity.emoji, cleanLabel);
    if (user) {
      void saveActivity(activity.emoji, latestActivity.hours, cleanLabel, latestActivity.startTime ?? "00:00", latestActivity.endTime);
    }
    setActivityLabelEditingByDate((prev) => {
      const next = { ...prev };
      delete next[activity.emoji];
      return next;
    });
  };

  const isActivityLabelEditing = (activity: UiActivity) => {
    const key = activity.emoji;
    return Boolean(activityLabelEditingByDate[key]);
  };

  const startActivityLabelEdit = (activity: UiActivity) => {
    const key = activity.emoji;
    setActivityLabelEditingByDate((prev) => ({
      ...prev,
      [key]: true
    }));
  };

  const handleActivityDragStart = () => {
    setIsDraggingActivity(true);
    setIsOverActivityTrash(false);
  };

  const handleActivityDragEnd = (activity: UiActivity, event: DragEvent<HTMLDivElement>) => {
    const { clientX, clientY } = event;
    setIsDraggingActivity(false);
    setIsOverActivityTrash(false);
    if (clientX === 0 && clientY === 0) return;
    const container = activityListRef.current;
    const trashRect = activityTrashRef.current?.getBoundingClientRect();
    if (!container) return;
    const listRect = container.getBoundingClientRect();
    const isOutsideList = clientX < listRect.left || clientX > listRect.right || clientY < listRect.top || clientY > listRect.bottom;
    const isInTrash = Boolean(
      trashRect &&
        clientX >= trashRect.left &&
        clientX <= trashRect.right &&
        clientY >= trashRect.top &&
        clientY <= trashRect.bottom
    );
    if (isOutsideList || isInTrash) {
      void removeActivity(activity);
    }
  };

  const handleActivityDragOverTrash = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsOverActivityTrash(true);
  };

  const handleActivityDragLeaveTrash = () => {
    setIsOverActivityTrash(false);
  };

  const handleActivityDropOnTrash = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleActivityTouchStart = (activity: UiActivity, event: TouchEvent<HTMLDivElement>) => {
    if (isActivityLabelEditing(activity)) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,textarea,a,label")) return;
    closeActivityContextMenu();
    const touch = event.touches[0];
    activitySwipeStartRef.current = {
      emoji: activity.emoji,
      x: touch.clientX,
      y: touch.clientY
    };
    activitySwipeLockRef.current = null;
  };

  const handleActivityTouchMove = (activity: UiActivity, event: TouchEvent<HTMLDivElement>) => {
    const start = activitySwipeStartRef.current;
    if (!start || start.emoji !== activity.emoji) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (activitySwipeLockRef.current === null) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
        activitySwipeLockRef.current = "h";
      } else if (Math.abs(dy) > 8) {
        activitySwipeLockRef.current = "v";
        return;
      } else {
        return;
      }
    }

    if (activitySwipeLockRef.current !== "h") return;

    event.preventDefault();
    const nextSwipe = Math.max(-ACTIVITY_SWIPE_MAX, Math.min(0, dx));
    setActivitySwipeXByEmoji((prev) => {
      if (prev[activity.emoji] === nextSwipe) return prev;
      return { ...prev, [activity.emoji]: nextSwipe };
    });
  };

  const handleActivityTouchEnd = (activity: UiActivity) => {
    const start = activitySwipeStartRef.current;
    if (!start || start.emoji !== activity.emoji) return;

    const swipeX = activitySwipeXByEmoji[activity.emoji] ?? 0;
    const shouldDelete = swipeX <= -ACTIVITY_SWIPE_THRESHOLD;

    activitySwipeStartRef.current = null;
    activitySwipeLockRef.current = null;
    setActivitySwipeXByEmoji((prev) => ({ ...prev, [activity.emoji]: 0 }));

    if (shouldDelete) {
      void removeActivity(activity);
    }
  };

  const openActivityContextMenu = (activity: UiActivity, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setActivityContextMenu({ x: event.clientX, y: event.clientY, activity });
  };

  const closeActivityContextMenu = () => setActivityContextMenu(null);

  const deleteActivityFromContextMenu = async () => {
    if (!activityContextMenu) return;
    await removeActivity(activityContextMenu.activity);
    setActivityContextMenu(null);
  };

  const handleJournalChange = (value: string) => {
    const next = value.slice(0, NOTE_CHAR_LIMIT);
    setJournalText(next);
    setIsJournalDirty(true);
    if (journalDraftDebounceRef.current) clearTimeout(journalDraftDebounceRef.current);
    journalDraftDebounceRef.current = setTimeout(() => {
      updateDraftJournal(next);
      setIsJournalDirty(false);
    }, 500);
  };

  // 날짜 전환 시 편집 상태 초기화 (이전 날짜의 편집 모드가 새 날짜에 남지 않도록)
  useEffect(() => {
    setActivityLabelEditingByDate({});
  }, [selectedDate]);

  useEffect(() => {
    const handleLocalDataCleared = () => {
      setDraftTodosByDate({});
      setDraftJournalByDate({});
      setDraftActivitiesByDate({});
      void loadData(selectedDate);
    };

    window.addEventListener("diary:local-data-cleared", handleLocalDataCleared);
    return () => {
      window.removeEventListener("diary:local-data-cleared", handleLocalDataCleared);
    };
  }, [loadData, selectedDate]);

  useEffect(() => {
    if (activeDiaryTab !== "dashboard") {
      setIsSearchOpen(false);
      setIsStatsOpen(false);
    }
  }, [activeDiaryTab]);

  // 활동 로드 시 라벨이 없는 항목은 자동으로 편집 모드 진입
  useEffect(() => {
    setActivityLabelEditingByDate((prev) => {
      const next = { ...prev };
      activities.forEach((activity) => {
        const key = activity.emoji;
        if (activity.label.trim() === "" && next[key] === undefined) {
          next[key] = true;
        }
      });
      return next;
    });
  }, [activities]);

  useEffect(() => {
    setActivityConflictWarnings(buildActivityConflictWarnings(activities, isKorean));
  }, [activities, buildActivityConflictWarnings, isKorean]);

  const syncConflictMessage = syncConflict
    ? buildSyncConflictMessage(syncConflict.scope, prettyDateLabel(syncConflict.date, appLocale), isKorean)
    : null;
  const todoRepeatSummary = !canTodoRepeat
    ? t("Pro only", "Pro 전용")
    : todoRepeatDays.length === 0
      ? t("Off", "끔")
      : `${TODO_REPEAT_DAY_LABELS
          .filter((entry) => todoRepeatDays.includes(entry.value))
          .map((entry) => (isKorean ? entry.ko : entry.en))
          .join(", ")} · ${todoRepeatWeeks}${t("w", "주")}`;

  const buildPdfTitle = (range: PdfRange) => {
    if (range === "day") return t("Daily Report", "일간 리포트");
    if (range === "week") return t("Weekly Report", "주간 리포트");
    return t("Monthly Report", "월간 리포트");
  };

  const buildPdfRangeLabel = (range: PdfRange) => {
    if (range === "day") {
      return prettyDateLabel(selectedDate, appLocale);
    }
    if (range === "week") {
      return weeklyRangeLabel;
    }
    return monthlyRangeLabel;
  };

  const toPdfRows = (range: PdfRange) => {
    const days = range === "day"
      ? [selectedDate]
      : range === "week"
        ? getWeekRangeDates(selectedDate)
        : getMonthRangeDates(selectedDate);

    return days.map((day) => {
      const dayActivities =
        range === "day"
          ? activities
          : (monthActivitiesByDate[day] ?? []);
      const dayNotes =
        range === "day"
          ? splitMemoLines(journalText)
          : splitMemoLines(monthJournalByDate[day] ?? "");

      return {
        day,
        label: prettyDateLabel(day, appLocale),
        activities: dayActivities
          .filter((item) => item.hours > 0)
          .slice()
          .sort((a, b) => a.emoji.localeCompare(b.emoji)),
        notes: dayNotes
      };
    });
  };

  const openPdfPrintWindow = (range: PdfRange) => {
    if (typeof window === "undefined") return;
    const rows = toPdfRows(range);
    const totalHours = rows.reduce(
      (sum, row) => sum + row.activities.reduce((acc, item) => acc + Number(item.hours || 0), 0),
      0
    );
    const activeDays = rows.filter((row) => row.activities.length > 0).length;
    const generatedAt = new Date().toLocaleString(appLocale);
    const title = buildPdfTitle(range);
    const rangeLabel = buildPdfRangeLabel(range);

    const cardsHtml = rows.map((row) => {
      const activitiesHtml = row.activities.length
        ? row.activities.map((item) => `
            <tr>
              <td class="emoji">${escapeHtml(item.emoji)}</td>
              <td>${escapeHtml(formatHoursLabel(item.hours))}</td>
              <td>${escapeHtml(formatActivityTimeWindow(item))}</td>
              <td>${escapeHtml(item.label || "")}</td>
            </tr>
          `).join("")
        : `<tr><td colspan="4" class="muted">${escapeHtml(t("No activity records", "활동 기록 없음"))}</td></tr>`;

      const notesHtml = row.notes.length
        ? row.notes.map((note) => `<li>${escapeHtml(note.replace(/^-\s*/, ""))}</li>`).join("")
        : `<li class="muted">${escapeHtml(t("No notes", "노트 없음"))}</li>`;

      return `
        <section class="card">
          <h3>${escapeHtml(row.label)}</h3>
          <table>
            <thead>
              <tr>
                <th>${escapeHtml(t("Emoji", "이모지"))}</th>
                <th>${escapeHtml(t("Duration", "시간"))}</th>
                <th>${escapeHtml(t("Time window", "시간대"))}</th>
                <th>${escapeHtml(t("Label", "라벨"))}</th>
              </tr>
            </thead>
            <tbody>${activitiesHtml}</tbody>
          </table>
          <div class="notes">
            <strong>${escapeHtml(t("Notes", "노트"))}</strong>
            <ul>${notesHtml}</ul>
          </div>
        </section>
      `;
    }).join("");

    const html = `
      <!doctype html>
      <html lang="${isKorean ? "ko" : "en"}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #fff; }
          .wrap { padding: 20px; max-width: 900px; margin: 0 auto; }
          .header { margin-bottom: 14px; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
          .title { font-size: 20px; font-weight: 700; margin: 0; }
          .meta { margin-top: 6px; color: #6b7280; font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
          .cards { display: grid; gap: 12px; }
          .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; page-break-inside: avoid; }
          .card h3 { margin: 0 0 8px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border-bottom: 1px solid #f3f4f6; text-align: left; padding: 6px 4px; vertical-align: top; }
          th { font-weight: 600; color: #374151; }
          td.emoji { width: 44px; font-size: 15px; }
          .notes { margin-top: 8px; font-size: 12px; }
          .notes ul { margin: 6px 0 0; padding-left: 16px; }
          .notes li { margin-bottom: 4px; }
          .muted { color: #9ca3af; }
          @page { size: auto; margin: 14mm; }
        </style>
      </head>
      <body>
        <main class="wrap">
          <header class="header">
            <h1 class="title">${escapeHtml(title)}</h1>
            <div class="meta">
              <span>${escapeHtml(rangeLabel)}</span>
              <span>${escapeHtml(`${t("Total hours", "총 시간")}: ${formatHoursLabel(totalHours)}`)}</span>
              <span>${escapeHtml(`${t("Active days", "활동일")}: ${activeDays}`)}</span>
              <span>${escapeHtml(`${t("Generated", "생성 시각")}: ${generatedAt}`)}</span>
            </div>
          </header>
          <section class="cards">${cardsHtml}</section>
        </main>
      </body>
      </html>
    `;

    const popup = window.open("", "_blank", "noopener,noreferrer,width=980,height=900");
    if (!popup) {
      showToast(t("Popup blocked — allow popups to export PDF.", "팝업 차단 — PDF 내보내기를 위해 팝업 허용이 필요합니다."), "error");
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => {
      popup.print();
    }, 250);
  };

  useEffect(() => {
    const handleManualSync = () => {
      const run = async () => {
        try {
          const target = selectedDateRef.current;
          await loadDataRef.current(target);
          await loadMonthFlowRef.current(target);
          window.dispatchEvent(
            new CustomEvent("diary:sync-status", {
              detail: {
                ok: true,
                syncedAt: new Date().toISOString(),
                message: t("Sync completed.", "동기화가 완료되었습니다.")
              }
            })
          );
        } catch {
          window.dispatchEvent(
            new CustomEvent("diary:sync-status", {
              detail: {
                ok: false,
                message: t("Sync failed. Please try again.", "동기화에 실패했습니다. 다시 시도해 주세요.")
              }
            })
          );
        }
      };
      void run();
    };

    window.addEventListener("diary:sync-now", handleManualSync);
    return () => {
      window.removeEventListener("diary:sync-now", handleManualSync);
    };
  }, [isKorean]);

  useEffect(() => {
    const handleExportPdf = (event: Event) => {
      const custom = event as CustomEvent<{ range?: PdfRange }>;
      const range = custom.detail?.range ?? "day";
      openPdfPrintWindow(range);
    };

    window.addEventListener("diary:export-pdf", handleExportPdf);
    return () => {
      window.removeEventListener("diary:export-pdf", handleExportPdf);
    };
  }, [openPdfPrintWindow]);

  return (
    <main className="flex min-h-screen w-full flex-col pb-16 md:pb-0">
      <div className="mx-auto mt-4 w-full max-w-5xl px-4 sm:mt-5">
        <h2 className="text-base font-bold text-[var(--ink)]">
          {prettyDateLabel(selectedDate, appLocale)}
        </h2>
      </div>
      {syncConflictMessage ? (
        <div className="mx-auto mt-3 w-full max-w-5xl px-4">
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <p>{syncConflictMessage}</p>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => void resolveSyncConflict()} className="rounded-md border border-[var(--danger)] px-2 py-1 text-[10px] font-semibold">
                {t("Reload now", "지금 새로고침")}
              </button>
              <button onClick={cancelSyncConflict} className="rounded-md border border-[var(--danger)] px-2 py-1 text-[10px] font-semibold opacity-85">
                {t("Keep editing", "계속 편집")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

        {/* ── Main Layout: Sidebar + Content ── */}
      <div className="flex flex-1 flex-col gap-8 pt-4 lg:flex-row lg:items-start">

        {/* ── Left Sidebar: Calendar + Monthly Flow ── */}
        {activeDiaryTab !== "dashboard" ? (
          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-60">
          {/* Activity summary (read-only) */}
          <div className="fade-up rounded-lg border border-[var(--border)] p-3">
            <p className="mb-1 text-xs leading-5 font-medium text-[var(--ink)]">{t("Today's activity summary", "오늘의 활동 요약")}</p>
            {activities.length === 0 ? (
              <p className="break-words text-xs leading-5 text-[var(--ink)]">{t("No records yet", "아직 기록이 없습니다.")}</p>
            ) : (
              <div className="grid gap-1 max-h-56 overflow-y-auto pr-1">
                {activities
                  .slice()
                  .sort((a, b) => a.emoji.localeCompare(b.emoji))
                  .map((activity) => (
                    <div
                      key={`${activity.emoji}-${activity.id ?? "no-id"}`}
                      className="min-w-0 grid items-start gap-2 text-xs leading-5 text-[var(--ink)]"
                      style={{ gridTemplateColumns: "1.25rem 3.5rem 6rem minmax(0, 1fr)" }}
                    >
                      <span className="row-span-1 w-5 text-base leading-5">{activity.emoji}</span>
                      <span className="row-span-1 w-14 shrink-0 whitespace-nowrap text-xs leading-5 text-[var(--ink)]">{formatHoursLabel(activity.hours)}</span>
                      <span className="row-span-1 w-24 shrink-0 whitespace-nowrap text-xs leading-5 text-[var(--muted)]">[{formatActivityTimeWindow(activity)}]</span>
                      {activity.label?.trim() ? (
                        <span className="col-span-1 min-w-0 break-words text-xs leading-5 text-[var(--muted)]">- {activity.label}</span>
                      ) : null}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Notes card */}
          <div className="fade-up rounded-lg border border-[var(--border)] p-3">
            <p className="mb-1 text-xs leading-5 font-medium text-[var(--ink)]">{t("Notes", "노트")}</p>
            {splitMemoLines(journalText).length === 0 ? (
              <p className="break-words text-[11px] leading-5 text-[var(--ink)]">{t("No notes yet.", "아직 노트가 없습니다.")}</p>
            ) : (
              <div className="grid gap-1">
                {splitMemoLines(journalText).slice(0, 3).map((line, index) => (
                  <p key={`journal-${line}-${index}`} className="break-words text-[11px] leading-5 text-[var(--ink)]">{`- ${line}`}</p>
                ))}
                {splitMemoLines(journalText).length > 3 ? <p className="text-[11px] leading-5 text-[var(--muted)]">...</p> : null}
              </div>
            )}
          </div>

          {/* Calendar */}
          <div className="fade-up rounded-lg border border-[var(--border)] px-2 py-3">
            {/* Month navigation */}
            <div className="mb-2 flex items-center justify-between">
              <button
                onClick={() => setSelectedDate(shiftMonth(currentMonth, -1))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
                aria-label={t("Previous month", "이전 달")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold tracking-tight text-[var(--ink)]">
                {getMonthLabel(currentMonth, appLocale)}
              </span>
              <button
                onClick={() => setSelectedDate(shiftMonth(currentMonth, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
                aria-label={t("Next month", "다음 달")}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="mb-0.5 grid grid-cols-7 text-center">
              {weekdayLabels.map((d) => (
                <span key={d} className="py-1 text-[0.6rem] font-medium uppercase tracking-wide text-[var(--muted)]">{d}</span>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7 place-items-center gap-y-0.5">
              {calendarDays.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} className="h-10 w-10" />;
                const isSelected = day === selectedDate;
                const isToday = day === today;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={[
                      "n-calendar-day",
                      isSelected ? "n-calendar-day--selected" : "",
                      !isSelected && isToday ? "n-calendar-day--today" : ""
                    ].join(" ")}
                  >
                    {new Date(`${day}T00:00:00`).getDate()}
                  </button>
                );
              })}
            </div>

            {/* Today shortcut — shown when viewing a different month */}
            {currentMonth !== today.slice(0, 7) ? (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={() => setSelectedDate(today)}
                  className="rounded-full border border-[var(--border)] px-5 py-1 text-xs font-medium text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {appLanguage === "ko" ? "오늘" : "Today"}
                </button>
              </div>
            ) : null}
          </div>

          </aside>
        ) : null}

          {/* ── Right Main Content ── */}
        <div
          className="min-w-0 flex-1 space-y-8"
          onTouchStart={handleTabSwipeStart}
          onTouchMove={handleTabSwipeMove}
          onTouchEnd={handleTabSwipeEnd}
          onTouchCancel={handleTabSwipeEnd}
          style={{
            touchAction: "pan-y",
            transform: `translateX(${tabSwipeOffset}px)`,
            willChange: "transform",
            transition: tabSwipeOffset === 0 ? "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)" : "none"
          }}
        >

          {/* 날짜 헤딩 + 검색/통계 + 탭 */}
          <div className="fade-up space-y-2">
            {activeDiaryTab === "dashboard" ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsStatsOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)] transition-colors"
                    aria-label={t("Open activity insights", "활동 인사이트 열기")}
                  >
                    <span>📊</span>
                    <span className="hidden sm:inline">{t("Insights", "인사이트")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)] transition-colors"
                    aria-label={t("Open search", "검색 열기")}
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t("Search", "검색")}</span>
                  </button>
                </div>
              </div>
            ) : null}
            <div className="hidden md:inline-flex overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg)]">
              {diaryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDiaryTab(tab.id)}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    activeDiaryTab === tab.id
                      ? "bg-[var(--bg-hover)] text-[var(--ink)]"
                      : "text-[var(--muted)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── To-do ── */}
          {activeDiaryTab === "todo" ? (
          <section className="fade-up overflow-visible rounded-lg border border-[var(--border)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3">
              <span className="n-h2">{t("To-do", "할 일")}</span>
              <button
                onClick={() => {
                  setIsAddingTodo((prev) => {
                    const next = !prev;
                    if (!next) {
                      setIsTodoRepeatSettingsOpen(false);
                    }
                    return next;
                  });
                }}
                className="ml-auto n-btn-ghost px-2 py-1 text-sm"
                  aria-label={t("Add to-do", "할 일 추가")}
                >
                  +
                </button>
                {isLoadingTodos && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" />}
              </div>
              {todoError && <p className="px-3 py-2 text-xs text-[var(--danger)]">{todoError}</p>}
              {isAddingTodo ? (
                <div className="px-3 py-3">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {orderedUserSymbols.map((symbol) => (
                        <button
                          key={symbol.emoji}
                          type="button"
                          onClick={() => appendSymbolToTodo(symbol.emoji)}
                          className="n-btn-ghost n-h2 h-7 w-7 shrink-0 p-0"
                          title={symbol.label ? `${symbol.emoji} ${symbol.label}` : `${symbol.emoji}`}
                        >
                          {symbol.emoji}
                        </button>
                      ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      ref={todoInputRef}
                      value={newTodoTitle}
                      onChange={(e) => setNewTodoTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void addTodo();
                      }}
                      className="n-input flex-1"
                      placeholder={t("Add a task", "할 일을 입력하세요")}
                      aria-label={t("Todo input", "할 일 입력")}
                    />
                    <button
                      type="button"
                      onClick={() => setIsTodoRepeatSettingsOpen((prev) => !prev)}
                      className={`inline-flex h-10 shrink-0 items-center gap-1 rounded-md border px-2 ${
                        isTodoRepeatSettingsOpen
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label={t("Open repeat settings", "반복 설정 열기")}
                      title={t("Repeat settings", "반복 설정")}
                    >
                      <Settings className="h-4 w-4" />
                      <span className="text-[11px] font-semibold">{t("Repeat", "반복")}</span>
                      <span className="text-[10px] opacity-80">{todoRepeatSummary}</span>
                    </button>
                    <button onClick={() => void addTodo()} className="n-btn-primary shrink-0">
                      {t("Add", "추가")}
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingTodo(false);
                        setIsTodoRepeatSettingsOpen(false);
                        setNewTodoTitle("");
                        setTodoRepeatDays([]);
                        setTodoRepeatWeeks(TODO_REPEAT_WEEKS[1] ?? 1);
                      }}
                      className="n-btn-ghost shrink-0"
                    >
                      {t("Cancel", "취소")}
                    </button>
                  </div>
                  {isTodoRepeatSettingsOpen ? (
                    <div className="mt-2 rounded-lg border border-[var(--border)] p-2">
                    <p className="mb-1.5 text-xs text-[var(--muted)]">{t("Repeat on", "반복 요일")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TODO_REPEAT_DAY_LABELS.map((entry) => {
                        const active = todoRepeatDays.includes(entry.value);
                        const repeatDayLabel = isKorean ? entry.ko : entry.en;
                        return (
                          <button
                            key={entry.value}
                            type="button"
                            onClick={() => toggleTodoRepeatDay(entry.value)}
                            disabled={!canTodoRepeat}
                            className={`rounded border px-2 py-1 text-xs ${
                              active ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]" : "border-[var(--border)] text-[var(--ink)]"
                            }`}
                          >
                            {repeatDayLabel}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)]">{t("for next", "다음")}</span>
                      <select
                        value={todoRepeatWeeks}
                        onChange={(event) => setTodoRepeatWeeks(Number(event.target.value))}
                        disabled={!canTodoRepeat}
                        className="n-input h-7 w-16 px-2 py-1 text-xs"
                      >
                        {TODO_REPEAT_WEEKS.map((week) => (
                          <option key={week} value={week}>
                            {week}{t(" weeks", "주")}
                          </option>
                        ))}
                      </select>
                    </div>
                    {!canTodoRepeat ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">{t("Repeat scheduling is available on Pro.", "반복 설정은 Pro에서 이용 가능합니다.")}</p>
                    ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ul>
                {todos.length === 0 ? (
                  <li className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                    <CheckCircle2 className="h-8 w-8 text-[var(--muted)] opacity-30" />
                    <p className="text-sm font-medium text-[var(--muted)]">{t("No tasks yet", "아직 할 일이 없습니다")}</p>
                    <p className="text-xs text-[var(--muted)] opacity-60">{t("Tap + to add your first task for today", "+ 버튼으로 오늘 할 일을 추가해 주세요")}</p>
                  </li>
                ) : (
                  todos.map((todo) => (
                    <SwipeableTodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={() => void toggleTodo(todo)}
                      onDelete={() => void deleteTodo(todo)}
                      onDeleteTodoLabel={t("Delete task", "할 일 삭제")}
                    />
                  ))
                )}
              </ul>
          </section>
          ) : null}

          {/* ── Activity Log ── */}
        {activeDiaryTab === "activity" ? (
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-3">
        <span className="n-h2">{t("Activity", "활동")}</span>
        {isSavingActivity && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" aria-label={t("Saving", "저장 중")} />
        )}
        <button
          onClick={toggleSymbolPicker}
        className="ml-auto inline-flex items-center gap-1 rounded border border-[var(--primary)]/40 bg-[var(--primary)]/12 px-2 py-1 text-xs font-semibold text-[var(--primary)]"
          aria-label={t("Symbol management", "심볼 관리")}
        >
          <Palette className="h-3.5 w-3.5" />
          <span>{t("Symbol management", "심볼 관리")}</span>
        </button>
                <button
                  onClick={() => setIsActivityStepPickerOpen((prev) => !prev)}
                  className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--ink)] transition hover:bg-[var(--bg-hover)]"
                  aria-label={t("Activity step settings", "활동 단위 설정")}
                  title={t("Set activity increment", "활동 단위 조정")}
                  type="button"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <input
                  value={activityLogQuery}
                  onChange={(e) => setActivityLogQuery(e.target.value)}
                  className="n-input ml-2 w-28 px-2 py-1.5 text-xs"
                  placeholder={t("Filter", "필터")}
                  aria-label={t("Filter activity log", "활동 기록 필터")}
                />
              </div>

              {isActivityStepPickerOpen ? (
                <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[var(--ink)]">{t("Activity step", "활동 단위")}</p>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => shiftActivityStep(-1)}
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                        aria-label={t("Decrease step", "감소")}
                      >
                        {"<"}
                      </button>
                      <span className="n-tag n-tag--blue text-xs">{activityStepMinutes}m</span>
                      <button
                        type="button"
                        onClick={() => shiftActivityStep(1)}
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                        aria-label={t("Increase step", "증가")}
                      >
                        {">"}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                {ACTIVITY_STEP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setActivityStepMinutesValue(option)}
                    className={`rounded border px-2 py-1 text-xs transition ${
                          option === activityStepMinutes
                            ? "border-[var(--primary)] bg-[var(--primary)]/12 text-[var(--primary)]"
                            : "border-[var(--border)] text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                        }`}
                      >
                      {option}m
                    </button>
                  ))}
                  </div>
                </div>
              ) : null}

              {/* ── Symbol Picker Panel ── */}
                {isSymbolPickerOpen && (
                <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                  <SymbolPicker
                    currentSymbols={userSymbols}
                    appLanguage={appLanguage}
                    maxSymbols={symbolLimit}
                    labelCharacterLimit={planLimits.labelCharacterLimit}
                    onSymbolsChange={handleSymbolPickerSymbolsChange}
                    onClose={closeSymbolPicker}
                  />
                </div>
              )}

              {activityError && <p className="px-3 py-2 text-xs text-[var(--danger)]">{activityError}</p>}
              <div className="grid divide-y divide-[var(--border)]">

                {/* Quick emoji buttons */}
                <div className="max-h-28 overflow-y-auto px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {orderedUserSymbols.map((symbol) => {
                      const recorded = activities.find((item) => item.emoji === symbol.emoji);
                      return (
                        <button
                          key={symbol.emoji}
                          onClick={() => addActivityFromTemplate(symbol.emoji)}
                          className="n-btn-ghost gap-1 px-2.5 py-1.5 text-base"
                          title={symbol.label ? `${symbol.emoji} ${symbol.label}` : `${symbol.emoji} ${t("Add", "추가")}`}
                        >
                          {symbol.emoji}
                          {recorded?.hours ? (
                            <span className="n-tag n-tag--blue whitespace-nowrap text-xs">{formatHoursLabel(recorded.hours)}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Add custom activity */}
                <div className="px-3 py-3">
                  <div className="flex gap-2">
                          <input
                            value={customEmoji}
                            onChange={(e) => setCustomEmoji(e.target.value.slice(0, 12))}
                            className="n-input w-20 shrink-0"
                            placeholder={t("Emoji", "이모지")}
                            aria-label={t("Emoji input", "이모지 입력")}
                          />
                    <input
                          value={customHours}
                          onChange={(e) => setCustomHours(e.target.value)}
                          className="n-input w-48 shrink-0"
                          type="text"
                          placeholder={t("2h 25m / 02:00 - 04:00", "2시간 25분 / 02:00 - 04:00")}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            void addCustomActivity();
                          }}
                        />
                        <input
                          type="time"
                          value={customStartTime}
                          onChange={(e) => setCustomStartTime(normalizeStartTimeInput(e.target.value))}
                          onBlur={(e) => setCustomStartTime(normalizeStartTimeInput(e.target.value))}
                          className="n-input w-16 shrink-0 px-1.5 py-1.5 text-[11px]"
                          style={{ minWidth: "4rem", maxWidth: "4rem" }}
                          aria-label={t("Start time", "시작 시간")}
                          placeholder={t("Start", "시작")}
                        />
                        <button onClick={() => void addCustomActivity()} className="n-btn-primary shrink-0">
                      {t("Add", "추가")}
                      </button>
                    </div>
                  </div>

              {/* 기록된 활동 */}
            <div
              ref={activityListRef}
              className="px-3 py-3"
              onPointerDown={(event) => {
                if (event.button === 2) {
                  return;
                }
                closeActivityContextMenu();
              }}
              onContextMenu={(event) => event.preventDefault()}
            >
              {filteredActivities.length > 0 ? (
                <div className="grid divide-y divide-[var(--border)]">
                  {filteredActivities.map((activity) => (
                      (() => {
                        const swipeX = activitySwipeXByEmoji[activity.emoji] ?? 0;
                        const swipeProgress = Math.min(1, Math.abs(swipeX) / ACTIVITY_SWIPE_THRESHOLD);
                        return (
                      <div
                        key={activity.emoji}
                        className="relative overflow-hidden px-0 py-1.5 cursor-grab active:cursor-grabbing"
                        draggable={!isActivityLabelEditing(activity)}
                        onDragStart={(event) => {
                          handleActivityDragStart();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", activity.emoji);
                        }}
                        onContextMenu={(event) => openActivityContextMenu(activity, event)}
                        onDragEnd={(event) => handleActivityDragEnd(activity, event)}
                      >
                        {swipeX < -4 ? (
                          <div
                            className="absolute inset-0 flex items-center justify-end px-4"
                            style={{
                              background: "var(--danger)",
                              opacity: swipeProgress
                            }}
                            aria-hidden="true"
                          >
                            <Trash2 className="h-4 w-4 text-white" />
                          </div>
                        ) : null}
                        <div
                          className="relative z-10 bg-[var(--bg)]"
                          onTouchStart={(event) => handleActivityTouchStart(activity, event)}
                          onTouchMove={(event) => handleActivityTouchMove(activity, event)}
                          onTouchEnd={() => handleActivityTouchEnd(activity)}
                          onTouchCancel={() => handleActivityTouchEnd(activity)}
                          style={{
                            transform: `translateX(${swipeX}px)`,
                            transition:
                              activitySwipeLockRef.current === "h"
                                ? "none"
                                : "transform 0.2s ease-out",
                            touchAction: "pan-y"
                          }}
                        >
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void removeActivity(activity);
                            }}
                            className="absolute right-2 top-2 z-10 h-6 w-6 rounded-full border border-[var(--border)] bg-[var(--bg)] text-xs text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)]"
                          aria-label={t("Delete activity", "활동 삭제")}
                        >
                          ×
                        </button>
                        {/* Row 1: [emoji] [−] [h] [+] [00:00] */}
                        <div className="group flex items-center gap-2 pl-3 pr-10">
                          <span className="w-6 text-center text-lg leading-none">{activity.emoji}</span>
                          <button
                            onClick={() => setActivityHours(activity, activity.hours - getActivityStepHours())}
                            className="n-btn-ghost h-6 w-6 shrink-0 p-0 text-sm leading-none"
                          >
                            −
                          </button>
                          <span className="w-14 shrink-0 whitespace-nowrap text-center text-sm font-semibold text-[var(--ink)]">{formatHoursLabel(activity.hours)}</span>
                          <button
                            onClick={() => setActivityHours(activity, activity.hours + getActivityStepHours())}
                            className="n-btn-ghost h-6 w-6 shrink-0 p-0 text-sm leading-none"
                          >
                            +
                          </button>
                          <TimeInput
                            value={activity.startTime ?? "00:00"}
                            onCommit={(v) => setActivityStartTime(activity, v)}
                            onAutoAdvance={() => {
                              const row = document.activeElement?.closest(".group");
                              const endInput = row?.querySelector<HTMLInputElement>('[data-diary-time-field="end"]');
                              if (endInput) endInput.focus();
                            }}
                            ariaLabel={t("Activity start time", "활동 시작 시간")}
                            dataField="start"
                          />
                          <span className="text-xs text-[var(--muted)]">–</span>
                          <TimeInput
                            value={getEffectiveEndTime(activity)}
                            onCommit={(v) => setActivityEndTime(activity, v)}
                            ariaLabel={t("Activity end time", "활동 종료 시간")}
                            dataField="end"
                          />
                        </div>
                        {/* Row 2: label */}
                        <div className="px-3 pt-1" style={{ paddingLeft: "2.25rem" }}>
                          {isActivityLabelEditing(activity) ? (
                            <input
                              value={activity.label}
                              onChange={(e) => updateActivityLabel(activity.emoji, e.target.value)}
                              onBlur={(e) => commitActivityLabel(activity, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.nativeEvent.isComposing) return;
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                commitActivityLabel(activity, e.currentTarget.value);
                              }}
                                className="n-input text-xs"
                              placeholder={t("Write what you did and press Enter", "내용을 입력하고 Enter를 눌러 저장")}
                              aria-label={t("Activity note input", "활동 노트 입력")}
                            />
                          ) : (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => startActivityLabelEdit(activity)}
                              onKeyDown={(event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                startActivityLabelEdit(activity);
                              }}
                                  className="flex w-full items-start gap-2 rounded-md border border-transparent px-1 py-0.5 text-left text-xs leading-5 hover:bg-[var(--bg-hover)]"
                                >
                                  <span className={`min-w-0 flex-1 break-all whitespace-pre-wrap ${activity.label ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>
                                {activity.label ? activity.label : t("Tap to add note...", "탭해서 노트를 추가하세요...")}
                              </span>
                            </div>
                          )}
                        </div>
                        {activityConflictWarnings[activity.emoji] ? (
                          <p className="px-3 pt-1 text-xs text-[var(--danger)]" style={{ paddingLeft: "2.25rem" }}>
                            {activityConflictWarnings[activity.emoji]}
                          </p>
                        ) : null}
                        </div>
                      </div>
                        );
                      })()
                    ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                  <span className="text-3xl leading-none opacity-25" aria-hidden="true">⏱</span>
                  <p className="text-sm font-medium text-[var(--muted)]">
                    {normalizedActivityLogQuery ? t("No matches found", "검색 결과가 없습니다") : t("No activities logged", "활동 기록이 없습니다")}
                  </p>
                  <p className="text-xs text-[var(--muted)] opacity-60">
                    {normalizedActivityLogQuery ? t("Try a different keyword", "다른 키워드로 검색해 보세요") : t("Tap an emoji above to start tracking", "위의 이모지를 탭해서 기록을 시작하세요")}
                  </p>
                </div>
                )}
                {activityContextMenu ? (
                  <div
                    className="fixed z-50 min-w-[130px] rounded-md border border-[var(--border)] bg-[var(--bg)] p-1 shadow-lg"
                    style={{ left: activityContextMenu.x, top: activityContextMenu.y }}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                  >
                    <button
                      type="button"
                      onClick={deleteActivityFromContextMenu}
                      className="w-full rounded px-2 py-1.5 text-left text-xs text-[var(--danger)]"
                    >
                      {t("Remove", "삭제")}
                    </button>
                  </div>
                ) : null}
                {isDraggingActivity ? (
                  <div
                    ref={activityTrashRef}
                    onDragOver={handleActivityDragOverTrash}
                    onDragLeave={handleActivityDragLeaveTrash}
                    onDrop={handleActivityDropOnTrash}
                    className={`mt-3 rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs transition-colors ${
                      isOverActivityTrash
                        ? "border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]"
                        : "border-[var(--muted)]/45 text-[var(--muted)]"
                    }`}
                  >
                    {t("Drag here to delete", "여기에 끌어다 놓아 삭제")}
                  </div>
                ) : null}
              </div>
              </div>
            </section>
          ) : null}

          {/* ── Notes ── */}
          {activeDiaryTab === "notes" ? (
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="flex items-center border-b border-[var(--border)] px-3 py-3">
                <span className="n-h2">{t("Notes", "노트")}</span>
              </div>
              {journalError && <p className="px-3 py-2 text-xs text-[var(--danger)]">{journalError}</p>}
              <div className="divide-y divide-[var(--border)]">
                <div className="px-3 py-3">
                  <textarea
                    value={journalText}
                    onChange={(e) => handleJournalChange(e.target.value)}
                    rows={8}
                    className="n-textarea"
                    placeholder={t("Write your tasks, notes, and reflection freely...", "작업, 노트, 회고를 자유롭게 기록해 주세요")}
                  />
                  <p className="mt-1 text-right text-xs text-[var(--muted)]">
                    {`${journalText.length}/${NOTE_CHAR_LIMIT}`}
                  </p>
                </div>
                <div className="px-3 py-3">
                  <p className="text-xs text-[var(--muted)]">{t("Auto-saved locally", "로컬에 자동 저장됨")}</p>
                </div>
              </div>
          </section>
          ) : null}

          {/* ── Dashboard (daily flow) ── */}
          {activeDiaryTab === "dashboard" ? (
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between gap-1 overflow-hidden px-1 py-1 border-b border-[var(--border)]">
                <div className="flex min-w-0 items-center gap-1">
                  <p className="n-label truncate text-[10px]">{t("Dashboard", "대시보드")}</p>
                  {monthLoading && <Loader2 className="h-3 w-3 animate-spin text-[var(--muted)]" />}
                </div>
                <div className="flex flex-shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] px-0.5 py-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDate(
                        dashboardViewMode === "week"
                          ? shiftDateByDays(selectedDate, -7)
                          : shiftMonth(currentMonth, -1)
                      )
                    }
                    className="n-btn-ghost h-5 w-5 p-0"
                    aria-label={dashboardViewMode === "week" ? t("Previous week", "이전 주") : t("Previous month", "이전 달")}
                  >
                    <ChevronLeft className="h-2.5 w-2.5" />
                  </button>
                  <span className="min-w-0 max-w-[6rem] shrink overflow-hidden truncate px-1 text-center text-[8px] leading-4 text-[var(--muted)]">
                    {dashboardViewMode === "week" ? weeklyRangeLabel : monthlyRangeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDate(
                        dashboardViewMode === "week"
                          ? shiftDateByDays(selectedDate, 7)
                          : shiftMonth(currentMonth, 1)
                      )
                    }
                    className="n-btn-ghost h-5 w-5 p-0"
                    aria-label={dashboardViewMode === "week" ? t("Next week", "다음 주") : t("Next month", "다음 달")}
                  >
                    <ChevronRight className="h-2.5 w-2.5" />
                  </button>
                </div>
                <div className="flex flex-shrink-0 rounded-lg border border-[var(--border)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setDashboardViewModeAndSave("week")}
                    className={`px-1 py-0.5 text-center min-w-[1.75rem] text-[8px] font-medium rounded-md leading-4 transition-colors ${
                      dashboardViewMode === "week"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--ink-light)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {t("Week", "주간")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardViewModeAndSave("month")}
                    className={`px-1 py-0.5 text-center min-w-[1.75rem] text-[8px] font-medium rounded-md leading-4 transition-colors ${
                      dashboardViewMode === "month"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--ink-light)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {t("Month", "월간")}
                  </button>
                </div>
              </div>
              {canSearchSummary ? (
                <div className="border-b border-[var(--border)] px-3 py-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      value={dashboardQuery}
                      onChange={(e) => setDashboardQuery(e.target.value)}
                      className="n-input w-full pl-8"
                      placeholder=""
                      aria-label={t("Search summary", "요약 검색")}
                    />
                  </div>
                </div>
              ) : null}
              {monthError && <p className="px-3 pb-2 text-xs text-[var(--danger)]">{monthError}</p>}
              <div className="px-3 pb-3 max-h-[640px] overflow-y-auto">
                {hasAdvancedSummary ? (
                  <>
                    {topThreeActivities.length > 0 ? (
                      <div className="mb-3 rounded-lg border border-[var(--border)] p-2">
                        <p className="mb-2 text-xs text-[var(--muted)]">{t("Top 3 activities", "상위 3개 활동")}</p>
                        <div className="grid gap-1">
                          {topThreeActivities.map((item) => (
                            <div key={item.emoji} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-[var(--ink)]">
                                {item.emoji} {item.label ? `- ${item.label}` : ""}
                              </span>
                              <span className="text-[var(--ink)] font-semibold">{formatHoursLabel(item.hours)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="grid gap-3">
                  {displayedDays.map((day) => {
                    const rowActivities = monthActivitiesByDate[day] ?? [];
                    const memoLines = splitMemoLines(monthJournalByDate[day] ?? "");
                    const isActive = day === selectedDate;
                    const date = new Date(`${day}T00:00:00`);

                    const displayActivities = Object.values(
                      rowActivities.reduce<Record<string, UiActivity>>((acc, item) => {
                        const key = item.emoji;
                        if (!acc[key]) {
                          acc[key] = { ...item };
                          return acc;
                        }
                        acc[key] = {
                          ...acc[key],
                          hours: acc[key].hours + (Number(item.hours) || 0),
                          label: acc[key].label || item.label
                        };
                        return acc;
                      }, {})
                    )
                      .filter((item) => item.hours > 0)
                      .sort((a, b) => a.emoji.localeCompare(b.emoji));

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDate(day)}
                        className={[
                          "w-full text-left rounded-lg border p-4",
                          "border-[var(--border)]",
                          isActive ? "bg-[var(--bg-selected)]" : "bg-transparent"
                        ].join(" ")}
                      >
                        <p className={`text-xs leading-5 font-medium ${isActive ? "text-[var(--primary)]" : "text-[var(--ink)]"}`}>
                          {prettyDateLabel(day, appLocale)}
                        </p>

                        <div className="mt-2">
                          <p className="text-xs leading-5 font-medium text-[var(--ink)]">{t("Summary", "요약")}</p>
                          {displayActivities.length === 0 ? (
                            <p className="break-words text-[11px] leading-5 text-[var(--ink)]">{t("Rest", "휴식")}</p>
                          ) : (
                            <div className="mt-1 grid gap-1">
                              {displayActivities.map((activity) => (
                                <div
                                  key={`${day}-${activity.emoji}`}
                                  className="min-w-0 grid items-start gap-2 text-[11px] leading-5 text-[var(--ink)]"
                                  style={{ gridTemplateColumns: "1.25rem 3.5rem 6rem minmax(0, 1fr)" }}
                                >
                                  <span className="w-5 text-base leading-5">{activity.emoji}</span>
                                  <span className="w-14 shrink-0 whitespace-nowrap text-[11px] leading-5">{formatHoursLabel(activity.hours)}</span>
                                  <span className="w-24 text-[11px] leading-5 text-[var(--muted)]">[{formatActivityTimeWindow(activity)}]</span>
                                {activity.label?.trim() ? (
                                    <span className="min-w-0 break-words text-[11px] leading-5 text-[var(--muted)]">{`- ${activity.label}`}</span>
                                  ) : (
                                    <span className="min-w-0" />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-3">
                          <p className="text-xs leading-5 font-medium text-[var(--ink)]">{t("Notes", "노트")}</p>
                          {memoLines.length === 0 ? (
                            <p className="break-words text-[11px] leading-5 text-[var(--ink)]">{t("No notes", "노트 없음")}</p>
                          ) : (
                            <div className="mt-1 grid gap-1">
                              {memoLines.slice(0, 2).map((line, index) => (
                                <p
                                  key={`${day}-memo-${index}`}
                                  className="break-words text-[11px] leading-5 text-[var(--ink)]"
                                >{`- ${line.replace(/^-\s*/, "")}`}</p>
                              ))}
                              {memoLines.length > 2 ? <p className="text-[11px] leading-5 text-[var(--muted)]">...</p> : null}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                {!displayedDays.length && (
                  <div className="text-xs text-[var(--muted)]">{t("No data", "데이터 없음")}</div>
                )}
              </div>
              <div className="border-t border-[var(--border)] px-3 py-3">
                <p className="mb-2 text-xs leading-5 font-medium text-[var(--ink)]">{displayedSummaryLabel}</p>
                {filteredSummaryActivities.length === 0 ? (
                  <p className="text-[11px] leading-5 text-[var(--muted)]">{displayedSummaryEmptyText}</p>
                ) : (
                  <div className="grid gap-1">
                    {filteredSummaryActivities.map((item) => (
                      <div
                        key={item.emoji}
                        className="grid min-w-0 items-start gap-2 justify-items-start"
                        style={{ gridTemplateColumns: "1.25rem minmax(0, 1fr) auto" }}
                      >
                        <span className="text-base leading-5">{item.emoji}</span>
                        <span className="min-w-0 break-words text-[11px] leading-5 text-[var(--muted)]">
                          {item.label ? `- ${item.label}` : ""}
                        </span>
                        <span className="text-left text-[11px] leading-5 text-[var(--ink)] whitespace-nowrap">{formatHoursLabel(item.hours)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {topDayByEmoji.length > 0 && (
                <>
                  <div className="n-divider mx-3" />
                  <div className="px-3 py-3">
                    <p className="mb-2 text-xs leading-5 font-medium text-[var(--ink)]">
                      {dashboardViewMode === "week"
                        ? t("Most active day (week)", "주간 최고 활동일")
                        : t("Most active day (month)", "월간 최고 활동일")}
                    </p>
                    <div className="grid gap-1.5">
                      {topDayByEmoji.map((item) => {
                        const d = new Date(`${item.date}T00:00:00`);
                        const label = `${d.getMonth() + 1}/${d.getDate()}`;
                        return (
                          <div
                            key={item.emoji}
                            className="flex items-center gap-2 text-[11px] leading-5"
                          >
                            <span className="text-base">{item.emoji}</span>
                            <span className="text-[var(--ink)]">{label}</span>
                            <span className="text-[var(--muted)]">({formatHoursLabel(item.hours)})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
                  </div>
          </section>
          ) : null}

        </div>
      </div>

      {/* 전역 검색 모달 */}
      {isSearchOpen && (
        <SearchModal
          session={session}
          appLanguage={appLanguage}
          onClose={() => setIsSearchOpen(false)}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setIsSearchOpen(false);
          }}
        />
      )}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-[var(--bg)]/96 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid h-14 w-full max-w-5xl grid-cols-4">
              {diaryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDiaryTab(tab.id)}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 border-l border-[var(--border)] last:border-r-0 text-[10px] font-semibold tracking-wide transition-colors ${
                activeDiaryTab === tab.id
                  ? "text-[var(--ink)]"
                  : "text-[var(--muted)]"
              }`}
            >
                <tab.icon className="h-4 w-4" strokeWidth={2.1} />
              <span className="px-1 text-[8px] leading-3 sm:text-[9px] sm:leading-4">{tab.compactLabel ?? tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 통계 모달 */}
      {isStatsOpen && (
        <StatsModal
          session={session}
          selectedDate={selectedDate}
          appLanguage={appLanguage}
          onClose={() => setIsStatsOpen(false)}
        />
      )}
    </main>
  );
}
