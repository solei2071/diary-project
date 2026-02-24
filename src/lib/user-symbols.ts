/**
 * user-symbols.ts — 사용자 커스텀 이모지 심볼 관리
 *
 * localStorage에 저장/로드하여 사용자가 설정한 이모지 팔레트를 유지합니다.
 */

const STORAGE_KEY = "diary-user-symbols";

export type UserSymbol = {
  emoji: string;
  label: string;
  order: number;
};

/** localStorage에서 사용자 심볼 목록 로드 */
export function loadUserSymbols(): UserSymbol[] {
  try {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    return JSON.parse(raw) as UserSymbol[];
  } catch {
    return [];
  }
}

/** localStorage에 사용자 심볼 목록 저장 */
export function saveUserSymbols(symbols: UserSymbol[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    /* quota error 무시 */
  }
}

/** 기본 심볼 목록 (첫 사용자용) */
export function getDefaultSymbols(): UserSymbol[] {
  const defaults = ["💻", "🕍", "🔆", "🥋", "🏋️", "🍷", "🍻", "🍸", "🍺"];
  return defaults.map((emoji, i) => ({ emoji, label: "", order: i }));
}
