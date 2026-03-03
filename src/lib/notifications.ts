/**
 * notifications.ts — 알림(리마인더) 관련 유틸
 *
 * - localStorage에 설정 저장
 * - Notification API 권한 요청
 * - 일일 리마인더 스케줄링 (앱이 열려있는 동안 유효)
 */

const STORAGE_KEY = "diary-notification-settings";
const DEFAULT_REMINDER_TIME = "20:00";

export type NotificationSettings = {
  enabled: boolean;
  reminderTime: string; // "HH:MM" 형식 (예: "20:00")
  lastShownDate: string | null; // "YYYY-MM-DD"
};

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  reminderTime: DEFAULT_REMINDER_TIME,
  lastShownDate: null
};

export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<NotificationSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // no-op
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** 오늘 날짜 YYYY-MM-DD */
function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const parseReminderTime = (value: string): [number, number] => {
  const fallback = DEFAULT_REMINDER_TIME.split(":").map((item) => Number.parseInt(item, 10));
  const [fallbackHour, fallbackMinute] = fallback;
  const [hourString, minuteString] = (value ?? "").trim().split(":");
  const hour = Number.parseInt(hourString ?? "", 10);
  const minute = Number.parseInt(minuteString ?? "", 10);

  const normalizedHour = Number.isNaN(hour) ? fallbackHour : Math.max(0, Math.min(23, hour));
  const normalizedMinute = Number.isNaN(minute) ? fallbackMinute : Math.max(0, Math.min(59, minute));
  return [normalizedHour, normalizedMinute];
};

/** 리마인더 알림 표시 (이미 오늘 보냈으면 스킵) */
export function showDailyReminder(settings: NotificationSettings): void {
  if (!settings.enabled) return;
  if (Notification.permission !== "granted") return;
  if (settings.lastShownDate === todayString()) return;

  try {
    const notification = new Notification("Daily Flow Diary", {
      body: "Time to record today's activities and reflections ✍️",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "daily-reminder",
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    // 오늘 날짜를 기록해서 중복 방지
    saveNotificationSettings({ ...settings, lastShownDate: todayString() });
  } catch {
    // no-op
  }
}

/** 리마인더 시간까지 남은 ms 계산 */
export function msUntilReminderTime(reminderTime: string): number {
  const [hour, minute] = parseReminderTime(reminderTime);

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);

  if (Number.isNaN(target.getTime())) {
    const fallback = DEFAULT_REMINDER_TIME.split(":").map((item) => Number.parseInt(item, 10));
    const fallbackHour = Number.isNaN(fallback[0]) ? 20 : fallback[0];
    const fallbackMinute = Number.isNaN(fallback[1]) ? 0 : fallback[1];
    return Math.max(
      0,
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), fallbackHour, fallbackMinute, 0).getTime() - now.getTime()
    );
  }

  if (target.getTime() <= now.getTime()) {
    // 오늘 알림 시간이 이미 지났으면 내일로
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}
