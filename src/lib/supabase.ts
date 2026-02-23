/**
 * Supabase 클라이언트 설정
 *
 * Supabase: BaaS(Backend as a Service) — 인증, DB, 스토리지 등을 제공하는 서비스
 * - createClient(url, key): Supabase에 연결하는 클라이언트 생성
 * - NEXT_PUBLIC_ 접두사: Next.js에서 클라이언트(브라우저)에 노출되는 환경변수
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 환경변수에서 Supabase URL과 익명 키 로드 (브라우저에서도 사용하므로 NEXT_PUBLIC_)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 환경변수가 없으면 앱 시작 시점에 에러 throw (빌드/실행 실패로 빠른 피드백)
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요합니다."
  );
}

// 싱글톤 패턴: 클라이언트를 한 번만 생성하고 재사용 (메모리 절약, 연결 풀 관리)
let client: SupabaseClient | null = null;

/** Supabase 클라이언트 인스턴스를 반환. 없으면 생성 후 반환 */
export const getSupabase = (): SupabaseClient => {
  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true, // 로컬스토리지에 세션 유지
        autoRefreshToken: true, // 토큰 만료 시 자동 갱신
        detectSessionInUrl: true // URL 파라미터로 로그인 콜백 처리 (매직링크 등)
      }
    });
  }

  return client;
};

// 앱 전역에서 import해서 사용할 기본 인스턴스
export const supabase = getSupabase();
