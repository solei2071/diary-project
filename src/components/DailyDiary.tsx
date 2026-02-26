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
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Palette,
  Save,
  Search,
  Settings,
  Trash2
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
const ACTIVITY_TEMPLATE_STORAGE_KEY = "diary-activity-templates";
const TODO_REPEAT_WEEKS = [1, 2, 3, 4, 5];
const TODO_REPEAT_DAY_LABELS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" }
];

const getSafeSupabaseError = (message?: string | null) => {
  if (!message) return "";
  const hasSchemaCachePrefix = message.includes("Could not find the table");
  const hasKnownTable =
    message.includes("public.daily_activities") ||
    message.includes("public.journal_entries") ||
    message.includes("public.todos");
  const inSchemaCache = message.includes("schema cache");
  return hasSchemaCachePrefix && hasKnownTable && inSchemaCache ? "" : message;
};

const shouldIgnoreSupabaseSchemaError = (message?: string | null) => {
  return getSafeSupabaseError(message) === "";
};

/** 날짜 문자열을 읽기 쉬운 형식으로 변환 (예: 2/17 (Mon)) */
function prettyDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()} (${date.toLocaleDateString("en-US", {
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

function formatWeekLabelBySelectedDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "short"
  }).format(date);
  const dayOfMonth = date.getDate();
  const weekOfMonth = Math.floor((dayOfMonth - 1) / 7) + 1;
  return `${monthLabel} Week ${weekOfMonth}`;
}

const ACTIVITY_STEP_OPTIONS = [1, 5, 10, 15, 20, 30, 45, 60] as const;
type ActivityStepMinutes = (typeof ACTIVITY_STEP_OPTIONS)[number];
const ACTIVITY_STEP_STORAGE_KEY = "diary-activity-step-minutes";

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function getMonthLabel(baseMonth: string) {
  const date = new Date(`${baseMonth}-01T00:00:00`);
  return date.toLocaleDateString("en-US", {
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

type ActivityTemplate = {
  id: string;
  name: string;
  emoji: string;
  hours: number;
  label: string;
  startTime?: string;
  endTime?: string;
};

type SyncScope = "journal" | "todo" | "activity";
type SyncConflictState = {
  scope: SyncScope;
  date: string;
};

type Props = {
  session: Session | null;
  onRequestAuth: () => void; // 비로그인 시 저장 요청 시 부모가 로그인 모달 띄우도록 호출
  symbolPlan?: UserSymbolPlan;
  planFeatures?: PlanFeatures;
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

const normalizeStoredTemplate = (entry: unknown): ActivityTemplate | null => {
  if (
    typeof entry !== "object" ||
    entry === null ||
    Array.isArray(entry)
  ) {
    return null;
  }

  const row = entry as Record<string, unknown>;
  if (
    typeof row.emoji !== "string" ||
    !row.emoji.trim() ||
    typeof row.name !== "string" ||
    !row.name.trim()
  ) {
    return null;
  }

  const rawStart = typeof row.startTime === "string" ? row.startTime : "00:00";
  const rawEnd = typeof row.endTime === "string" ? row.endTime : "00:00";
  const safeStart = rawStart.trim().match(/^\d{1,2}:\d{2}$/) ? rawStart.trim() : "00:00";
  const safeEnd = rawEnd.trim().match(/^\d{1,2}:\d{2}$/) ? rawEnd.trim() : "00:00";

  const rawId = typeof row.id === "string" ? row.id.trim() : "";
  const id = rawId.length > 0
    ? rawId
    : `template-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const rawHours = Number(row.hours ?? 0);
  const hours = normalizeActivityHours(Number.isFinite(rawHours) ? rawHours : 0);
  const label = typeof row.label === "string" ? row.label : "";

  return {
    id,
    name: row.name.trim(),
    emoji: row.emoji,
    hours,
    label,
    startTime: safeStart,
    endTime: safeEnd
  };
};

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

const buildSyncConflictMessage = (scope: SyncScope, date: string) => {
  const label = prettyDateLabel(date);
  return scope === "journal"
    ? `Another device changed Journal Notes for ${label}. Please reload before editing.`
    : scope === "todo"
      ? `Another device changed To-do for ${label}. Please reload before editing.`
      : `Another device changed Activity Log for ${label}. Please reload before editing.`;
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

/** 자동 포맷 시간 입력 (HH:MM) — 숫자만 허용, 자동 ":" 삽입, 4자리 완성 시 다음 필드 이동 */
function TimeInput({ value, onCommit, onAutoAdvance, ariaLabel }: {
  value: string; onCommit: (n: string) => void; onAutoAdvance?: () => void; ariaLabel: string;
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
      className="shrink-0 rounded border border-[var(--border)] bg-transparent text-center text-[var(--ink)] outline-none focus:border-[var(--primary)]"
      style={{ width: "5rem", height: "1.75rem", padding: "0 0.25rem", fontSize: "0.75rem" }}
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
};

function SwipeableTodoItem({ todo, onToggle, onDelete }: SwipeableTodoItemProps) {
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
          aria-label="Delete todo"
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
  planFeatures: planFeaturesOverride
}: Props) {
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
  const [journalText, setJournalText] = useState("");
  const [isSavingJournal, setIsSavingJournal] = useState(false);
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
  const [syncConflict, setSyncConflict] = useState<SyncConflictState | null>(null);
  const [customEmoji, setCustomEmoji] = useState("");
  const [customHours, setCustomHours] = useState("");
  const [customStartTime, setCustomStartTime] = useState("");
  const [customTemplateName, setCustomTemplateName] = useState("");
  const [activityLabelEditingByDate, setActivityLabelEditingByDate] = useState<Record<string, boolean>>({});
  const [todoRepeatDays, setTodoRepeatDays] = useState<number[]>([]);
  const [todoRepeatWeeks, setTodoRepeatWeeks] = useState<number>(TODO_REPEAT_WEEKS[1] ?? 1);
  const [activityConflictWarnings, setActivityConflictWarnings] = useState<Record<string, string>>({});
  const activityListRef = useRef<HTMLDivElement | null>(null);
  const activityTrashRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingActivity, setIsDraggingActivity] = useState(false);
  const [isOverActivityTrash, setIsOverActivityTrash] = useState(false);
  const [activitySwipeXByEmoji, setActivitySwipeXByEmoji] = useState<Record<string, number>>({});
  const activitySwipeStartRef = useRef<{ emoji: string; x: number; y: number } | null>(null);
  const activitySwipeLockRef = useRef<"h" | "v" | null>(null);
  const todoInputRef = useRef<HTMLInputElement | null>(null);
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
  const [dashboardQuery, setDashboardQuery] = useState("");
  const [activityLogQuery, setActivityLogQuery] = useState("");
  const [isTemplatePanelOpen, setIsTemplatePanelOpen] = useState(false);
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
  const canSearchSummary = planLimits.canSearch;
  const canUseTemplates = planLimits.canTemplates;
  const hasAdvancedSummary = planLimits.canAdvancedSummary;
  const canTodoRepeat = planLimits.canTodoRepeat;
  const [activityTemplates, setActivityTemplates] = useState<ActivityTemplate[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(ACTIVITY_TEMPLATE_STORAGE_KEY) : null;
        const parsed = raw ? (JSON.parse(raw) as Array<unknown>) : [];
        if (!Array.isArray(parsed)) {
          return [];
        }
        return parsed
          .map(normalizeStoredTemplate)
          .filter((item): item is ActivityTemplate => item !== null);
    } catch {
      return [];
    }
  });
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
    if (!canUseTemplates) {
      if (activityTemplates.length > 0) {
        setActivityTemplates([]);
        try {
          localStorage.removeItem(ACTIVITY_TEMPLATE_STORAGE_KEY);
        } catch {
          // no-op
        }
      }
      return;
    }

    try {
      localStorage.setItem(ACTIVITY_TEMPLATE_STORAGE_KEY, JSON.stringify(activityTemplates));
    } catch {
      // no-op
    }
  }, [activityTemplates, canUseTemplates]);

  const calendarDays = useMemo(() => getMonthDaysForCalendar(currentMonth), [currentMonth]);

  const formatMinutesToClock = (minutes: number) => {
    const normalized = ((Math.floor(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = Math.floor(normalized / 60).toString().padStart(2, "0");
    const minute = (normalized % 60).toString().padStart(2, "0");
    return `${hour}:${minute}`;
  };

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
    if (h === 0 && m === 0) return "0m";
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

  const calculateEndTimeFromHours = (startTime: string, hours: number) => {
    const normalizedStart = parseClockTimeToMinutes(formatStartTime(startTime));
    if (normalizedStart === null) {
      return undefined;
    }
    const totalMinutes = normalizedStart + Math.max(0, Math.round(hours * 60));
    const normalizedMinutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    return formatMinutesToClock(normalizedMinutes);
  };

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

  type ActivityWindow = {
    start: number;
    end: number;
  };

  const getActivityWindows = (activity: UiActivity): ActivityWindow[] | null => {
    const start = parseClockTimeToMinutes(formatStartTime(activity.startTime));
    if (start === null) return null;

    const parsedHours = normalizeActivityHours(activity.hours);
    const endCandidate = parseClockTimeToMinutes(getEffectiveEndTime(activity));

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

  const buildActivityConflictWarnings = (rows: UiActivity[]) => {
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
          warnings[leftEmoji] = `Time range overlaps with ${rightEmoji}`;
        }
        if (!warnings[rightEmoji]) {
          warnings[rightEmoji] = `Time range overlaps with ${leftEmoji}`;
        }
      }
    }

    return warnings;
  };

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
  const displayedSummaryLabel = dashboardViewMode === "week" ? "Weekly Summary" : "Monthly Summary";
  const displayedSummaryEmptyText =
    dashboardViewMode === "week" ? "No activity this week." : "No activity this month.";
  const weeklyRangeLabel = useMemo(() => {
    if (dashboardViewMode !== "week") return "";
    return formatWeekLabelBySelectedDate(selectedDate);
  }, [dashboardViewMode, selectedDate]);

  const monthlyRangeLabel = useMemo(() => {
    if (dashboardViewMode !== "month") return "";
    return new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString("en-US", {
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
  const doesActivityMatchQuery = (activity: UiActivity) => {
    if (!normalizedDashboardQuery) return true;
    const emoji = activity.emoji.toLowerCase();
    const label = activity.label.toLowerCase();
    return emoji.includes(normalizedDashboardQuery) || label.includes(normalizedDashboardQuery);
  };
  const filteredSummaryActivities = useMemo(
    () =>
      summaryActivities
        .filter(doesActivityMatchQuery)
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

  const activeTemplateItems = useMemo(() => (canUseTemplates ? activityTemplates : []), [activityTemplates, canUseTemplates]);

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
    if (!items.length) return "Rest";
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
        setJournalText("");
      }
      setJournalUpdatedAt(null);
    } else if (journalResponse.data) {
      setJournalUpdatedAt((journalResponse.data as JournalRow).updated_at ?? null);
      setJournalText((journalResponse.data as JournalRow).content ?? "");
    } else {
      setJournalUpdatedAt(null);
      setJournalText("");
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
      try { localStorage.setItem("diary-draft-todos", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const updateDraftJournal = (text: string) => {
    setDraftJournalByDate((prev) => {
      const next = { ...prev, [selectedDate]: text };
      try { localStorage.setItem("diary-draft-journal", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

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
      try { localStorage.setItem("diary-draft-activities", JSON.stringify(next)); } catch { /* ignore */ }
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
      .eq("id", todo.id);

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
    const prev = [...todos];
    const updated = todos.filter((t) => t.id !== todo.id);
    setTodos(updated);

    showToast("Task deleted", "info", {
      undoLabel: "Undo",
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
      const { error } = await supabase.from("todos").delete().eq("id", todo.id);
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
      setTodoError("Please enter a task.");
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
    setIsTodoDirty(true);
    showToast("Task added", "success");

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

  /** 일기 저장 (upsert: 있으면 수정, 없으면 삽입) */
  const saveJournal = async () => {
    if (!user) {
      setJournalError("Email login is required to save notes.");
      onRequestAuth();
      return;
    }

    setIsSavingJournal(true);
    setJournalError("");
    setIsJournalDirty(true);

    const hasConflict = await hasSyncConflictForSave("journal", selectedDate);
    if (hasConflict) {
      setIsSavingJournal(false);
      return;
    }

    const { error } = await supabase.from("journal_entries").upsert(
      {
        user_id: user.id,
        entry_date: selectedDate,
        content: journalText.trim()
      },
      {
        onConflict: "user_id,entry_date"
      }
    );

    setIsSavingJournal(false);
    if (error) {
      setJournalError(getSafeSupabaseError(error.message));
      setIsJournalDirty(false);
      return;
    }
    setIsJournalDirty(false);
    showToast("Notes saved", "success");
    await loadData(selectedDate);
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

    const hasConflict = await hasSyncConflictForSave("activity", selectedDate);
    if (hasConflict) {
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
          return;
        }
        await loadData(selectedDate);
        setIsActivityDirty(false);
      }
      setIsActivityDirty(false);
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
        return;
      }
      await loadData(selectedDate);
      setIsActivityDirty(false);
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
        return;
      }
      await loadData(selectedDate);
      setIsActivityDirty(false);
    }
    setIsActivityDirty(false);
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

  const addTemplateActivity = (template: ActivityTemplate) => {
    const keyItem = activities.find((item) => item.emoji === template.emoji);
    const startTime = normalizeStartTimeInput(template.startTime ?? "00:00");
    const calculatedEndTime = calculateEndTimeFromHours(startTime, template.hours) ?? "00:00";
    const endTime = normalizeStartTimeInput(template.endTime ?? calculatedEndTime);
    updateActivity(
      template.emoji,
      keyItem ? keyItem.hours + template.hours : template.hours,
      template.label,
      startTime,
      endTime
    );
    setActivityLabelEditingByDate((prev) => ({
      ...prev,
      [template.emoji]: Boolean(template.label)
    }));
  };

  const addTemplate = () => {
    if (!canUseTemplates) return;
    const emoji = customEmoji.trim();
    if (!emoji) {
      setActivityError("Please enter an emoji.");
      return;
    }

    const parsed = parseActivityDurationInput(customHours);
    if (!parsed || parsed.hours <= 0) {
      setActivityError("Invalid duration format. Use hours/minutes or HH:MM - HH:MM.");
      return;
    }

    const startTime = parsed.startTime ?? customStartTime;
    const endTime = parsed.endTime ?? calculateEndTimeFromHours(startTime, parsed.hours) ?? "00:00";
    const name = customTemplateName.trim() || `${emoji} ${formatHoursLabel(parsed.hours)}`;
    const nextTemplate: ActivityTemplate = {
      id: makeLocalTodoId(),
      name,
      emoji,
      hours: normalizeHourInput(parsed.hours),
      label: "",
      startTime: normalizeStartTimeInput(startTime),
      endTime: normalizeStartTimeInput(endTime)
    };
    setActivityTemplates((prev) => [nextTemplate, ...prev]);
    setCustomTemplateName("Default");
    setActivityError("");
  };

  const removeActivityTemplate = (templateId: string) => {
    setActivityTemplates((prev) => prev.filter((item) => item.id !== templateId));
  };

  /** 사용자 입력 이모지+시간으로 활동 추가 */
  const addCustomActivity = async () => {
    const emoji = customEmoji.trim();
    if (!emoji) {
      setActivityError("Please enter an emoji.");
      return;
    }

    const parsed = parseActivityDurationInput(customHours);
    if (!parsed || parsed.hours <= 0) {
      setActivityError("Invalid duration format. Use hours/minutes or HH:MM - HH:MM.");
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
    const cleanLabel = trimActivityLabel(nextLabel);
    const updated = activities.map((item) => (item.emoji === emoji ? { ...item, label: cleanLabel } : item));
    setActivities(updated);
    setIsActivityDirty(true);
    if (user) {
      return;
    }
    updateDraftActivities(updated);
    setIsActivityDirty(false);
  };

  const commitActivityLabel = (activity: UiActivity, nextLabel: string) => {
    const cleanLabel = trimActivityLabel(nextLabel);
    updateActivityLabel(activity.emoji, cleanLabel);
    setIsActivityDirty(true);
    if (user) {
      void saveActivity(activity.emoji, activity.hours, cleanLabel, activity.startTime ?? "00:00", activity.endTime);
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
    if (isGuest) {
      updateDraftJournal(next);
    }
  };

  // 날짜 전환 시 편집 상태 초기화 (이전 날짜의 편집 모드가 새 날짜에 남지 않도록)
  useEffect(() => {
    setActivityLabelEditingByDate({});
  }, [selectedDate]);

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
    setActivityConflictWarnings(buildActivityConflictWarnings(activities));
  }, [activities]);

  const signOut = async () => {
    if (!session) return;
    await supabase.auth.signOut();
  };
  const syncConflictMessage = syncConflict
    ? buildSyncConflictMessage(syncConflict.scope, syncConflict.date)
    : null;

  return (
    <main className="flex min-h-screen w-full flex-col">
      {syncConflictMessage ? (
        <div className="mx-auto mt-3 w-full max-w-5xl px-4">
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2 text-xs text-[var(--danger)] sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <p>{syncConflictMessage}</p>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => void resolveSyncConflict()} className="rounded-md border border-[var(--danger)] px-2 py-1 text-[10px] font-semibold">
                Reload now
              </button>
              <button onClick={cancelSyncConflict} className="rounded-md border border-[var(--danger)] px-2 py-1 text-[10px] font-semibold opacity-85">
                Keep editing
              </button>
            </div>
          </div>
        </div>
      ) : null}

          {/* ── Page Header ── */}
      <header className="n-page-header fade-in">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="n-label mb-1">Daily Flow</p>
            <h1 className="n-title">Diary</h1>
            <p className="n-body mt-1.5">
              {isGuest ? "Write without login, sync when saved" : user?.email}
            </p>
          </div>
          {session && (
            <button onClick={signOut} className="n-btn-ghost mb-0.5 shrink-0">
              Sign Out
            </button>
          )}
        </div>
      </header>

        {/* ── Main Layout: Sidebar + Content ── */}
      <div className="flex flex-1 flex-col gap-8 pt-4 lg:flex-row lg:items-start">

        {/* ── Left Sidebar: Calendar + Monthly Flow ── */}
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-60">
          {/* Activity summary (read-only) */}
          <div className="fade-up rounded-lg border border-[var(--border)] p-3">
            <p className="mb-1.5 text-xs leading-5 font-medium text-[var(--ink)]">{prettyDateLabel(selectedDate)}</p>
            <p className="mb-1 text-xs leading-5 font-medium text-[var(--ink)]">Today&apos;s activity summary</p>
            {activities.length === 0 ? (
              <p className="break-words text-xs leading-5 text-[var(--ink)]">No records yet</p>
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
            <p className="mb-1 text-xs leading-5 font-medium text-[var(--ink)]">Notes</p>
            {splitMemoLines(journalText).length === 0 ? (
              <p className="break-words text-[11px] leading-5 text-[var(--ink)]">No notes yet.</p>
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
          <div className="fade-up rounded-lg border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="n-label flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" />
                {getMonthLabel(currentMonth)}
              </span>
              <div className="flex items-center gap-0.5">
                <button onClick={() => setSelectedDate(shiftMonth(currentMonth, -1))} className="n-btn-ghost p-1" aria-label="Previous month">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => setSelectedDate(shiftMonth(currentMonth, 1))} className="n-btn-ghost p-1" aria-label="Next month">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="mb-0.5 grid grid-cols-7 text-center">
              {weekDays.map((d) => (
                <span key={d} className="py-1 text-[10px] font-medium text-[var(--muted)]">{d}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 border-t border-l border-[var(--border)]">
              {calendarDays.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} className="h-8" />;
                const isSelected = day === selectedDate;
                const isToday = day === today;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(day)}
                    className={[
                      "n-calendar-day",
                      "border-b border-r border-[var(--border)]",
                      isSelected ? "n-calendar-day--selected" : "",
                      !isSelected && isToday ? "n-calendar-day--today" : ""
                    ].join(" ")}
                  >
                    {new Date(`${day}T00:00:00`).getDate()}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">{prettyDateLabel(selectedDate)}</p>
          </div>

        </aside>

          {/* ── Right Main Content ── */}
        <div className="min-w-0 flex-1 space-y-8">

          {/* 날짜 헤딩 + 검색/통계 버튼 */}
          <div className="fade-up flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--ink)]">
              {prettyDateLabel(selectedDate)}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsStatsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)] transition-colors"
                aria-label="Open stats"
              >
                <span>📊</span>
                <span className="hidden sm:inline">Stats</span>
              </button>
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)] transition-colors"
                aria-label="Open search"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Search</span>
              </button>
            </div>
          </div>

          {/* ── To-do ── */}
          <section className="fade-up overflow-visible rounded-lg border border-[var(--border)]">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3">
              <span className="n-h2">To-do</span>
              <button
                onClick={() => setIsAddingTodo((prev) => !prev)}
                className="ml-auto n-btn-ghost px-2 py-1 text-sm"
                  aria-label="Add to-do"
                >
                  +
                </button>
                {isLoadingTodos && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted)]" />}
              </div>
              {todoError && <p className="px-3 py-2 text-xs text-[var(--danger)]">{todoError}</p>}
              {isAddingTodo ? (
                <div className="px-3 py-3">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {[...userSymbols]
                      .sort((a, b) => a.order - b.order)
                      .map((symbol) => (
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
                      placeholder="Add a task"
                      aria-label="Todo input"
                    />
                    <button onClick={() => void addTodo()} className="n-btn-primary shrink-0">
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setIsAddingTodo(false);
                        setNewTodoTitle("");
                        setTodoRepeatDays([]);
                        setTodoRepeatWeeks(TODO_REPEAT_WEEKS[1] ?? 1);
                      }}
                      className="n-btn-ghost shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="mt-2 rounded-lg border border-[var(--border)] p-2">
                    <p className="mb-1.5 text-xs text-[var(--muted)]">Repeat on</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TODO_REPEAT_DAY_LABELS.map((entry) => {
                        const active = todoRepeatDays.includes(entry.value);
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
                            {entry.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[var(--muted)]">for next</span>
                      <select
                        value={todoRepeatWeeks}
                        onChange={(event) => setTodoRepeatWeeks(Number(event.target.value))}
                        disabled={!canTodoRepeat}
                        className="n-input h-7 w-16 px-2 py-1 text-xs"
                      >
                        {TODO_REPEAT_WEEKS.map((week) => (
                          <option key={week} value={week}>
                            {week}w
                          </option>
                        ))}
                      </select>
                    </div>
                    {!canTodoRepeat ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">Repeat scheduling is available on Pro.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <ul>
                {todos.length === 0 ? (
                  <li className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                    <CheckCircle2 className="h-8 w-8 text-[var(--muted)] opacity-30" />
                    <p className="text-sm font-medium text-[var(--muted)]">No tasks yet</p>
                    <p className="text-xs text-[var(--muted)] opacity-60">Tap + to add your first task for today</p>
                  </li>
                ) : (
                  todos.map((todo) => (
                    <SwipeableTodoItem
                      key={todo.id}
                      todo={todo}
                      onToggle={() => void toggleTodo(todo)}
                      onDelete={() => void deleteTodo(todo)}
                    />
                  ))
                )}
              </ul>
          </section>

          <div className="n-divider" />

          {/* ── Activity Log ── */}
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3">
                <span className="n-h2">Activity Log</span>
                {canUseTemplates ? (
                  <button
                    onClick={() => setIsTemplatePanelOpen((prev) => !prev)}
                    className="ml-2 inline-flex items-center gap-1 rounded border border-[var(--primary)]/40 bg-[var(--primary)]/12 px-2 py-1 text-xs font-semibold text-[var(--primary)]"
                    aria-label="Toggle activity templates"
                  >
                    Templates
                  </button>
                ) : null}
                <button
                  onClick={() => setIsSymbolPickerOpen((prev) => !prev)}
                  className="ml-auto inline-flex items-center gap-1 rounded border border-[var(--primary)]/40 bg-[var(--primary)]/12 px-2 py-1 text-xs font-semibold text-[var(--primary)]"
                  aria-label="Customize symbols"
                >
                  <Palette className="h-3.5 w-3.5" />
                  <span>Customize</span>
                </button>
                <button
                  onClick={() => setIsActivityStepPickerOpen((prev) => !prev)}
                  className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--ink)] transition hover:bg-[var(--bg-hover)]"
                  aria-label="Activity step settings"
                  title="Set activity increment"
                  type="button"
                >
                  <Settings className="h-4 w-4" />
                </button>
                <input
                  value={activityLogQuery}
                  onChange={(e) => setActivityLogQuery(e.target.value)}
                  className="n-input ml-2 w-28 px-2 py-1.5 text-xs"
                  placeholder="Filter"
                  aria-label="Filter activity log"
                />
              </div>

              {isActivityStepPickerOpen ? (
                <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-[var(--ink)]">Activity step</p>
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => shiftActivityStep(-1)}
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                        aria-label="Decrease step"
                      >
                        {"<"}
                      </button>
                      <span className="n-tag n-tag--blue text-xs">{activityStepMinutes}m</span>
                      <button
                        type="button"
                        onClick={() => shiftActivityStep(1)}
                        className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                        aria-label="Increase step"
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
                    maxSymbols={symbolLimit}
                    labelCharacterLimit={planLimits.labelCharacterLimit}
                    onSymbolsChange={(updated) => {
                      setUserSymbols(updated);
                      saveUserSymbols(updated, symbolPlan, planLimits.symbolLimit);
                    }}
                    onClose={() => setIsSymbolPickerOpen(false)}
                  />
                </div>
              )}

              {activityError && <p className="px-3 py-2 text-xs text-[var(--danger)]">{activityError}</p>}
              <div className="grid divide-y divide-[var(--border)]">

                {/* Quick emoji buttons */}
                <div className="max-h-28 overflow-y-auto px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {[...userSymbols]
                      .sort((a, b) => a.order - b.order)
                      .map((symbol) => {
                      const recorded = activities.find((item) => item.emoji === symbol.emoji);
                      return (
                        <button
                          key={symbol.emoji}
                          onClick={() => addActivityFromTemplate(symbol.emoji)}
                          className="n-btn-ghost gap-1 px-2.5 py-1.5 text-base"
                          title={symbol.label ? `${symbol.emoji} ${symbol.label}` : `${symbol.emoji} add`}
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
                      onChange={(e) => setCustomEmoji(e.target.value.slice(0, 4))}
                      className="n-input w-20 shrink-0"
                      placeholder="Emoji"
                      aria-label="Emoji input"
                    />
                    <input
                      value={customHours}
                      onChange={(e) => setCustomHours(e.target.value)}
                      className="n-input w-48 shrink-0"
                      type="text"
                      placeholder="2h 25m / 02:00 - 04:00"
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
                      aria-label="Start time"
                      placeholder="Start"
                    />
                    <button onClick={() => void addCustomActivity()} className="n-btn-primary shrink-0">
                      Add
                    </button>
                  </div>
                  {canUseTemplates ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={customTemplateName}
                        onChange={(e) => setCustomTemplateName(e.target.value.slice(0, 20))}
                        className="n-input flex-1"
                        placeholder="Template name"
                        aria-label="Template name"
                      />
                      <button onClick={() => addTemplate()} className="n-btn-ghost shrink-0">
                        Save as template
                      </button>
                    </div>
                  ) : null}
                </div>

                {isTemplatePanelOpen && canUseTemplates ? (
                  <div className="border-b border-[var(--border)] px-3 py-3">
                    <p className="mb-2 text-xs leading-5 font-semibold text-[var(--ink)]">Templates</p>
                    {activeTemplateItems.length === 0 ? (
                      <p className="text-xs leading-5 text-[var(--muted)]">No templates yet.</p>
                    ) : (
                      <div className="grid gap-1.5">
                        {activeTemplateItems.map((template) => (
                          <div
                            key={template.id}
                            className="flex items-center gap-2 rounded border border-[var(--border)] px-2 py-1.5"
                          >
                            <button
                              onClick={() => addTemplateActivity(template)}
                              className="flex-1 text-left text-xs leading-5 text-[var(--ink)]"
                            >
                              <span className="mr-2">{template.emoji}</span>
                              <span className="font-semibold">{template.name}</span>
                              <span className="ml-2 text-[var(--muted)]">
                                {formatHoursLabel(template.hours)} [{template.startTime} - {template.endTime}]
                              </span>
                            </button>
                            <button
                              onClick={() => removeActivityTemplate(template.id)}
                              className="n-btn-danger h-6 w-6 shrink-0 p-0 rounded-full"
                              aria-label={`Remove ${template.name}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

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
                          aria-label="Delete activity"
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
                              const endInput = row?.querySelector<HTMLInputElement>('[aria-label="Activity end time"]');
                              if (endInput) endInput.focus();
                            }}
                            ariaLabel="Activity start time"
                          />
                          <span className="text-xs text-[var(--muted)]">–</span>
                          <TimeInput
                            value={getEffectiveEndTime(activity)}
                            onCommit={(v) => setActivityEndTime(activity, v)}
                            ariaLabel="Activity end time"
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
                                if (e.key !== "Enter") return;
                                e.preventDefault();
                                commitActivityLabel(activity, e.currentTarget.value);
                              }}
                                className="n-input text-xs"
                              placeholder="Write what you did and press Enter"
                              aria-label="Activity note input"
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
                                {activity.label ? activity.label : "Tap to add note..."}
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
                    {normalizedActivityLogQuery ? "No matches found" : "No activities logged"}
                  </p>
                  <p className="text-xs text-[var(--muted)] opacity-60">
                    {normalizedActivityLogQuery ? "Try a different keyword" : "Tap an emoji above to start tracking"}
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
                      remove
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
                    Drag here to delete
                  </div>
                ) : null}
              </div>
              </div>
            </section>

          <div className="n-divider" />

          {/* ── Notes ── */}
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="flex items-center border-b border-[var(--border)] px-3 py-3">
                <span className="n-h2">Notes</span>
              </div>
              {journalError && <p className="px-3 py-2 text-xs text-[var(--danger)]">{journalError}</p>}
              <div className="divide-y divide-[var(--border)]">
                <div className="px-3 py-3">
                  <textarea
                    value={journalText}
                    onChange={(e) => handleJournalChange(e.target.value)}
                    rows={8}
                    className="n-textarea"
                    placeholder="Write your tasks, notes, and reflection freely..."
                  />
                  <p className="mt-1 text-right text-xs text-[var(--muted)]">
                    {`${journalText.length}/${NOTE_CHAR_LIMIT}`}
                  </p>
                </div>
                <div className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={saveJournal} disabled={isSavingJournal} className="n-btn-primary">
                      <Save className="h-3.5 w-3.5" />
                      {isSavingJournal ? "Saving..." : "Save"}
                    </button>
                    {isGuest && (
                      <p className="text-xs text-[var(--muted)]">Sign in required to save</p>
                    )}
                  </div>
                </div>
              </div>
          </section>

          <div className="n-divider" />

          {/* ── Dashboard (daily flow) ── */}
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between px-3 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <p className="n-label">Dashboard</p>
                  {monthLoading && <Loader2 className="h-3 w-3 animate-spin text-[var(--muted)]" />}
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDate(
                        dashboardViewMode === "week"
                          ? shiftDateByDays(selectedDate, -7)
                          : shiftMonth(currentMonth, -1)
                      )
                    }
                    className="n-btn-ghost p-1"
                    aria-label={dashboardViewMode === "week" ? "Previous week" : "Previous month"}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-24 px-1 text-center text-[10px] leading-5 text-[var(--muted)]">
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
                    className="n-btn-ghost p-1"
                    aria-label={dashboardViewMode === "week" ? "Next week" : "Next month"}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex rounded-lg border border-[var(--border)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setDashboardViewModeAndSave("week")}
                    className={`px-3 py-1.5 text-center min-w-16 text-xs font-medium rounded-md transition-colors ${
                      dashboardViewMode === "week"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--ink-light)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardViewModeAndSave("month")}
                    className={`px-3 py-1.5 text-center min-w-16 text-xs font-medium rounded-md transition-colors ${
                      dashboardViewMode === "month"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--ink-light)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    Month
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
                      placeholder="Search emoji or label in summary"
                      aria-label="Search summary"
                    />
                  </div>
                </div>
              ) : null}
              {monthError && <p className="px-3 pb-2 text-xs text-[var(--danger)]">{monthError}</p>}
              <div className="px-3 pb-3 max-h-[640px] overflow-y-auto">
                {hasAdvancedSummary ? (
                  <>
                    <div className="mb-3 grid gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-4">
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="text-xs text-[var(--muted)]">Total hours</p>
                        <p className="text-base font-semibold text-[var(--ink)]">{formatHoursLabel(dashboardTotalHours)}</p>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="text-xs text-[var(--muted)]">Active days</p>
                        <p className="text-base font-semibold text-[var(--ink)]">
                          {dashboardActiveDays} / {displayedDays.length}
                        </p>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="text-xs text-[var(--muted)]">Longest streak</p>
                        <p className="text-base font-semibold text-[var(--ink)]">{dashboardLongestStreak}</p>
                      </div>
                      <div className="rounded-md border border-[var(--border)] p-2">
                        <p className="text-xs text-[var(--muted)]">Rest day ratio</p>
                        <p className="text-base font-semibold text-[var(--ink)]">{dashboardRestDayRatio}%</p>
                      </div>
                    </div>
                    {topThreeActivities.length > 0 ? (
                      <div className="mb-3 rounded-lg border border-[var(--border)] p-2">
                        <p className="mb-2 text-xs text-[var(--muted)]">Top 3 activities</p>
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
                          {`${date.getMonth() + 1}/${date.getDate()} (${date.toLocaleDateString("en-US", { weekday: "short" })})`}
                        </p>

                        <div className="mt-2">
                          <p className="text-xs leading-5 font-medium text-[var(--ink)]">Summary</p>
                          {displayActivities.length === 0 ? (
                            <p className="break-words text-[11px] leading-5 text-[var(--ink)]">Rest</p>
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
                          <p className="text-xs leading-5 font-medium text-[var(--ink)]">Notes</p>
                          {memoLines.length === 0 ? (
                            <p className="break-words text-[11px] leading-5 text-[var(--ink)]">None</p>
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
                  <div className="text-xs text-[var(--muted)]">No data</div>
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
                      {dashboardViewMode === "week" ? "Most active day (week)" : "Most active day (month)"}
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

        </div>
      </div>

      {/* 전역 검색 모달 */}
      {isSearchOpen && (
        <SearchModal
          session={session}
          onClose={() => setIsSearchOpen(false)}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setIsSearchOpen(false);
          }}
        />
      )}

      {/* 통계 모달 */}
      {isStatsOpen && (
        <StatsModal
          session={session}
          selectedDate={selectedDate}
          onClose={() => setIsStatsOpen(false)}
        />
      )}
    </main>
  );
}
