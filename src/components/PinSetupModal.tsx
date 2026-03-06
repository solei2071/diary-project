"use client";

import { useCallback, useState } from "react";
import { X, Delete } from "lucide-react";
import { createPasscodeRecord } from "@/lib/app-lock";

type AppLanguage = "en" | "ko";

type PinSetupModalProps = {
  visible: boolean;
  onClose: () => void;
  onPinSet: (salt: string, hash: string) => void;
  requireCurrentPin?: boolean;
  currentSalt?: string | null;
  currentHash?: string | null;
  appLanguage: AppLanguage;
};

type PinStep = "current" | "new" | "confirm";

export default function PinSetupModal({
  visible,
  onClose,
  onPinSet,
  requireCurrentPin = false,
  currentSalt,
  currentHash,
  appLanguage,
}: PinSetupModalProps) {
  const isKorean = appLanguage === "ko";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);

  const [step, setStep] = useState<PinStep>(requireCurrentPin ? "current" : "new");
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const reset = () => {
    setStep(requireCurrentPin ? "current" : "new");
    setPin("");
    setNewPin("");
    setError("");
    setIsBusy(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleDigit = async (digit: string) => {
    if (isBusy) return;
    const next = pin + digit;
    if (next.length > 4) return;
    setPin(next);
    setError("");

    if (next.length === 4) {
      if (step === "current") {
        // Verify current PIN
        setIsBusy(true);
        try {
          const { verifyPasscode } = await import("@/lib/app-lock");
          const ok = await verifyPasscode(next, currentSalt ?? "", currentHash ?? "");
          if (ok) {
            setStep("new");
            setPin("");
          } else {
            setError(t("Incorrect PIN", "비밀번호가 틀렸습니다"));
            setPin("");
          }
        } finally {
          setIsBusy(false);
        }
      } else if (step === "new") {
        setNewPin(next);
        setStep("confirm");
        setPin("");
      } else if (step === "confirm") {
        if (next === newPin) {
          setIsBusy(true);
          try {
            const record = await createPasscodeRecord(next);
            onPinSet(record.salt, record.hash);
            reset();
          } finally {
            setIsBusy(false);
          }
        } else {
          setError(t("PINs don't match", "비밀번호가 일치하지 않습니다"));
          setPin("");
          setNewPin("");
          setStep("new");
        }
      }
    }
  };

  const handleDelete = () => {
    if (isBusy) return;
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  if (!visible) return null;

  const title =
    step === "current"
      ? t("Enter current PIN", "현재 비밀번호 입력")
      : step === "new"
        ? t("Set new PIN", "새 비밀번호 설정")
        : t("Re-enter PIN", "비밀번호를 다시 입력하세요");

  const dots = Array.from({ length: 4 }, (_, i) => i < pin.length);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-bold text-[var(--ink)]">{title}</h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
            aria-label={t("Close", "닫기")}
          >
            <X className="h-4 w-4 text-[var(--muted)]" />
          </button>
        </div>

        {/* PIN dots */}
        <div className="mb-6 flex justify-center gap-4">
          {dots.map((filled, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-colors ${
                filled
                  ? "border-[var(--primary)] bg-[var(--primary)]"
                  : "border-[var(--border-strong)] bg-transparent"
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="mb-4 text-center text-xs text-[var(--danger)]">{error}</p>
        )}

        {/* Keypad */}
        <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-3">
          {keys.map((key, i) => {
            if (key === "") {
              return <div key={i} />;
            }
            if (key === "del") {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  disabled={isBusy}
                  className="flex h-16 w-full items-center justify-center rounded-xl text-[var(--muted)] transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--border)] disabled:opacity-50"
                  aria-label={t("Delete", "삭제")}
                >
                  <Delete className="h-5 w-5" />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => void handleDigit(key)}
                disabled={isBusy}
                className="flex h-16 w-full items-center justify-center rounded-xl border border-[var(--border)] text-xl font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--border)] disabled:opacity-50"
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
