"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Delete, Fingerprint, ShieldAlert } from "lucide-react";
import { verifyPasscode, authenticateWithBiometric } from "@/lib/app-lock";

type AppLanguage = "en" | "ko";

type PinLockScreenProps = {
  visible: boolean;
  onUnlock: () => void;
  onReset: () => void;
  passcodeSalt: string | null;
  passcodeHash: string | null;
  useBiometric: boolean;
  biometricCredentialId: string | null;
  appLanguage: AppLanguage;
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;

export default function PinLockScreen({
  visible,
  onUnlock,
  onReset,
  passcodeSalt,
  passcodeHash,
  useBiometric,
  biometricCredentialId,
  appLanguage,
}: PinLockScreenProps) {
  const isKorean = appLanguage === "ko";
  const t = useCallback((en: string, ko: string) => (isKorean ? ko : en), [isKorean]);

  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const biometricTriedRef = useRef(false);

  const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil;

  // Countdown timer
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setLockedUntil(null);
        setAttempts(0);
        setError("");
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  // Auto-trigger biometric on mount
  useEffect(() => {
    if (!visible || !useBiometric || !biometricCredentialId || biometricTriedRef.current) return;
    biometricTriedRef.current = true;
    void handleBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, useBiometric, biometricCredentialId]);

  const handleBiometric = async () => {
    if (!biometricCredentialId || isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      const ok = await authenticateWithBiometric(biometricCredentialId);
      if (ok) {
        onUnlock();
      } else {
        setError(t("Biometric authentication failed", "생체 인증에 실패했습니다"));
      }
    } catch {
      setError(t("Biometric authentication failed", "생체 인증에 실패했습니다"));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDigit = async (digit: string) => {
    if (isBusy || isLockedOut) return;
    const next = pin + digit;
    if (next.length > 4) return;
    setPin(next);
    setError("");

    if (next.length === 4) {
      if (!passcodeSalt || !passcodeHash) {
        setError(t("No passcode set", "비밀번호가 설정되지 않았습니다"));
        setPin("");
        return;
      }
      setIsBusy(true);
      try {
        const ok = await verifyPasscode(next, passcodeSalt, passcodeHash);
        if (ok) {
          setAttempts(0);
          onUnlock();
        } else {
          const nextAttempts = attempts + 1;
          setAttempts(nextAttempts);
          if (nextAttempts >= MAX_ATTEMPTS) {
            setLockedUntil(Date.now() + LOCKOUT_MS);
            setError(t("Too many attempts. Try again in 30 seconds.", "시도 횟수 초과. 30초 후 다시 시도해주세요."));
          } else {
            setError(
              t(
                `Incorrect PIN (${nextAttempts}/${MAX_ATTEMPTS})`,
                `비밀번호가 틀렸습니다 (${nextAttempts}/${MAX_ATTEMPTS})`
              )
            );
          }
          setPin("");
        }
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleDelete = () => {
    if (isBusy || isLockedOut) return;
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  if (!visible) return null;

  const dots = Array.from({ length: 4 }, (_, i) => i < pin.length);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  const hasPasscode = Boolean(passcodeSalt && passcodeHash);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-base font-bold text-[var(--ink)]">
            {t("App is locked", "앱이 잠겨 있습니다")}
          </h2>
        </div>

        <p className="mb-5 text-center text-xs text-[var(--muted)]">
          {t("Enter your PIN to unlock", "비밀번호를 입력하세요")}
        </p>

        {/* Biometric button */}
        {useBiometric && biometricCredentialId && (
          <button
            onClick={() => void handleBiometric()}
            disabled={isBusy}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 py-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            <Fingerprint className="h-5 w-5" />
            {isBusy
              ? t("Checking...", "확인 중...")
              : t("Unlock with Face ID / Touch ID", "Face ID / Touch ID로 잠금 해제")}
          </button>
        )}

        {hasPasscode && (
          <>
            {/* PIN dots */}
            <div className="mb-4 flex justify-center gap-4">
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

            {/* Error */}
            {error && (
              <p className="mb-3 text-center text-xs text-[var(--danger)]">{error}</p>
            )}

            {/* Lockout countdown */}
            {isLockedOut && countdown > 0 && (
              <p className="mb-3 text-center text-xs text-[var(--muted)]">
                {t(`Try again in ${countdown}s`, `${countdown}초 후 다시 시도`)}
              </p>
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
                      disabled={isBusy || isLockedOut}
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
                    disabled={isBusy || isLockedOut}
                    className="flex h-16 w-full items-center justify-center rounded-xl border border-[var(--border)] text-xl font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)] active:bg-[var(--border)] disabled:opacity-50"
                  >
                    {key}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Reset link */}
        <button
          onClick={onReset}
          className="mt-4 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-[11px] font-semibold text-[var(--muted)] hover:bg-[var(--bg-hover)]"
        >
          {t("Reset lock on this device", "이 기기의 잠금 초기화")}
        </button>
      </div>
    </div>
  );
}
