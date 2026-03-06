/**
 * subscription.ts — in-app plan state helpers
 *
 * 핵심 원칙:
 * 1) 로그인 사용자는 서버 구독 데이터(user_subscriptions)로만 플랜을 신뢰한다.
 * 2) 서버 데이터가 없거나 검증 실패 시 안전하게 free로 강등한다.
 * 3) 엔트리먼트는 부가 기능 플래그로 해석하고, 권한 상승의 최종 근거는 아니다.
 */

import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { PlanFeatures, UserSymbolPlan } from "@/lib/user-symbols";
import { getPlanLimits } from "@/lib/user-symbols";

const PLAN_STORAGE_KEY = "diary-symbol-plan";
const GUEST_SCOPE = "guest";
const FALLBACK_PLAN: UserSymbolPlan = "free";

export type PlanSource = "local" | "metadata" | "subscription";

export type PlanInfo = {
  plan: UserSymbolPlan;
  source: PlanSource;
  isTrial: boolean;
  gracePeriod: boolean;
  expiresAt: string | null;
};

export type PlanState = PlanInfo & {
  features: PlanFeatures;
};

const getPlanStorageKey = (userId?: string | null) => `${PLAN_STORAGE_KEY}-${userId || GUEST_SCOPE}`;

const normalizePlanValue = (value: unknown): UserSymbolPlan => {
  if (typeof value !== "string") return "free";
  const normalized = value.toLowerCase();
  if (["pro", "premium", "premium_pro", "team", "vip"].includes(normalized)) {
    return "pro";
  }
  return "free";
};

const resolvePlanFromStorage = (userId?: string | null): PlanInfo => {
  if (typeof window === "undefined") {
    return {
      plan: FALLBACK_PLAN,
      source: "local",
      isTrial: false,
      gracePeriod: false,
      expiresAt: null
    };
  }

  const raw = localStorage.getItem(getPlanStorageKey(userId));
  // 학습 포인트:
  // localStorage는 브라우저 사용자가 조작 가능한 저장소라서,
  // 보안 판단의 주축이 아니라 UI 표기/오프라인 fallback 용도로만 사용한다.
  return {
    plan: normalizePlanValue(raw),
    source: "local",
    isTrial: false,
    gracePeriod: false,
    expiresAt: null
  };
};

export const getStoredPlan = (userId?: string | null): UserSymbolPlan =>
  resolvePlanFromStorage(userId).plan;

export const setStoredPlan = (plan: UserSymbolPlan, userId?: string | null): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(getPlanStorageKey(userId), plan);
};

export const clearStoredPlan = (userId?: string | null): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getPlanStorageKey(userId));
};

export const resolvePlanFromMetadata = (user: Session["user"] | null): PlanInfo => {
  if (!user) {
    return {
      plan: "free",
      source: "metadata",
      isTrial: false,
      gracePeriod: false,
      expiresAt: null
    };
  }

  const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  const planCandidate =
    userMetadata.plan ??
    appMetadata.plan ??
    userMetadata.subscription ??
    appMetadata.subscription ??
    userMetadata.tier ??
    appMetadata.tier ??
    userMetadata.is_pro ??
    appMetadata.is_pro;
  const expiresAt =
    (typeof userMetadata.subscription_expires_at === "string" && userMetadata.subscription_expires_at) ||
    (typeof userMetadata.expires_at === "string" && userMetadata.expires_at) ||
    null;
  const isTrial = Boolean(userMetadata.trial ?? userMetadata.is_trial ?? false);
  const gracePeriod = Boolean(userMetadata.grace_period ?? false);
  const plan = normalizePlanValue(planCandidate);

  return {
    plan,
    source: "metadata",
    isTrial,
    gracePeriod,
    expiresAt
  };
};

type UserSubscriptionRow = {
  plan: string | null;
  status: string | null;
  is_trial: boolean | null;
  grace_period: boolean | null;
  expires_at: string | null;
};

type UserEntitlementRow = {
  entitlement_code: string | null;
  status: string | null;
  limit_value: number | null;
  metadata: Record<string, unknown> | null;
};

const normalizeEntitlementStatus = (status?: string | null) => {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === "active" || normalized === "enabled";
};

const readFeatureBoolean = (row: UserEntitlementRow): boolean => {
  if (typeof row.limit_value === "number") {
    return row.limit_value > 0;
  }

  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") {
    return true;
  }

  const candidate = metadata.enabled;
  if (typeof candidate === "boolean") {
    return candidate;
  }

  if (typeof candidate === "number") {
    return candidate > 0;
  }

  if (typeof candidate === "string") {
    return ["1", "true", "yes", "on"].includes(candidate.toLowerCase());
  }

  return true;
};

const readFeatureLimit = (row: UserEntitlementRow) => {
  if (typeof row.limit_value === "number" && Number.isFinite(row.limit_value)) {
    return Math.max(0, Math.trunc(row.limit_value));
  }
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const candidate = metadata.limit ?? metadata.value;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return Math.max(0, Math.trunc(candidate));
  }
  if (typeof candidate === "string") {
    const parsed = Number.parseInt(candidate, 10);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return null;
};

const applyEntitlements = (plan: UserSymbolPlan, rows: UserEntitlementRow[]) => {
  const base = getPlanLimits(plan);
  const next: PlanFeatures = { ...base };
  rows
    .filter((row) => row.entitlement_code && normalizeEntitlementStatus(row.status))
    .forEach((row) => {
      switch (row.entitlement_code) {
        case "symbol_limit": {
          const nextValue = readFeatureLimit(row);
          if (nextValue !== null && nextValue > 0) {
            next.symbolLimit = nextValue;
          }
          break;
        }
        case "daily_note_limit": {
          const nextValue = readFeatureLimit(row);
          if (nextValue !== null && nextValue > 0) {
            next.dailyNoteLimit = nextValue;
          }
          break;
        }
        case "top_summary_limit": {
          const nextValue = readFeatureLimit(row);
          if (nextValue !== null && nextValue > 0) {
            next.topSummaryLimit = nextValue;
          }
          break;
        }
        case "can_search":
          next.canSearch = readFeatureBoolean(row);
          break;
        case "can_export":
          next.canExport = readFeatureBoolean(row);
          break;
        case "can_templates":
          next.canTemplates = readFeatureBoolean(row);
          break;
        case "can_todo_repeat":
          next.canTodoRepeat = readFeatureBoolean(row);
          break;
        case "can_advanced_summary":
          next.canAdvancedSummary = readFeatureBoolean(row);
          break;
        case "label_character_limit": {
          const nextValue = readFeatureLimit(row);
          if (nextValue !== null && nextValue > 0) {
            next.labelCharacterLimit = Math.max(4, nextValue);
          }
          break;
        }
        default:
          break;
      }
    });

  return next;
};

const resolveEntitlements = async (userId: string | null): Promise<UserEntitlementRow[]> => {
  if (!userId) return [];

  try {
    const { data, error } = await supabase
      .from("user_entitlements")
      .select("entitlement_code,status,limit_value,metadata")
      .eq("user_id", userId)
      .in("status", ["active", "enabled"]);

    if (error || !data) {
      return [];
    }

    return data as UserEntitlementRow[];
  } catch {
    return [];
  }
};

const isSubscriptionActive = (row: UserSubscriptionRow, now: number) => {
  const plan = normalizePlanValue(row.plan);
  if (plan === "free") {
    return {
      active: false,
      isTrial: false,
      gracePeriod: Boolean(row.grace_period)
    };
  }

  const rawExpiresAt = row.expires_at;
  if (!rawExpiresAt) {
    return {
      active: true,
      isTrial: Boolean(row.is_trial),
      gracePeriod: Boolean(row.grace_period)
    };
  }

  const expiresAt = Date.parse(rawExpiresAt);
  if (Number.isNaN(expiresAt)) {
    return {
      active: true,
      isTrial: Boolean(row.is_trial),
      gracePeriod: Boolean(row.grace_period)
    };
  }

  return {
    active: expiresAt >= now || Boolean(row.grace_period),
    isTrial: Boolean(row.is_trial),
    gracePeriod: Boolean(row.grace_period)
  };
};

export const resolvePlanFromSubscription = async (user: Session["user"] | null): Promise<PlanInfo | null> => {
  if (!user) return null;

  try {
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("plan,status,is_trial,grace_period,expires_at")
      .eq("user_id", user.id)
      .maybeSingle<UserSubscriptionRow>();

    if (error) {
      return null;
    }

    if (!data) return null;

    const now = Date.now();
    const status = (data.status ?? "").toLowerCase();
    const statusActive = status === "active" || status === "trial" || status === "grace";
    if (!statusActive) {
      return {
        plan: "free",
        source: "subscription",
        isTrial: Boolean(data.is_trial),
        gracePeriod: Boolean(data.grace_period),
        expiresAt: data.expires_at
      };
    }

    const { active, isTrial, gracePeriod } = isSubscriptionActive(data, now);
    return {
      plan: active ? normalizePlanValue(data.plan) : "free",
      source: "subscription",
      isTrial,
      gracePeriod,
      expiresAt: data.expires_at
    };
  } catch {
    return null;
  }
};

export const resolvePlan = (user: Session["user"] | null): UserSymbolPlan => {
  if (!user) {
    return resolvePlanFromStorage().plan;
  }
  // 학습 포인트:
  // 로그인 유저는 기본값을 free로 시작해, 구독 동기화 전에 오동작/권한 과대 판정을 방지한다.
  return "free";
};

export const resolvePlanInfo = async (user: Session["user"] | null): Promise<PlanInfo> => {
  if (!user) {
    return resolvePlanFromStorage();
  }

  const fromSubscription = await resolvePlanFromSubscription(user);
  if (fromSubscription) {
    if (fromSubscription.plan === "pro" && fromSubscription.source === "subscription") {
      setStoredPlan(fromSubscription.plan, user.id);
      return fromSubscription;
    }
    setStoredPlan("free", user.id);
    return {
      ...fromSubscription,
      plan: "free"
    };
  }

  // 학습 포인트:
  // 구독 데이터가 없거나 조회 실패한 경우 free로 강등한다.
  // 이로 인해 플래그 조작/임시저장소 오염이 곧바로 Pro로 이어지는 위험을 줄인다.
  const fallbackPlan = {
    plan: "free" as const,
    source: "local" as const,
    isTrial: false,
    gracePeriod: false,
    expiresAt: null
  };
  setStoredPlan("free", user.id);
  return fallbackPlan;
};

export const resolvePlanState = async (user: Session["user"] | null): Promise<PlanState> => {
  const info = await resolvePlanInfo(user);
  // 학습 포인트:
  // 엔트리먼트는 기능 확장 정보이지만, plan 권한과 항상 함께 판단해야 한다.
  const entitlements = user ? await resolveEntitlements(user.id) : [];
  return {
    ...info,
    features: applyEntitlements(info.plan, entitlements)
  };
};

export const syncPlanWithMetadata = async (user: Session["user"] | null, plan: UserSymbolPlan) => {
  if (!user) return;
  // 학습 포인트:
  // 사용자 메타데이터 동기화는 보조정보일 뿐, 최종 판정 기준은 구독 레코드이다.
  await supabase.auth.updateUser({
    data: {
      plan,
      subscription: plan,
      is_pro: plan === "pro",
      trial: false
    }
  });
};

export const upsertProSubscription = async (user: Session["user"] | null) => {
  if (!user) return;

  // 학습 포인트:
  // 현재는 클라이언트 업서트로 동작하지만, 보안상으로는 영수증 검증 webhook에서
  // 이 함수가 호출되는 구조(서버 단일 진입점)로 전환하는 것이 바람직하다.
  const now = new Date().toISOString();
  await supabase.from("user_subscriptions").upsert(
    {
      user_id: user.id,
      plan: "pro",
      status: "active",
      is_trial: false,
      grace_period: false,
      source: "app",
      expires_at: null,
      created_at: now,
      updated_at: now
    },
    {
      onConflict: "user_id"
    }
  );
};
