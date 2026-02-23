/**
 * 메인 홈 페이지 (page.tsx)
 *
 * "use client" — 클라이언트 컴포넌트로 마킹 (useState, useEffect 등 훅 사용)
 * - App Router 기본은 서버 컴포넌트이므로, 훅 사용 시 반드시 "use client" 필요
 */
"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthPanel from "@/components/AuthPanel";
import DailyDiary from "@/components/DailyDiary";
import { supabase } from "@/lib/supabase";

export default function Home() {
  // session: 로그인한 사용자 세션 (null = 비로그인)
  const [session, setSession] = useState<Session | null>(null);
  // ready: 초기 세션 로드 완료 여부 (로딩 스피너용)
  const [ready, setReady] = useState(false);
  // authMode: 로그인/회원가입 모달 표시 모드 (null = 모달 숨김)
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  // 마운트 시 세션 로드 + 인증 상태 변경 구독
  useEffect(() => {
    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!error) {
        setSession(data.session);
      }
      setReady(true);
    };

    void loadSession();

    // 로그인/로그아웃 시 세션 변경을 실시간으로 감지
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    // cleanup: 구독 해제 (메모리 누수 방지)
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 로그인 성공 시 모달 자동 닫기
  useEffect(() => {
    if (session) {
      setAuthMode(null);
    }
  }, [session]);

  // 세션 로드 전에는 로딩 UI 표시
  if (!ready) {
    return <main className="min-h-screen flex items-center justify-center">로딩 중...</main>;
  }

  return (
    <div className="relative">
      {/* 상단 고정 헤더: 로그인 시 이메일, 비로그인 시 로그인/회원가입 탭 */}
      <section className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div
          className={`mx-auto w-full max-w-5xl overflow-hidden rounded-full border border-slate-200 bg-white ${
            session ? "grid grid-cols-1" : "grid grid-cols-2 divide-x divide-slate-200"
          }`}
        >
          {session ? (
            <button
              onClick={() => setAuthMode("login")}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-600"
            >
              {session.user.email}
            </button>
          ) : (
            <>
              <button
                onClick={() => setAuthMode("login")}
                className={`px-4 py-2 text-sm font-semibold ${
                  authMode === "login" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
                } w-full`}
              >
                로그인
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                className={`px-4 py-2 text-sm font-semibold ${
                  authMode === "signup" ? "bg-slate-900 text-white" : "bg-white text-slate-700"
                } w-full`}
              >
                회원가입
              </button>
            </>
          )}
        </div>
      </section>
      {/* 메인 다이어리 컴포넌트 — session 전달, 비로그인 시 저장 요청 시 onRequestAuth 콜백 */}
      <DailyDiary session={session} onRequestAuth={() => setAuthMode("login")} />
      {/* 로그인/회원가입 모달 — authMode가 설정되어 있고 비로그인일 때만 표시 */}
      {authMode && !session && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/35 px-4 py-6 backdrop-blur-sm">
          <AuthPanel
            compact
            mode={authMode}
            onEmailSent={() => setAuthMode(null)}
            onClose={() => setAuthMode(null)}
            description="저장하려면 이메일 인증이 필요합니다. 아래에서 이메일을 입력해 주세요."
          />
        </div>
      )}
    </div>
  );
}
