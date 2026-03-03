"use client";

import { Component, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — 하위 컴포넌트의 런타임 에러를 잡아 화이트스크린을 방지
 *
 * React 에러 경계는 반드시 클래스 컴포넌트로 구현해야 함
 * (getDerivedStateFromError, componentDidCatch는 클래스 컴포넌트 전용)
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">
            앱 오류가 발생했습니다
          </h2>
          <p className="max-w-xs text-sm text-[var(--muted)]">
            일시적인 오류입니다. 새로고침하거나 아래 버튼을 눌러 복구해 보세요.
          </p>
          {this.state.error && (
            <p className="max-w-sm break-all rounded bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--muted)]">
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
            >
              <RefreshCw size={14} />
              다시 시도
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--ink)]"
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
