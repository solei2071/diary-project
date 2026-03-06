"use client";

/**
 * usePro — PRO 구독 상태 접근 훅 (PRD-002)
 *
 * ProContext의 값을 반환하는 편의 훅.
 * ProProvider 바깥에서 호출하면 개발 환경에서 경고를 출력한다.
 */

import { useContext } from "react";
import { ProContext } from "@/context/ProContext";
import type { ProContextValue } from "@/context/ProContext";

export function usePro(): ProContextValue {
  const ctx = useContext(ProContext);

  if (process.env.NODE_ENV === "development" && ctx.checkPro === undefined) {
    console.warn(
      "[usePro] Called outside of <ProProvider>. " +
        "Wrap your component tree with <ProProvider session={...}>."
    );
  }

  return ctx;
}
