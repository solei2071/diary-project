/**
 * user-symbols.ts — 사용자 커스텀 이모지 심볼 관리
 *
 * localStorage에 저장/로드하여 사용자가 설정한 이모지 팔레트를 유지합니다.
 */

const STORAGE_KEY = "diary-user-symbols";
const MAX_USER_SYMBOLS_FREE = 10;
const MAX_USER_SYMBOLS_PRO = 40;
const FREE_TOP_SUMMARY_SYMBOLS = 3;
const PRO_TOP_SUMMARY_SYMBOLS = 10;

export type UserSymbolPlan = "free" | "pro";

export type PlanFeatures = {
  symbolLimit: number;
  topSummaryLimit: number;
  canExport: boolean;
  canSearch: boolean;
  canTemplates: boolean;
  canTodoRepeat: boolean;
  canAdvancedSummary: boolean;
  labelCharacterLimit: number;
};

export type PlanLimits = {
  [K in UserSymbolPlan]: PlanFeatures;
};

export const planFeatures: PlanLimits = {
  free: {
    symbolLimit: MAX_USER_SYMBOLS_FREE,
    topSummaryLimit: FREE_TOP_SUMMARY_SYMBOLS,
    canExport: false,
    canSearch: false,
    canTemplates: false,
    canTodoRepeat: false,
    canAdvancedSummary: false,
    labelCharacterLimit: 30
  },
  pro: {
    symbolLimit: MAX_USER_SYMBOLS_PRO,
    topSummaryLimit: PRO_TOP_SUMMARY_SYMBOLS,
    canExport: true,
    canSearch: true,
    canTemplates: true,
    canTodoRepeat: true,
    canAdvancedSummary: true,
    labelCharacterLimit: 30
  }
};

const resolveMaxSymbols = (plan: UserSymbolPlan, override?: number) => {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(0, Math.trunc(override));
  }
  return plan === "pro" ? MAX_USER_SYMBOLS_PRO : MAX_USER_SYMBOLS_FREE;
};

export const getPlanFeatures = (plan: UserSymbolPlan = "free"): PlanFeatures => {
  return getPlanLimits(plan);
};

export type UserSymbol = {
  emoji: string;
  label: string;
  order: number;
};

const normalizeSymbols = (
  symbols: UserSymbol[],
  plan: UserSymbolPlan = "free",
  maxSymbols?: number
) => {
  const max = resolveMaxSymbols(plan, maxSymbols);
  return [...symbols]
    .sort((a, b) => a.order - b.order)
    .filter((item, index, all) => item?.emoji && all.findIndex((i) => i.emoji === item.emoji) === index)
    .slice(0, max)
    .map((item, index) => ({ ...item, order: index }));
};

/** localStorage에서 사용자 심볼 목록 로드 */
export function loadUserSymbols(
  plan: UserSymbolPlan = "free",
  maxSymbols?: number
): UserSymbol[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    return normalizeSymbols(JSON.parse(raw) as UserSymbol[], plan, maxSymbols);
  } catch {
    return [];
  }
}

/** localStorage에 사용자 심볼 목록 저장 */
export function saveUserSymbols(
  symbols: UserSymbol[],
  plan: UserSymbolPlan = "free",
  maxSymbols?: number
): void {
  const normalized = normalizeSymbols(symbols, plan, maxSymbols);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* quota error 무시 */
  }
}

export function getMaxUserSymbols(plan: UserSymbolPlan = "free", maxSymbols?: number): number {
  return resolveMaxSymbols(plan, maxSymbols);
}

export function getPlanLimits(plan: UserSymbolPlan = "free"): PlanFeatures {
  return planFeatures[plan];
}

/** 기본 심볼 목록 — 빈 상태로 시작 (사용자가 직접 추가) */
export function getDefaultSymbols(): UserSymbol[] {
  return [];
}
