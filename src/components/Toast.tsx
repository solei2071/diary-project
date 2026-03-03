/**
 * Toast — 앱 전역 토스트 알림 시스템
 *
 * - ToastProvider: 앱 최상위에 배치, 토스트 상태 관리
 * - useToast: 하위 컴포넌트에서 토스트 띄우는 훅
 * - ToastBubble: 실제 렌더되는 토스트 말풍선
 */
"use client";

import { AlertTriangle, Check, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastType = "success" | "error" | "info" | "warning";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  undoLabel?: string;
  onUndo?: () => void;
};

type ShowOptions = {
  undoLabel?: string;
  onUndo?: () => void;
  /** 자동 닫힘 딜레이 (ms). 기본 2800 */
  duration?: number;
};

type ToastCtx = {
  show: (message: string, type?: ToastType, opts?: ShowOptions) => void;
};

type AppLanguage = "en" | "ko";

const ToastContext = createContext<ToastCtx>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children, appLanguage = "en" }: { children: React.ReactNode; appLanguage?: AppLanguage }) {
  const isKorean = appLanguage === "ko";
  const t = (en: string, ko: string) => (isKorean ? ko : en);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutMapRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timeoutMapRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timeoutMapRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    return () => {
      timeoutMapRef.current.forEach((timer) => clearTimeout(timer));
      timeoutMapRef.current.clear();
    };
  }, []);

  const show = useCallback(
    (message: string, type: ToastType = "info", opts?: ShowOptions) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // 최대 3개까지만 쌓임
      setToasts((prev) => [...prev.slice(-2), { id, message, type, ...opts }]);
      const timeout = setTimeout(() => dismiss(id), opts?.duration ?? 2800);
      timeoutMapRef.current.set(id, timeout);
    },
    [dismiss]
  );

  useEffect(() => {
    const visibleIds = new Set(toasts.map((toast) => toast.id));
    timeoutMapRef.current.forEach((timer, id) => {
      if (!visibleIds.has(id)) {
        clearTimeout(timer);
        timeoutMapRef.current.delete(id);
      }
    });
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toasts.length > 0 && (
        <div
          className="fixed left-0 right-0 z-[9999] flex flex-col items-center gap-2 pointer-events-none px-4"
          style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
          aria-live="assertive"
          aria-atomic="false"
        >
          {toasts.map((toast) => (
            <ToastBubble key={toast.id} toast={toast} onDismiss={dismiss} isKorean={isKorean} />
          ))}
    </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastBubble({
  toast,
  onDismiss,
  isKorean,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  isKorean: boolean;
}) {
  const t = (en: string, ko: string) => (isKorean ? ko : en);
  const colors: Record<ToastType, string> = {
    success:
      "bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/30",
    error:
      "bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/30",
    info: "bg-[var(--bg)] text-[var(--ink)] border-[var(--border-strong)]",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
  };

  const icons: Record<ToastType, React.ReactNode> = {
    success: <Check className="h-3.5 w-3.5 shrink-0" />,
    error: <X className="h-3.5 w-3.5 shrink-0" />,
    info: <Info className="h-3.5 w-3.5 shrink-0" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 shrink-0" />,
  };

  return (
    <div
      className={`pointer-events-auto toast-in flex w-full max-w-xs items-center gap-2 rounded-xl border px-3.5 py-2.5 shadow-lg text-xs font-medium ${colors[toast.type]}`}
    >
      {icons[toast.type]}
      <span className="flex-1 leading-5">{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          onClick={() => {
            toast.onUndo?.();
            onDismiss(toast.id);
          }}
          className="shrink-0 font-bold underline underline-offset-2 opacity-80 hover:opacity-100"
        >
          {toast.undoLabel ?? t("Undo", "실행 취소")}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 opacity-40 hover:opacity-80 transition-opacity"
        aria-label={t("Dismiss", "닫기")}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
