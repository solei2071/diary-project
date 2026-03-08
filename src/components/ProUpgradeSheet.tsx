"use client";

import { useCallback, useEffect, useRef } from "react";
import { X, Sparkles, StickyNote, Lock, Download, ExternalLink } from "lucide-react";
import { getPlanLimits } from "@/lib/user-symbols";

type AppLanguage = "en" | "ko";
type UpgradeSource = "general" | "notes";

type ProUpgradeSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSubscribe: () => void;
  onRestore?: () => void;
  appLanguage: AppLanguage;
  isLoading?: boolean;
  source?: UpgradeSource;
  priceLabel?: string | null;
  productTitle?: string | null;
  requiresAuth?: boolean;
};

export default function ProUpgradeSheet({
  visible,
  onClose,
  onSubscribe,
  onRestore,
  appLanguage,
  isLoading = false,
  source = "general",
  priceLabel = null,
  productTitle = null,
  requiresAuth = false
}: ProUpgradeSheetProps) {
  const isKorean = appLanguage === "ko";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);
  const backdropRef = useRef<HTMLDivElement>(null);
  const proPlan = getPlanLimits("pro");
  const isNotesOffer = source === "notes";

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

  const headline = isNotesOffer
    ? t("Keep writing beyond your first note", "첫 노트 이후에도 계속 기록하세요")
    : t("Unlock the full Daily Flow experience", "Daily Flow의 모든 기능을 열어보세요");

  const description = isNotesOffer
    ? t(
        `Free plan saves 1 note per day. Upgrade to save up to ${proPlan.dailyNoteLimit} notes, keep your writing flow, and unlock extra tools.`,
        `무료 플랜은 하루 1개 노트까지 저장됩니다. 업그레이드하면 하루 최대 ${proPlan.dailyNoteLimit}개 노트를 저장하고 기록 흐름을 이어갈 수 있습니다.`
      )
    : t(
        `Upgrade to unlock up to ${proPlan.dailyNoteLimit} notes a day, app lock, data export, and expanded activity tracking.`,
        `업그레이드하면 하루 최대 ${proPlan.dailyNoteLimit}개 노트, 앱 잠금, 데이터 내보내기, 확장된 활동 추적을 사용할 수 있습니다.`
      );

  const heroLabel = productTitle?.trim() || t("Pro monthly", "Pro 월간 구독");
  const priceCaption = priceLabel
    ? t("Billed by Apple each month", "Apple에서 매월 청구")
    : t("Final price is confirmed in the Apple purchase sheet", "최종 가격은 Apple 구매 시트에서 확인");
  const renewalNotice = t(
    "Payment is charged to your Apple ID at confirmation. Subscription renews automatically unless cancelled at least 24 hours before the end of the current period.",
    "결제 확인 시 Apple ID로 요금이 청구됩니다. 현재 구독 기간 종료 24시간 전까지 취소하지 않으면 자동으로 갱신됩니다."
  );
  const manageNotice = t(
    "You can manage or cancel your subscription in your App Store account settings.",
    "구독 관리 또는 취소는 App Store 계정 설정에서 할 수 있습니다."
  );

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
        <div className="mb-3 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--ink)]">
            {isNotesOffer ? t("Unlock more notes", "노트 저장 확장하기") : t("Upgrade to PRO", "PRO로 업그레이드")}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
            aria-label={t("Close", "닫기")}
          >
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>

        <div className="relative mb-5 overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-100 via-white to-emerald-50 p-4 shadow-sm">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-300/20 blur-2xl" />
          <div className="absolute -bottom-12 left-0 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-sky-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              {heroLabel}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl font-black leading-7 text-slate-950">{headline}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
              <div className="shrink-0 rounded-2xl bg-slate-950 px-4 py-3 text-right text-white shadow-lg">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">
                  {t("Subscription", "구독")}
                </p>
                {priceLabel ? (
                  <>
                    <p className="text-3xl font-black leading-none">{priceLabel}</p>
                    <p className="mt-1 text-[11px] text-slate-300">/ {t("month", "월")}</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-black leading-tight">{t("Monthly plan", "월간 플랜")}</p>
                    <p className="mt-1 max-w-[8rem] text-[11px] leading-4 text-slate-300">{t("Price shown by Apple at purchase", "구매 시 Apple에 표시된 가격 적용")}</p>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-white/85 px-3 py-3 shadow-sm backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t("Billing details", "결제 안내")}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{priceCaption}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{renewalNotice}</p>
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2">
          {features.map((f, i) => (
            <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/80 p-3">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg)] shadow-sm">
                {f.icon}
              </div>
              <p className="text-sm font-semibold text-[var(--ink)]">{f.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{f.desc}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onSubscribe}
          disabled={isLoading}
          className="mb-3 w-full rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-slate-900 py-4 text-sm font-bold text-white shadow-lg shadow-sky-900/20 transition-transform hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60"
        >
          {isLoading
            ? t("Processing...", "처리 중...")
            : requiresAuth
              ? t("Sign in to continue", "로그인 후 계속하기")
            : isNotesOffer
              ? t("Upgrade and keep writing", "업그레이드하고 계속 쓰기")
              : t("Start subscription", "구독 시작하기")}
        </button>

        <div className="mb-3 flex items-center justify-center gap-3 text-[11px] text-[var(--muted)]">
          <span>{t("Cancel anytime", "언제든지 취소 가능")}</span>
          <span className="text-[var(--border-strong)]">|</span>
          <button
            onClick={onRestore}
            className="underline hover:text-[var(--ink)]"
          >
            {t("Restore subscription", "구독 복원하기")}
          </button>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/70 p-3">
          <p className="text-center text-[11px] leading-5 text-[var(--muted)]">{manageNotice}</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[11px] font-medium">
            <a
              href="https://apps.apple.com/account/subscriptions"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[var(--ink)] underline"
            >
              {t("Manage subscriptions", "구독 관리")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a href="/terms" className="text-[var(--ink)] underline">
              {t("Terms of Use", "이용약관")}
            </a>
            <a href="/privacy" className="text-[var(--ink)] underline">
              {t("Privacy Policy", "개인정보처리방침")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
