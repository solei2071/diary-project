"use client";

import { useCallback, useEffect, useRef } from "react";
import { X, Sparkles, StickyNote, Lock, Download } from "lucide-react";
import { getPlanLimits } from "@/lib/user-symbols";

type AppLanguage = "en" | "ko";

type ProUpgradeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  onRestore?: () => void;
  appLanguage: AppLanguage;
  isLoading?: boolean;
};

export default function ProUpgradeSheet({
  visible,
  onClose,
  onSubscribe,
  onRestore,
  appLanguage,
  isLoading = false,
}: ProUpgradeSheetProps) {
  const isKorean = appLanguage === "ko";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);
  const backdropRef = useRef<HTMLDivElement>(null);
  const proPlan = getPlanLimits("pro");

  useEffect(() => {
    if (!visible) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [visible, onClose]);

  if (!visible) return null;

  const features = [
    {
      icon: <Sparkles className="h-4 w-4 text-amber-500" />,
      title: t(`${proPlan.symbolLimit} emoji activities`, `이모티콘 ${proPlan.symbolLimit}개 사용`),
      desc: t("Track more activities with expanded emoji slots", "더 많은 활동을 이모지로 추적하세요"),
    },
    {
      icon: <StickyNote className="h-4 w-4 text-blue-500" />,
      title: t(`Up to ${proPlan.dailyNoteLimit} notes`, `노트 최대 ${proPlan.dailyNoteLimit}개`),
      desc: t("Create multiple notes per day", "하루에 여러 노트를 작성하세요"),
    },
    {
      icon: <Lock className="h-4 w-4 text-purple-500" />,
      title: t("App lock", "앱 잠금 기능"),
      desc: t("Protect your diary with PIN or biometrics", "PIN이나 생체 인증으로 일기를 보호하세요"),
    },
    {
      icon: <Download className="h-4 w-4 text-green-500" />,
      title: t("Data export", "데이터 내보내기"),
      desc: t("Export your diary data anytime", "언제든 데이터를 내보낼 수 있어요"),
    },
  ];

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="w-full max-w-[430px] animate-slide-up rounded-t-2xl border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-8 pt-3 shadow-2xl"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        {/* Handle bar */}
        <div className="mb-3 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>

        {/* Close button */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--ink)]">
            {t("Upgrade to PRO", "PRO로 업그레이드")}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
            aria-label={t("Close", "닫기")}
          >
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>

        {/* Feature list */}
        <div className="mb-5 space-y-3">
          {features.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)]">
                {f.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--ink)]">{f.title}</p>
                <p className="text-xs text-[var(--muted)]">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Price */}
        <p className="mb-3 text-center text-lg font-bold text-[var(--ink)]">
          $0.99 <span className="text-sm font-normal text-[var(--muted)]">/ {t("month", "월")}</span>
        </p>

        {/* CTA */}
        <button
          onClick={onSubscribe}
          disabled={isLoading}
          className="mb-3 w-full rounded-xl bg-[var(--primary)] py-3.5 text-sm font-bold text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isLoading
            ? t("Processing...", "처리 중...")
            : t("Start subscription", "구독 시작하기")}
        </button>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 text-[11px] text-[var(--muted)]">
          <span>{t("Cancel anytime", "언제든지 취소 가능")}</span>
          <span className="text-[var(--border-strong)]">|</span>
          <button
            onClick={onRestore}
            className="underline hover:text-[var(--ink)]"
          >
            {t("Restore subscription", "구독 복원하기")}
          </button>
        </div>
      </div>
    </div>
  );
}
