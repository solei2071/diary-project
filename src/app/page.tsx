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
import { Moon, Settings, Sun } from "lucide-react";

export default function Home() {
  // session: 로그인한 사용자 세션 (null = 비로그인)
  const [session, setSession] = useState<Session | null>(null);
  // ready: 초기 세션 로드 완료 여부 (로딩 스피너용)
  const [ready, setReady] = useState(false);
  // authMode: 로그인/회원가입 모달 표시 모드 (null = 모달 숨김)
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("diary-theme-mode");
    const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = saved === "dark" || saved === "light" ? saved : preferDark ? "dark" : "light";
    setThemeMode(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  const closeSettings = () => setIsSettingsOpen(false);
  const signOut = async () => {
    await supabase.auth.signOut();
    closeSettings();
  };

  const applyThemeMode = (mode: "light" | "dark") => {
    setThemeMode(mode);
    if (typeof window === "undefined") return;
    document.documentElement.classList.toggle("dark", mode === "dark");
    localStorage.setItem("diary-theme-mode", mode);
  };

  // 세션 로드 전에는 로딩 UI 표시
  if (!ready) {
    return <main className="min-h-screen flex items-center justify-center">로딩 중...</main>;
  }

  return (
    <div className="relative">
      {/* 상단 고정 헤더: 로그인 시 이메일, 비로그인 시 로그인/회원가입 탭 */}
      <section
        className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 backdrop-blur"
        style={{ paddingTop: "max(0.75rem, var(--safe-top))" }}
      >
        <div
          className="mx-auto flex w-full max-w-5xl items-center justify-between overflow-visible rounded-full border border-[var(--border)] bg-[var(--bg)] px-1"
        >
          <div className={`grid min-h-10 grow divide-x divide-[var(--border)] ${session ? "grid-cols-2" : "grid-cols-3"}`}>
            {!session && (
              <>
                <button
                  onClick={() => {
                    setAuthMode("signup");
                    closeSettings();
                  }}
                  className={`px-4 py-2 text-sm font-semibold ${
                    authMode === "signup" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)] text-[var(--ink)]"
                  }`}
                >
                  Sign up
                </button>
                <button
                  onClick={() => {
                    setAuthMode("login");
                    closeSettings();
                  }}
                  className={`px-4 py-2 text-sm font-semibold ${
                    authMode === "login" ? "bg-[var(--primary)] text-white" : "bg-[var(--bg)] text-[var(--ink)]"
                  }`}
                >
                  Login
                </button>
              </>
            )}
            <button
              onClick={() => setIsSettingsOpen((prev) => !prev)}
              className="flex items-center justify-center gap-1 px-4 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
          </div>
          {session ? (
            <button
              onClick={() => {
                closeSettings();
                void signOut();
              }}
              className="ml-2 rounded-full px-3 py-1 text-xs font-semibold text-[var(--muted)]"
            >
              Sign out
            </button>
          ) : null}
          {isSettingsOpen ? (
            <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 shadow-md">
              <p className="mb-2 text-xs font-semibold text-[var(--muted)]">Settings</p>
              {session ? (
                <>
                  <p className="mb-2 truncate text-xs text-[var(--ink)]">{session.user.email}</p>
                  <div className="mb-2 flex items-center gap-1 text-xs">
                    <button
                      onClick={() => applyThemeMode("light")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "light" ? "border-[var(--primary)] text-[var(--ink)]" : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label="Set light mode"
                    >
                      <Sun className="h-3.5 w-3.5" /> Light
                    </button>
                    <button
                      onClick={() => applyThemeMode("dark")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "dark" ? "border-[var(--primary)] text-[var(--ink)]" : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label="Set dark mode"
                    >
                      <Moon className="h-3.5 w-3.5" /> Dark
                    </button>
                  </div>
                  <button
                    onClick={() => void signOut()}
                    className="mb-2 w-full rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <p className="mb-2 text-xs text-[var(--muted)]">You are not signed in.</p>
                  <div className="mb-2 flex items-center gap-1 text-xs">
                    <button
                      onClick={() => applyThemeMode("light")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "light" ? "border-[var(--primary)] text-[var(--ink)]" : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label="Set light mode"
                    >
                      <Sun className="h-3.5 w-3.5" /> Light
                    </button>
                    <button
                      onClick={() => applyThemeMode("dark")}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 ${
                        themeMode === "dark" ? "border-[var(--primary)] text-[var(--ink)]" : "border-[var(--border)] text-[var(--muted)]"
                      }`}
                      aria-label="Set dark mode"
                    >
                      <Moon className="h-3.5 w-3.5" /> Dark
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setAuthMode("login");
                      closeSettings();
                    }}
                      className="mb-2 w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                    >
                      Login
                    </button>
                    <button
                    onClick={() => {
                      setAuthMode("signup");
                      closeSettings();
                    }}
                    className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--ink)]"
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>
          ) : null}
          {isSettingsOpen ? (
            <button
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 -z-10"
              aria-label="Close settings"
            />
          ) : null}
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
