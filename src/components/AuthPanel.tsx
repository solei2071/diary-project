/**
 * 인증 패널 컴포넌트 — 매직링크(이메일) 로그인/회원가입
 *
 * - signInWithOtp: 비밀번호 없이 이메일로 로그인 링크 발송
 * - 회원가입/로그인 모두 같은 플로우 (첫 로그인 시 자동 가입)
 */
"use client";

import { type FormEvent, useState } from "react";
import { MailCheck } from "lucide-react";
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

  const wrapperClass = compact
    ? "w-full max-w-sm rounded-3xl border border-white/45 bg-white/95 p-4 shadow-card card-enter backdrop-blur"
    : "mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-5 py-14";

  const submitLabel = mode === "signup" ? "회원가입 링크 받기" : "로그인 링크 받기";

  return (
    <section className={wrapperClass}>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mb-3 inline-flex self-end rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
        >
          닫기
        </button>
      )}
      <form
        onSubmit={sendMagicLink}
        className="w-full rounded-2xl bg-white/90"
      >
        <div className="mb-4 flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[#edf0ff] text-[#373fda]">
            <MailCheck className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Daily Flow Diary</h1>
        </div>
        <p className="mb-5 text-sm leading-6 text-slate-700">
          {description ??
            (mode === "signup"
              ? "회원가입용 인증 메일을 보내드려요."
              : "날짜별 To-do와 회고를 기록하고, 필요할 때만 안전하게 저장할 수 있어요.")}
        </p>
        <label className="mb-2 block text-sm font-semibold text-ink">
          이메일 주소
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            className="input-field"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70 sm:w-40"
          >
            {isLoading ? "전송 중..." : submitLabel}
          </button>
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        {message && <p className="mt-3 text-sm font-semibold text-emerald-600">{message}</p>}
      </form>
    </section>
  );
}
