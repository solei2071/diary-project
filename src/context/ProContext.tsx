"use client";

/**
 * ProContext — PRO 구독 상태 전역 컨텍스트 (PRD-002)
 *
 * resolvePlanState를 통해 서버 구독 데이터를 조회하고,
 * isPro / features / planInfo를 앱 전체에서 일관되게 참조할 수 있게 한다.
 *
 * showUpgrade 상태를 함께 관리하여 ProUpgradeSheet 노출을 제어한다.
 */

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";
import type { PlanState } from "@/lib/subscription";
import { resolvePlanState } from "@/lib/subscription";
import type { PlanFeatures } from "@/lib/user-symbols";
import { getPlanLimits } from "@/lib/user-symbols";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ProContextValue = {
  /** true when the resolved plan is "pro" */
  isPro: boolean;
  /** Full plan state including source, trial, grace period, expiry */
  planInfo: PlanState;
  /** Re-verify the subscription state from the server */
  checkPro: () => Promise<void>;
  /** Whether the ProUpgradeSheet should be visible */
  showUpgrade: boolean;
  /** Toggle ProUpgradeSheet visibility */
  setShowUpgrade: (open: boolean) => void;
};

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

const FREE_FEATURES: PlanFeatures = getPlanLimits("free");

const DEFAULT_PLAN_STATE: PlanState = {
  plan: "free",
  source: "local",
  isTrial: false,
  gracePeriod: false,
  expiresAt: null,
  features: FREE_FEATURES,
};

const DEFAULT_CONTEXT: ProContextValue = {
  isPro: false,
  planInfo: DEFAULT_PLAN_STATE,
  checkPro: async () => {},
  showUpgrade: false,
  setShowUpgrade: () => {},
};

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

export const ProContext = createContext<ProContextValue>(DEFAULT_CONTEXT);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

type ProProviderProps = {
  children: React.ReactNode;
  session: Session | null;
};

export function ProProvider({ children, session }: ProProviderProps) {
  const [planState, setPlanState] = useState<PlanState>(DEFAULT_PLAN_STATE);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Guard against stale async responses when session changes quickly
  const sessionIdRef = useRef<string | null>(null);

  const checkPro = useCallback(async () => {
    const user = session?.user ?? null;
    const currentId = user?.id ?? null;
    sessionIdRef.current = currentId;

    try {
      const state = await resolvePlanState(user);
      // Only apply if the session hasn't changed while we were awaiting
      if (sessionIdRef.current === currentId) {
        setPlanState(state);
      }
    } catch {
      // On failure, fall back to free — never leave stale pro state
      if (sessionIdRef.current === currentId) {
        setPlanState(DEFAULT_PLAN_STATE);
      }
    }
  }, [session]);

  // Re-check whenever the session identity changes
  useEffect(() => {
    checkPro();
  }, [checkPro]);

  const isPro = planState.plan === "pro";

  const value = useMemo<ProContextValue>(
    () => ({
      isPro,
      planInfo: planState,
      checkPro,
      showUpgrade,
      setShowUpgrade,
    }),
    [isPro, planState, checkPro, showUpgrade]
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}
