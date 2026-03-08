/**
 * notifications.ts — 알림(리마인더) 관련 유틸
 *
 * - localStorage에 설정 저장
 * - iOS 네이티브: @capacitor/local-notifications
 * - Web: Notification API
 */

const STORAGE_KEY = "diary-notification-settings";
const DEFAULT_REMINDER_TIME = "20:00";
const DAILY_REMINDER_NOTIFICATION_ID = 1001;

type LocalNotificationsPlugin = {
  checkPermissions: () => Promise<{ display: string }>;
  requestPermissions: () => Promise<{ display: string }>;
  schedule: (options: {
    notifications: Array<{
      id: number;
      title: string;
      body: string;
      schedule: {
        at?: Date;
        on?: { hour?: number; minute?: number; second?: number };
        repeats?: boolean;
      };
      sound?: string;
      smallIcon?: string;
      iconColor?: string;
    }>;
  }) => Promise<void>;
  cancel: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
};

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

/** iOS 네이티브 환경 여부 */
const isIosNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === "ios";
};

const getLocalNotificationsPlugin = (): LocalNotificationsPlugin | null => {
  if (typeof window === "undefined") return null;
  const cap = (window as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  const plugin = cap?.Plugins?.LocalNotifications;
  if (!plugin || typeof plugin !== "object") return null;
  const maybePlugin = plugin as Partial<LocalNotificationsPlugin>;
  if (
    typeof maybePlugin.checkPermissions !== "function" ||
    typeof maybePlugin.requestPermissions !== "function" ||
    typeof maybePlugin.schedule !== "function" ||
    typeof maybePlugin.cancel !== "function"
  ) {
    return null;
  }
  return maybePlugin as LocalNotificationsPlugin;
};

const mapNotificationPermission = (value: string | undefined): NotificationPermission => {
  if (value === "granted") return "granted";
  if (value === "denied") return "denied";
  return "default";
};

export const usesNativeNotificationScheduling = (): boolean => isIosNative();

/**
 * 알림 권한 요청.
 * iOS 네이티브: 로컬 알림 권한 프롬프트.
 * Web: Notification API.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isIosNative()) {
    try {
      const localNotifications = getLocalNotificationsPlugin();
      if (!localNotifications) return "denied";
      const result = await localNotifications.requestPermissions();
      return mapNotificationPermission(result.display);
    } catch {
      return "denied";
    }
  }

  // Web fallback
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

export async function getNotificationPermissionStatus(): Promise<NotificationPermission | "unsupported"> {
  if (isIosNative()) {
    try {
      const localNotifications = getLocalNotificationsPlugin();
      if (!localNotifications) return "unsupported";
      const result = await localNotifications.checkPermissions();
      return mapNotificationPermission(result.display);
    } catch {
      return "default";
    }
  }
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

export async function syncNotificationSchedule(settings: NotificationSettings): Promise<void> {
  if (!isIosNative()) return;

  const localNotifications = getLocalNotificationsPlugin();
  if (!localNotifications) return;

  try {
    await localNotifications.cancel({
      notifications: [{ id: DAILY_REMINDER_NOTIFICATION_ID }]
    });
  } catch {
    // no-op
  }

  if (!settings.enabled) return;

  const [hour, minute] = parseReminderTime(settings.reminderTime);

  try {
    await localNotifications.schedule({
      notifications: [
        {
          id: DAILY_REMINDER_NOTIFICATION_ID,
          title: "Daily Flow Diary",
          body: "Time to record today's activities and reflections.",
          schedule: {
            on: { hour, minute, second: 0 },
            repeats: true
          },
          sound: undefined,
          smallIcon: "ic_notification",
          iconColor: "#2563eb"
        }
      ]
    });
  } catch {
    // no-op
  }
}

/**
 * 로컬 리마인더 알림 표시.
 * iOS 네이티브: 반복 로컬 알림 스케줄을 동기화.
 * Web: Notification API (앱이 열려 있는 동안만 유효).
 */
export async function showDailyReminder(settings: NotificationSettings): Promise<void> {
  if (!settings.enabled) return;

  if (isIosNative()) {
    await syncNotificationSchedule(settings);
    return;
  }

  if (settings.lastShownDate === todayString()) return;

  // Web fallback
  if (Notification.permission !== "granted") return;

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
