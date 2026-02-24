/**
 * 인증 패널 컴포넌트 — 매직링크(이메일) 로그인/회원가입
 *
 * - signInWithOtp: 비밀번호 없이 이메일로 로그인 링크 발송
 * - 회원가입/로그인 모두 같은 플로우 (첫 로그인 시 자동 가입)
 */
"use client";

import { type FormEvent, useState } from "react";
import { ArrowRight, Mail, MailCheck, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";

/** Props 타입 — optional 속성으로 다양한 사용처 대응 */
type Props = {
  compact?: boolean; // true면 모달용 작은 패널
  mode?: "login" | "signup"; // 안내 문구만 다르게 표시
  onEmailSent?: () => void; // 메일 발송 성공 시 콜백
  description?: string; // 커스텀 설명 텍스트
  onClose?: () => void; // 닫기 버튼 클릭 시 콜백
};

export default function AuthPanel({
  compact = false,
  mode = "login",
  onEmailSent,
  description,
  onClose
}: Props) {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(""); // 성공 메시지
  const [error, setError] = useState("");

  /** 폼 제출: 매직링크 발송 (signInWithOtp) */
  const sendMagicLink = async (e: FormEvent) => {
    e.preventDefault(); // 기본 폼 전송(페이지 새로고침) 방지
    setError("");
    setMessage("");
    if (!email) {
      setError("이메일을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    // 로그인 링크 클릭 후 돌아올 URL (현재 사이트의 루트)
    const redirectTo = `${window.location.origin}/`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      // mode에 따라 다른 성공 메시지 표시
      const successMessage =
        mode === "signup"
          ? "인증 메일이 전송되었습니다. 가입을 완료하려면 메일 링크를 확인하세요."
          : "인증 메일이 전송되었습니다. 메일의 링크를 눌러 로그인하세요.";
      setMessage(successMessage);
      onEmailSent?.();
    }
    setIsLoading(false);
  };

  const isSignup = mode === "signup";
  const wrapperClass = compact
    ? "w-full max-w-md rounded-[1.75rem] border border-[var(--border)] bg-[var(--bg)]/95 p-0 shadow-2xl shadow-black/10 backdrop-blur-2xl"
    : "mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-5 py-14";
  const submitLabel = isSignup ? "회원가입 링크 받기" : "로그인 링크 받기";
  const heading = isSignup ? "회원가입" : "로그인";
  const helperText = isSignup ? "회원가입용 인증 메일을 받아 시작하세요." : "날짜별 기록을 저장하려면 이메일 인증이 필요해요.";

  return (
    <section className={wrapperClass}>
      <div className="p-4 sm:p-6">
        {onClose && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-light)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              닫기
            </button>
          </div>
        )}

        <form onSubmit={sendMagicLink} className="w-full overflow-hidden rounded-[1.5rem] bg-[var(--bg)]">
          <div className="relative overflow-hidden border-b border-[var(--border)] px-6 py-8">
            <div className="absolute -top-8 right-0 h-28 w-28 rounded-full bg-[var(--primary)]/12 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
                <MailCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Daily Flow</p>
                <h1 className="text-2xl font-black text-[var(--ink)]">{heading}</h1>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{helperText}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            <p className="mb-5 text-sm leading-6 text-[var(--ink-light)]">
              {description ??
                (isSignup ? "회원가입용 인증 메일을 보내드려요." : "날짜별 To-do와 회고를 기록하고, 필요할 때만 안전하게 저장할 수 있어요.")}
            </p>

            <label className="mb-2 block text-xs font-semibold tracking-wide text-[var(--muted)]">
              EMAIL ADDRESS
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none">
                  <Mail className="h-5 w-5" />
                </span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="n-input w-full rounded-xl border-[var(--border)] bg-[var(--bg)] pl-12 pr-4 py-3.5 text-base placeholder:text-[var(--muted)]"
                  placeholder="name@example.com"
                  aria-label="Email"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="n-btn-primary min-h-[50px] shrink-0 rounded-xl px-5 text-sm font-semibold tracking-wide shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[160px]"
              >
                {isLoading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    전송 중
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {submitLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

            {error && <p className="mt-3 text-sm font-semibold text-[var(--danger)]">{error}</p>}
            {message && <p className="mt-3 text-sm font-semibold text-[var(--success)]">{message}</p>}

            <p className="mt-4 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)]/50 px-3 py-2 text-xs leading-5 text-[var(--muted)]">
              메일 링크는 수신함에서 빠르게 확인해주세요. 개인 정보 유출을 막기 위해 링크는 안전하게 사용됩니다.
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}
