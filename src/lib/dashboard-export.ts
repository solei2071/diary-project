import type { SupabaseClient } from "@supabase/supabase-js";

export type DashboardRangeMode = "week" | "month";

export type DashboardExportRange = {
  mode: DashboardRangeMode;
  selectedDate: string;
  start: string;
  end: string;
  dates: string[];
};

export type DashboardExportRow = {
  date: string;
  emoji: string;
  label: string;
  start: string;
  end: string;
  durationHours: number;
  durationMinutes: number;
  weekday: string;
};

export type DashboardExportSummaryItem = {
  emoji: string;
  hours: number;
  label: string;
};

export type DashboardExportSummary = {
  totalHours: number;
  activeDays: number;
  longestStreak: number;
  restDayRatio: number;
  topActivities: DashboardExportSummaryItem[];
};

export type DashboardExportPayload = {
  generatedAt: string;
  rangeMode: DashboardRangeMode;
  rangeStart: string;
  rangeEnd: string;
  summary: DashboardExportSummary;
  rows: DashboardExportRow[];
};

export type ExportAuditStatus = "success" | "error";
export type DashboardExportAuditRecord = {
  id: string;
  at: string;
  userId: string;
  mode: DashboardRangeMode;
  format: "json" | "csv";
  rangeStart: string;
  rangeEnd: string;
  rows: number;
  filename: string;
  status: ExportAuditStatus;
  error?: string;
};

type ActivityDbRow = {
  id: string;
  user_id: string;
  activity_date: string;
  emoji: string;
  label: string;
  hours: number | string;
  start_time?: string | null;
  end_time?: string | null;
  updated_at?: string | null;
};

const EXPORT_AUDIT_STORAGE_KEY = "diary-admin-export-audit";
const EXPORT_AUDIT_MAX_ENTRIES = 5;
const DASHBOARD_EXPORT_MAX_ROWS = 10000;
const LOCAL_DATE_MINUTES_IN_DAY = 24 * 60;

const toLocalDateString = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

const normalizeClock = (value?: string | null) => {
  if (!value) return "00:00";
  const parts = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return "00:00";
  const hour = Number.parseInt(parts[1], 10);
  const minute = Number.parseInt(parts[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return "00:00";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "00:00";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const toMinutes = (value: string) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return 0;
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  return (hour * 60 + minute) % LOCAL_DATE_MINUTES_IN_DAY;
};

const fromMinutes = (value: number) => {
  const next = ((value % LOCAL_DATE_MINUTES_IN_DAY) + LOCAL_DATE_MINUTES_IN_DAY) % LOCAL_DATE_MINUTES_IN_DAY;
  const hour = Math.floor(next / 60);
  const minute = next % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const calculateEndTime = (startTime: string, hours: number) => {
  const startMinutes = toMinutes(startTime);
  const durationMinutes = Math.round(Math.max(0, hours) * 60);
  return fromMinutes(startMinutes + durationMinutes);
};

const formatDurationMinutes = (rawHours: number) => {
  const normalized = Number.isFinite(rawHours) ? Math.max(0, rawHours) : 0;
  const totalMinutes = Math.round(normalized * 60);
  return Number((totalMinutes / 60).toFixed(2));
};

const getWeekRange = (selectedDate: string): string[] => {
  const date = new Date(`${selectedDate}T00:00:00`);
  const dayOfWeek = date.getDay();
  const offset = (dayOfWeek + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return toLocalDateString(current);
  });
};

const getMonthRange = (selectedDate: string): string[] => {
  const parsed = new Date(`${selectedDate}T00:00:00`);
  const start = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  const endDate = new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0);
  const days = endDate.getDate();
  return Array.from({ length: days }, (_, index) => {
    const current = new Date(start);
    current.setDate(index + 1);
    return toLocalDateString(current);
  });
};

export const buildExportRange = (mode: DashboardRangeMode, selectedDate: string): DashboardExportRange => {
  const target = selectedDate || toLocalDateString(new Date());
  const dates = mode === "week" ? getWeekRange(target) : getMonthRange(target);
  return {
    mode,
    selectedDate: target,
    start: dates[0] ?? target,
    end: dates[dates.length - 1] ?? target,
    dates
  };
};

export const buildDashboardRowsByRange = async (
  client: SupabaseClient,
  userId: string,
  range: DashboardExportRange
): Promise<DashboardExportRow[]> => {
  const { data, error } = await client
    .from("daily_activities")
    .select("id,user_id,activity_date,emoji,label,hours,start_time,end_time,updated_at")
    .eq("user_id", userId)
    .gte("activity_date", range.start)
    .lte("activity_date", range.end)
    .order("activity_date", { ascending: true })
    .order("updated_at", { ascending: true });

  if (error) {
    throw new Error(error.message || "Failed to fetch activities");
  }

  const rows = (data ?? []).map((raw) => {
    const row = raw as ActivityDbRow;
    const hoursRaw = Number(row.hours ?? 0);
    const hours = Number.isFinite(hoursRaw) ? Math.max(0, hoursRaw) : 0;
    const start = normalizeClock(row.start_time);
    const end = normalizeClock(row.end_time);
    const effectiveEnd = end && end !== "00:00" ? end : calculateEndTime(start, hours);
    return {
      date: row.activity_date,
      emoji: row.emoji,
      label: String(row.label ?? "").trim(),
      start,
      end: effectiveEnd,
      durationHours: formatDurationMinutes(hours),
      durationMinutes: Math.max(0, Math.round(hours * 60)),
      weekday: new Date(`${row.activity_date}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "short"
      })
    };
  });

  if (rows.length > DASHBOARD_EXPORT_MAX_ROWS) {
    throw new Error(`Data too large. ${rows.length} rows returned.`);
  }

  return rows;
};

export const buildDashboardSummary = (
  rows: DashboardExportRow[],
  range: DashboardExportRange
): DashboardExportSummary => {
  const totalHours = Number(
    rows.reduce((acc, row) => acc + (Number(row.durationHours) || 0), 0).toFixed(2)
  );
  const activeDays = range.dates.filter((date) =>
    rows.some((row) => row.date === date && Number(row.durationHours) > 0)
  ).length;

  let longestStreak = 0;
  let currentStreak = 0;
  for (const day of range.dates) {
    const hasActivity = rows.some((row) => row.date === day && row.durationHours > 0);
    if (hasActivity) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const byEmoji = new Map<string, { hours: number; label: string }>();
  rows.forEach((row) => {
    const item = byEmoji.get(row.emoji) ?? { hours: 0, label: "" };
    item.hours += Number(row.durationHours) || 0;
    if (!item.label && row.label) {
      item.label = row.label;
    }
    byEmoji.set(row.emoji, item);
  });
  const topActivities = Array.from(byEmoji.entries())
    .map(([emoji, item]) => ({
      emoji,
      hours: Number(item.hours.toFixed(2)),
      label: item.label
    }))
    .sort((a, b) => b.hours - a.hours || a.emoji.localeCompare(b.emoji))
    .slice(0, 20);

  const restDayRatio = range.dates.length
    ? Math.round(((range.dates.length - activeDays) / range.dates.length) * 100)
    : 0;

  return {
    totalHours,
    activeDays,
    longestStreak,
    restDayRatio,
    topActivities
  };
};

export const buildDashboardPayload = (
  rows: DashboardExportRow[],
  range: DashboardExportRange,
  summary?: DashboardExportSummary
): DashboardExportPayload => {
  return {
    generatedAt: new Date().toISOString(),
    rangeMode: range.mode,
    rangeStart: range.start,
    rangeEnd: range.end,
    summary: summary ?? buildDashboardSummary(rows, range),
    rows
  };
};

const escapeCsvValue = (value: string | number) => {
  const source = String(value ?? "").replace(/"/g, "\"\"");
  return `"${source}"`;
};

export const buildDashboardCsv = (payload: DashboardExportPayload) => {
  const header = [
    "date",
    "weekday",
    "emoji",
    "label",
    "start",
    "end",
    "duration_hours",
    "duration_minutes"
  ];
  const rows = payload.rows.map((row) =>
    [
      escapeCsvValue(row.date),
      escapeCsvValue(row.weekday),
      escapeCsvValue(row.emoji),
      escapeCsvValue(row.label),
      escapeCsvValue(row.start),
      escapeCsvValue(row.end),
      row.durationHours,
      row.durationMinutes
    ].join(",")
  );
  return `${header.join(",")}\n${rows.join("\n")}`;
};

export const downloadTextFile = (mime: string, filename: string, content: string) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(blob);
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const loadExportAudit = (): DashboardExportAuditRecord[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXPORT_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DashboardExportAuditRecord[];
    return Array.isArray(parsed) ? parsed.slice(0, EXPORT_AUDIT_MAX_ENTRIES) : [];
  } catch {
    return [];
  }
};

export const appendExportAudit = (record: Omit<DashboardExportAuditRecord, "id">) => {
  if (typeof window === "undefined") return;
  try {
    const list = loadExportAudit();
    const next = [
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...record },
      ...list
    ].slice(0, EXPORT_AUDIT_MAX_ENTRIES);
    window.localStorage.setItem(EXPORT_AUDIT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
};
