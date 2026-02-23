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

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Save } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import type { DailyActivityRow, JournalRow } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const initialDate = new Date().toISOString().slice(0, 10); // 오늘 날짜 YYYY-MM-DD

/** 날짜 문자열을 읽기 쉬운 형식으로 변환 (예: 2/17 (Mon)) */
function prettyDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()} (${date.toLocaleDateString("en-US", {
    weekday: "short"
  })})`;
}

/** 해당 월의 모든 날짜 배열 반환 (YYYY-MM-DD[]) — 대시보드 일별 행 렌더링용 */
function getMonthRangeDates(value: string) {
  const selected = new Date(`${value}T00:00:00`);
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const dayCount = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate(); // 해당 월 일수
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(monthStart.getTime());
    date.setDate(index + 1);
    return date.toISOString().slice(0, 10);
  });
}

function normalizeMonthLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const defaultActivities = ["💻", "🕍", "🔆", "🥋", "🏋️", "🍷", "🍻", "🍸", "🍺"];

type SeedDayData = {
  activities: Array<Pick<UiActivity, "emoji" | "hours" | "label">>;
  memo: string[];
};

const sampleFebruary2026: Record<string, SeedDayData> = {
  "01": { activities: [{ emoji: "🥋", hours: 1, label: "" }], memo: [] },
  "02": {
    activities: [
      { emoji: "🕍", hours: 1, label: "" },
      { emoji: "🏋️", hours: 1, label: "" },
      { emoji: "💻", hours: 1, label: "" },
      { emoji: "🔆", hours: 2, label: "" }
    ],
    memo: []
  },
  "03": {
    activities: [
      { emoji: "🕍", hours: 1, label: "" },
      { emoji: "🏋️", hours: 1, label: "" },
      { emoji: "💻", hours: 1, label: "" }
    ],
    memo: []
  },
  "04": {
    activities: [
      { emoji: "🕍", hours: 1, label: "" },
      { emoji: "🏋️", hours: 1, label: "" },
      { emoji: "💻", hours: 3, label: "" },
      { emoji: "🥋", hours: 1, label: "" }
    ],
    memo: [
      "Cursor subscribed, anti gravity?",
      "Cursor lecture study and learn git * Git"
    ]
  },
  "05": {
    activities: [
      { emoji: "💻", hours: 5, label: "" },
      { emoji: "🔆", hours: 1, label: "" },
      { emoji: "🥋", hours: 1, label: "" }
    ],
    memo: ["Git . Open Ai Api Add * API"]
  },
  "06": {
    activities: [
      { emoji: "💻", hours: 3, label: "" },
      { emoji: "🔆", hours: 1, label: "" },
      { emoji: "🍷", hours: 1, label: "" },
      { emoji: "🍻", hours: 1, label: "" }
    ],
    memo: ["Versel . * Versel"]
  },
  "07": {
    activities: [{ emoji: "🤿", hours: 1, label: "" }, { emoji: "💻", hours: 1, label: "" }],
    memo: ["Supabase"]
  },
  "08": {
    activities: [
      { emoji: "🕍", hours: 1, label: "" },
      { emoji: "💻", hours: 3, label: "" },
      { emoji: "🍸", hours: 1, label: "" }
    ],
    memo: ["Study Stacks"]
  },
  "09": {
    activities: [
      { emoji: "🕍", hours: 1, label: "" },
      { emoji: "💻", hours: 3, label: "" },
      { emoji: "🔆", hours: 1, label: "" },
      { emoji: "🥋", hours: 1, label: "" }
    ],
    memo: ["Claude Code Sub"]
  },
  "10": {
    activities: [{ emoji: "🕍", hours: 1, label: "" }, { emoji: "💻", hours: 2, label: "" }],
    memo: ["Inflearn JS let start"]
  },
  "11": {
    activities: [
      { emoji: "🕍", hours: 1, label: "" },
      { emoji: "💻", hours: 1, label: "" },
      { emoji: "🔆", hours: 3, label: "" },
      { emoji: "🥋", hours: 1, label: "" }
    ],
    memo: []
  },
  "12": {
    activities: [{ emoji: "💻", hours: 3, label: "" }, { emoji: "🔆", hours: 3, label: "" }],
    memo: []
  },
  "13": {
    activities: [{ emoji: "🕍", hours: 1, label: "" }, { emoji: "🥋", hours: 1, label: "" }],
    memo: ["Codex Install"]
  },
  "14": {
    activities: [{ emoji: "💻", hours: 3, label: "" }],
    memo: ["Using Codex . First Deploy the project"]
  },
  "15": {
    activities: [{ emoji: "💻", hours: 6, label: "" }, { emoji: "🥋", hours: 1, label: "" }],
    memo: ["Used 70% Weekly Claude Token this week . Ad apply"]
  },
  "16": {
    activities: [{ emoji: "💻", hours: 4, label: "" }],
    memo: ["Making Stock Chart"]
  },
  "17": {
    activities: [{ emoji: "💻", hours: 4, label: "" }],
    memo: ["Tried Ollama"]
  },
  "18": {
    activities: [{ emoji: "💻", hours: 4, label: "" }, { emoji: "🥋", hours: 1, label: "" }],
    memo: ["Maxim. . Family Lunch"]
  },
  "19": {
    activities: [],
    memo: ["Yh"]
  },
  "20": {
    activities: [{ emoji: "🕍", hours: 1, label: "" }],
    memo: []
  },
  "21": {
    activities: [{ emoji: "🕍", hours: 1, label: "" }, { emoji: "💻", hours: 1, label: "" }, { emoji: "🍺", hours: 1, label: "" }],
    memo: []
  },
  "22": {
    activities: [{ emoji: "🥋", hours: 1, label: "" }],
    memo: []
  },
  "23": {
    activities: [{ emoji: "🕍", hours: 1, label: "" }, { emoji: "💻", hours: 1, label: "" }],
    memo: []
  },
  "24": { activities: [], memo: [] },
  "25": { activities: [], memo: [] },
  "26": { activities: [], memo: [] },
  "27": { activities: [], memo: [] },
  "28": { activities: [], memo: [] }
};

const toSampleDateKey = (value: string) => {
  const [year, month, day] = value.split("-");
  if (year !== "2026" || month !== "02") return undefined;
  return day;
};

const getSeedForDate = (value: string) => {
  const day = toSampleDateKey(value);
  if (!day) return undefined;
  return sampleFebruary2026[day];
};

const toSampleDraftActivities = (value: string) => {
  const seed = getSeedForDate(value);
  if (!seed) return undefined;
  return seed.activities.map((item) => ({
    id: `seed-${value}-${item.emoji}`,
    activity_date: value,
    emoji: item.emoji,
    label: item.label,
    hours: item.hours
  }));
};

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
    items.push(current.toISOString().slice(0, 10));
  }
  return items;
}

/** 월 이동 (diff: -1 이전 달, +1 다음 달) */
function shiftMonth(baseMonth: string, diff: number) {
  const date = new Date(`${baseMonth}-01T00:00:00`);
  date.setMonth(date.getMonth() + diff);
  return date.toISOString().slice(0, 10);
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
};

type UiActivityDraft = {
  id: string;
  activity_date: string;
  emoji: string;
  label: string;
  hours: number;
};

type Props = {
  session: Session | null;
  onRequestAuth: () => void; // 비로그인 시 저장 요청 시 부모가 로그인 모달 띄우도록 호출
};

/** 시간 값을 0.5 단위로 반올림 (1.3 → 1.5, 1.7 → 2) */
function normalizeHourInput(value: number) {
  return Math.max(0, Math.round(value * 2) / 2);
}

export default function DailyDiary({ session, onRequestAuth }: Props) {
  const user = session?.user ?? null;
  const isGuest = !user;
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [todos, setTodos] = useState<UiTodo[]>([]);
  const [activities, setActivities] = useState<UiActivity[]>([]);
  const [isLoadingTodos, setIsLoadingTodos] = useState(true);
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
  const [customEmoji, setCustomEmoji] = useState("📝");
  const [customHours, setCustomHours] = useState("1");
  const [activityLabelEditingByDate, setActivityLabelEditingByDate] = useState<Record<string, boolean>>({});
  const activityListRef = useRef<HTMLDivElement | null>(null);
  const activityTrashRef = useRef<HTMLDivElement | null>(null);
  const [isDraggingActivity, setIsDraggingActivity] = useState(false);
  const [isOverActivityTrash, setIsOverActivityTrash] = useState(false);
  const [activityContextMenu, setActivityContextMenu] = useState<{
    x: number;
    y: number;
    activity: UiActivity;
  } | null>(null);
  const currentMonth = selectedDate.slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  const calendarDays = useMemo(() => getMonthDaysForCalendar(currentMonth), [currentMonth]);

  /** 같은 이모지의 여러 행을 합산해 하나의 UiActivity로 */
  const normalizeActivities = (rows: DailyActivityRow[]) =>
    Object.values(
      rows.reduce<Record<string, UiActivity>>((acc, row) => {
      const key = row.emoji;
      if (!acc[key]) {
        acc[key] = {
          id: row.id,
            emoji: row.emoji,
            label: row.label,
            hours: Number(row.hours) || 0
          };
        } else {
          acc[key] = {
            ...acc[key],
            hours: acc[key].hours + (Number(row.hours) || 0)
          };
        }
        return acc;
      }, {})
    );

  /** 월별 활동을 날짜별로 그룹화 (대시보드용) */
  const normalizeActivitiesByMonth = (rows: DailyActivityRow[]) => {
    const grouped = rows.reduce<Record<string, UiActivity[]>>((acc, row) => {
      const target = (acc[row.activity_date] ?? []);
      const merged = (() => {
        const key = row.emoji;
        const exists = target.find((item) => item.emoji === key);
        if (!exists) {
          return [
            ...target,
            {
              id: row.id,
              emoji: row.emoji,
              label: row.label,
              hours: Number(row.hours) || 0
            }
          ];
        }
        return target.map((item) =>
          `${item.emoji}:${item.label}` === key
            ? {
                ...item,
                hours: item.hours + (Number(row.hours) || 0)
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

  const formatFlowActivityText = (items: UiActivity[]) => {
    if (!items.length) return "Rest";
    return items
      .filter((item) => item.hours > 0)
      .map((item) => `${item.emoji}${item.hours === 1 ? "1" : ` ${item.hours}`}`)
      .join(" ");
  };

  const splitMemoLines = (value: string) =>
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  /** 선택한 날짜의 To-do, 일기, 활동 로드 (로그인 시 Supabase, 비로그인 시 draft) */
  const loadData = async (targetDate: string) => {
    setTodoError("");
    setJournalError("");
    setActivityError("");

    if (!user) {
      setIsLoadingTodos(false);
      const seed = getSeedForDate(targetDate);
      const seededTodos = draftTodosByDate[targetDate];
      const seededJournal = draftJournalByDate[targetDate];
      const seededActivities = draftActivitiesByDate[targetDate];

      setTodos(seededTodos ?? []);
      setJournalText(seededJournal ?? (seed ? seed.memo.join("\n") : ""));
      if (seededActivities?.length) {
        setActivities(seededActivities.map((item) => ({ ...item })));
      } else if (seed) {
        setActivities(seed.activities.map((item) => ({ ...item })));
      } else {
        setActivities([]);
      }
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
      setTodoError(todoResponse.error.message);
      setTodos([]);
    } else {
      setTodos(
        (todoResponse.data ?? []).map((item) => ({
          id: item.id,
          due_date: item.due_date,
          title: item.title,
          done: item.done
        }))
      );
    }

    if (journalResponse.error) {
      setJournalError(journalResponse.error.message);
      setJournalText("");
    } else if (journalResponse.data) {
      setJournalText((journalResponse.data as JournalRow).content ?? "");
    } else {
      setJournalText("");
    }

    if (activityResponse.error) {
      setActivityError(activityResponse.error.message);
      setActivities([]);
    } else {
      setActivities(normalizeActivities((activityResponse.data ?? []) as DailyActivityRow[]));
    }
  };

  /** 해당 월의 일별 활동/일기 요약 로드 (대시보드 리스트용) */
  const loadMonthFlow = async (targetDate: string) => {
    setMonthLoading(true);
    setMonthError("");

    const firstDay = new Date(`${targetDate}T00:00:00`);
    const monthStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1).toISOString().slice(0, 10);
    const nextMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 1).toISOString().slice(0, 10);

    if (!user) {
    const targetRange = getMonthRangeDates(targetDate);
    const activitiesByDate = Object.fromEntries(
      targetRange.map((day) => {
        const draftForDay = draftActivitiesByDate[day];
        const seed = getSeedForDate(day);
        return [
          day,
          draftForDay?.length
            ? draftForDay.map((item) => ({ ...item }))
            : seed
              ? toSampleDraftActivities(day) ?? []
              : []
        ];
      })
    );
    const journalByDate = Object.fromEntries(
      targetRange.map((day) => {
        const draftMemo = draftJournalByDate[day];
        if (draftMemo !== undefined) return [day, draftMemo];
        const seed = getSeedForDate(day);
        return [day, seed ? seed.memo.join("\n") : ""];
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
  };

  const updateDraftTodo = (items: UiTodo[]) => {
    setDraftTodosByDate((prev) => {
      const next = { ...prev, [selectedDate]: items };
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
      const mapped = items.map((item) => ({
        id: item.id ?? makeLocalTodoId(),
        activity_date: selectedDate,
        emoji: item.emoji,
        label: item.label,
        hours: item.hours
      }));
      const next = { ...prev, [selectedDate]: mapped };
      try { localStorage.setItem("diary-draft-activities", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadData(selectedDate);
    void loadMonthFlow(selectedDate);
  }, [selectedDate, user?.id]); // loadData/loadMonthFlow는 user?.id·selectedDate가 변할 때만 재호출이 의도된 동작

  const makeLocalTodoId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as Crypto).randomUUID();
    }
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
  };

/** 할 일 체크/해제 토글 (Optimistic UI: 즉시 반영 후 에러 시 롤백) */
  const toggleTodo = async (todo: UiTodo) => {
    const optimistic = todos.map((item) => (item.id === todo.id ? { ...item, done: !item.done } : item));
    setTodos(optimistic);
    setTodoError("");

    if (!user) {
      updateDraftTodo(optimistic);
      return;
    }

    const { error } = await supabase
      .from("todos")
      .update({ done: !todo.done })
      .eq("id", todo.id);

    if (error) {
      setTodos(todos); // 롤백
      setTodoError(error.message);
    }
  };

  /** 새 To-do 즉시 추가 */
  const addTodo = async () => {
    const title = newTodoTitle.trim();
    if (!title) {
      setTodoError("Please enter a task.");
      return;
    }
    setTodoError("");

    const next = [
      {
        id: makeLocalTodoId(),
        due_date: selectedDate,
        title,
        done: false
      },
      ...todos
    ];
    setTodos(next);
    setNewTodoTitle("");
    setIsAddingTodo(false);

    if (isGuest) {
      updateDraftTodo(next);
      return;
    }

    const { error } = await supabase.from("todos").insert({
      user_id: user.id,
      due_date: selectedDate,
      title,
      done: false
    });
    if (error) {
      setTodoError(error.message);
      await loadData(selectedDate);
      return;
    }
    await loadData(selectedDate);
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
      setJournalError(error.message);
      return;
    }
    await loadData(selectedDate);
  };

  const composeUpdatedActivities = (emoji: string, nextHours: number, nextLabel?: string) => {
    const hours = normalizeHourInput(nextHours);
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
              label: nextLabel !== undefined ? nextLabel : item.label
            }
          : item
      );
    }
    return [
      {
        id: makeLocalTodoId(),
        emoji,
        label: nextLabel?.trim() ?? "",
        hours
      },
      ...activities
    ];
  };

  const saveActivity = async (emoji: string, nextHours: number, nextLabel: string) => {
    if (!user) return;
    const hours = normalizeHourInput(nextHours);
    const label = nextLabel.trim();

    if (hours <= 0) {
      const { error } = await supabase.from("daily_activities").delete().eq("user_id", user.id).eq("activity_date", selectedDate).eq("emoji", emoji);
      if (error) {
        setActivityError(error.message);
        await loadData(selectedDate);
      }
      return;
    }

    const cleanupError = await supabase
      .from("daily_activities")
      .delete()
      .eq("user_id", user.id)
      .eq("activity_date", selectedDate)
      .eq("emoji", emoji);

    if (cleanupError.error) {
      setActivityError(cleanupError.error.message);
      await loadData(selectedDate);
      return;
    }

    const { error } = await supabase.from("daily_activities").upsert(
      {
        user_id: user.id,
        activity_date: selectedDate,
        emoji,
        label: label || "",
        hours
      },
      {
        onConflict: "user_id,activity_date,emoji,label"
      }
    );
    if (error) {
      setActivityError(error.message);
      await loadData(selectedDate);
    }
  };

  /** 활동 시간 갱신 (로컬 state + 로그인 시 DB 저장) */
  const updateActivity = (emoji: string, nextHours: number, nextLabel?: string) => {
    const updated = composeUpdatedActivities(emoji, nextHours, nextLabel);
    setActivities(updated);
    if (!user) {
      updateDraftActivities(updated);
      return;
    }
    void saveActivity(emoji, nextHours, nextLabel ?? activities.find((item) => item.emoji === emoji)?.label ?? "");
  };

  const setActivityHours = (activity: UiActivity, nextHours: number) => {
    updateActivity(activity.emoji, nextHours, activity.label);
  };

  /** 퀵 이모지 버튼 클릭: 기존 있으면 +1h, 없으면 새로 1h 추가 */
  const addActivityFromTemplate = (emoji: string) => {
    const keyItem = activities.find((item) => item.emoji === emoji);
    if (keyItem) {
      updateActivity(emoji, keyItem.hours + 1, keyItem.label);
    } else {
      updateActivity(emoji, 1, "");
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
      setActivityError("Please enter an emoji.");
      return;
    }

    const parsedHours = Number(customHours);
    if (Number.isNaN(parsedHours) || parsedHours <= 0) {
      setActivityError("Hours must be greater than 0.");
      return;
    }

    const label = "";
    const hours = Math.round(parsedHours * 2) / 2;
    const keyItem = activities.find((item) => item.emoji === emoji);
    updateActivity(emoji, keyItem ? keyItem.hours + hours : hours, keyItem ? keyItem.label : label);
    setCustomEmoji("");
    setCustomHours("1");
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
    if (user) {
      await saveActivity(activity.emoji, 0, activity.label);
    } else {
      updateDraftActivities(updated);
    }
  };

  const updateActivityLabel = (emoji: string, nextLabel: string) => {
    const updated = activities.map((item) => (item.emoji === emoji ? { ...item, label: nextLabel } : item));
    setActivities(updated);
    if (user) {
      return;
    }
    updateDraftActivities(updated);
  };

  const commitActivityLabel = (activity: UiActivity, nextLabel: string) => {
    updateActivityLabel(activity.emoji, nextLabel);
    if (user) {
      void saveActivity(activity.emoji, activity.hours, nextLabel);
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
    setJournalText(value);
    if (isGuest) {
      updateDraftJournal(value);
    }
  };

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

  const signOut = async () => {
    if (!session) return;
    await supabase.auth.signOut();
  };

  return (
    <main className="flex min-h-screen w-full flex-col">

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
              <div className="grid gap-1">
                {activities
                  .slice()
                  .sort((a, b) => a.emoji.localeCompare(b.emoji))
                  .map((activity) => (
                    <div
                      key={`${activity.emoji}-${activity.id ?? "no-id"}`}
                      className="min-w-0 grid items-start gap-2 text-xs leading-5 text-[var(--ink)]"
                      style={{ gridTemplateColumns: "1.25rem 2rem minmax(0, 1fr)" }}
                    >
                      <span className="row-span-1 w-5 text-base leading-5">{activity.emoji}</span>
                      <span className="row-span-1 w-6 text-xs leading-5 text-[var(--ink)]">{activity.hours}h</span>
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

          {/* 날짜 헤딩 */}
          <h2 className="text-base font-semibold text-[var(--ink)] fade-up">
            {prettyDateLabel(selectedDate)}
          </h2>

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
              {todoError && <p className="px-3 py-2 text-xs text-red-500">{todoError}</p>}
              {isAddingTodo ? (
                <div className="px-3 py-3">
                  <div className="flex gap-2">
                    <input
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
                      }}
                      className="n-btn-ghost shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <ul className="divide-y divide-[var(--border)]">
                {todos.length === 0 && <li className="px-3 py-3 n-empty">No tasks yet</li>}
                {todos.map((todo) => (
                  <li key={todo.id} className="group n-row px-3 py-3">
                    <label className="flex flex-1 cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={todo.done}
                        onChange={() => toggleTodo(todo)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                      />
                      <span className={`text-sm leading-6 ${todo.done ? "text-[var(--muted)] line-through" : "text-[var(--ink)]"}`}>
                        {todo.title}
                      </span>
                    </label>
                  </li>
              ))}
            </ul>
          </section>

          <div className="n-divider" />

          {/* ── Activity Log ── */}
          <section className="fade-up overflow-hidden rounded-lg border border-[var(--border)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3">
                <span className="n-h2">Activity Log</span>
                <span className="n-label normal-case tracking-normal">Hours</span>
              </div>
              {activityError && <p className="px-3 py-2 text-xs text-red-500">{activityError}</p>}
              <div className="grid divide-y divide-[var(--border)]">

                {/* Quick emoji buttons */}
                <div className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {defaultActivities.map((emoji) => {
                      const recorded = activities.find((item) => item.emoji === emoji);
                      return (
                        <button
                          key={emoji}
                          onClick={() => addActivityFromTemplate(emoji)}
                          className="n-btn-ghost gap-1 px-2.5 py-1.5 text-base"
                          title={`${emoji} add`}
                        >
                          {emoji}
                          {recorded?.hours ? (
                            <span className="n-tag n-tag--blue text-xs">{recorded.hours}h</span>
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
                      className="n-input w-24 shrink-0"
                      type="number"
                      min="0.5"
                      step="0.5"
                      placeholder="Hours"
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        void addCustomActivity();
                      }}
                    />
                    <button onClick={() => void addCustomActivity()} className="n-btn-primary shrink-0">
                      Add
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
              {activities.length > 0 ? (
                <div className="grid divide-y divide-[var(--border)]">
                  {activities.map((activity) => (
                      <div
                        key={activity.emoji}
                        className="px-0 py-1.5 cursor-grab active:cursor-grabbing"
                        draggable={!isActivityLabelEditing(activity)}
                        onDragStart={(event) => {
                          handleActivityDragStart();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", activity.emoji);
                        }}
                        onContextMenu={(event) => openActivityContextMenu(activity, event)}
                        onDragEnd={(event) => handleActivityDragEnd(activity, event)}
                      >
                        <div className="group flex items-center gap-1.5 px-3">
                          <span className="text-base">{activity.emoji}</span>
                          <button
                            onClick={() => setActivityHours(activity, activity.hours - 0.5)}
                            className="n-btn-ghost h-5 w-5 p-0 text-xs leading-none"
                          >
                            −
                          </button>
                          <span className="min-w-[1.75rem] text-center text-xs font-medium text-[var(--ink)]">{activity.hours}h</span>
                          <button
                            onClick={() => setActivityHours(activity, activity.hours + 0.5)}
                            className="n-btn-ghost h-5 w-5 p-0 text-xs leading-none"
                          >
                            +
                          </button>
                      </div>
                      <div className="px-3 pt-2 pl-11">
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
                            <button
                              type="button"
                              onClick={() => startActivityLabelEdit(activity)}
                              className="w-full rounded-md border border-transparent px-1 py-1 text-left text-xs leading-5 text-[var(--ink)] hover:bg-[var(--bg-hover)]"
                            >
                              <div className="min-w-0 grid grid-cols-[1.25rem_2rem_minmax(0,1fr)] items-start gap-2">
                                <span className="text-base">{activity.emoji}</span>
                                <span className="text-xs leading-5 font-medium text-[var(--ink)]">{activity.hours}h</span>
                                {activity.label ? (
                                  <span className="min-w-0 flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
                                    <span className="min-w-0 break-words">{`- ${activity.label}`}</span>
                                    <button
                                      onClick={() => removeActivity(activity)}
                                      className="ml-auto h-5 w-5 shrink-0 rounded text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                                      aria-label="Delete activity"
                                      type="button"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ) : (
                                  <span className="min-w-0" />
                                )}
                              </div>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="break-words text-xs leading-5 text-[var(--ink)]">Tap an emoji to log activity.</p>
                )}
                {activityContextMenu ? (
                  <div
                    className="fixed z-50 min-w-[130px] rounded-md border border-[var(--border)] bg-white p-1 shadow-lg dark:bg-slate-800"
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
              {journalError && <p className="px-3 py-2 text-xs text-red-500">{journalError}</p>}
              <div className="divide-y divide-[var(--border)]">
                <div className="px-3 py-3">
                  <textarea
                    value={journalText}
                    onChange={(e) => handleJournalChange(e.target.value)}
                    rows={8}
                    className="n-textarea"
                    placeholder="Write your tasks, notes, and reflection freely..."
                  />
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
              <div className="mb-2 flex items-center justify-between px-3 py-3">
                <p className="n-label">Dashboard</p>
                {monthLoading && <Loader2 className="h-3 w-3 animate-spin text-[var(--muted)]" />}
              </div>
              {monthError && <p className="px-3 pb-2 text-xs text-red-500">{monthError}</p>}
              <div className="px-3 pb-3">
                <div className="grid gap-3">
                  {monthDays.map((day) => {
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
                          "w-full text-left rounded-lg border p-3",
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
                                  style={{ gridTemplateColumns: "1.25rem 2rem minmax(0, 1fr)" }}
                                >
                                  <span className="w-5 text-base leading-5">{activity.emoji}</span>
                                  <span className="w-6 text-[11px] leading-5">{activity.hours}h</span>
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
                {!monthDays.length && (
                  <div className="text-xs text-[var(--muted)]">No data</div>
                )}
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
