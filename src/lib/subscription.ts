/**
 * subscription.ts — in-app plan state helpers
 *
 * 서버 기준 구독 상태를 우선으로 판정하되, fallback 로컬/metadata를 결합합니다.
 * 향후 실제 결제 연동(영수증 검증 등) 시, 서버의 user_subscriptions 레코드만 교체해도
 * 클라이언트 판정이 일관되게 동작하도록 구성했습니다.
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
  const fromMeta = resolvePlanFromMetadata(user);
  if (fromMeta.source === "metadata" && fromMeta.plan === "pro") {
    return "pro";
  }
  if (user) {
    return fromMeta.plan;
  }

  return resolvePlanFromStorage().plan;
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

  const fromMetadata = resolvePlanFromMetadata(user);
  setStoredPlan(fromMetadata.plan, user.id);
  return fromMetadata;
};

export const resolvePlanState = async (user: Session["user"] | null): Promise<PlanState> => {
  const info = await resolvePlanInfo(user);
  const entitlements = user ? await resolveEntitlements(user.id) : [];
  return {
    ...info,
    features: applyEntitlements(info.plan, entitlements)
  };
};

export const syncPlanWithMetadata = async (user: Session["user"] | null, plan: UserSymbolPlan) => {
  if (!user) return;
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
