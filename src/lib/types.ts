/**
 * 프로젝트 전체에서 사용하는 TypeScript 타입 정의
 *
 * - 타입 정의의 이점: 자동완성, 컴파일 타임 에러 검사, 문서화
 * - Supabase DB 컬럼과 1:1 매칭되도록 설계
 */
import type { Session } from "@supabase/supabase-js";

/** 로그인 세션 (null = 비로그인) */
export type UserSession = Session | null;

/** todos 테이블 한 행의 타입 — 할 일 항목 */
export type TodoRow = {
  id: string;
  user_id: string;
  due_date: string; // YYYY-MM-DD 형식
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
};

/** journal_entries 테이블 한 행의 타입 — 일기/메모 */
export type JournalRow = {
  id: string;
  user_id: string;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

/** daily_activities 테이블 한 행의 타입 — 활동 기록 (이모지 + 시간) */
export type DailyActivityRow = {
  id: string;
  user_id: string;
  activity_date: string;
  emoji: string;
  label: string;
  hours: number;
  start_time?: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
};
