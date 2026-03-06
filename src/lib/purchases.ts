/**
 * purchases.ts — RevenueCat IAP integration via @capgo/capacitor-purchases
 *
 * Replaces the direct StoreKit webkit.messageHandlers bridge (iap.ts) with
 * RevenueCat's server-side receipt validation and entitlement management.
 *
 * iOS native: Uses @capgo/capacitor-purchases Capacitor plugin (StoreKit 2 under the hood)
 * Web: Falls back to a web checkout URL redirect (RevenueCat web billing or custom)
 *
 * Security principles:
 * - Entitlement status is determined by RevenueCat server, not local state
 * - CustomerInfo from the SDK is the source of truth for subscription status
 * - Local caching is handled automatically by the RevenueCat SDK
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REVENUECAT_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY ?? "";
const PRO_ENTITLEMENT_ID = "pro";
const PRO_MONTHLY_PRODUCT_ID = "com.dailyflow.diary.pro.monthly";
const WEB_CHECKOUT_URL = process.env.NEXT_PUBLIC_WEB_CHECKOUT_URL ?? "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape of a RevenueCat EntitlementInfo object */
export type EntitlementInfo = {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  periodType: string;
  latestPurchaseDate: string | null;
  originalPurchaseDate: string | null;
  expirationDate: string | null;
  store: string;
  productIdentifier: string;
  isSandbox: boolean;
};

/** Minimal shape of RevenueCat CustomerInfo */
export type CustomerInfo = {
  activeSubscriptions: string[];
  allPurchasedProductIdentifiers: string[];
  entitlements: {
    active: Record<string, EntitlementInfo>;
    all: Record<string, EntitlementInfo>;
  };
  originalAppUserId: string;
  managementURL: string | null;
};

/** A single offering package from RevenueCat */
export type RCPackage = {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    price: number;
    priceString: string;
    currencyCode: string;
  };
  offeringIdentifier: string;
};

/** RevenueCat Offering */
export type Offering = {
  identifier: string;
  serverDescription: string;
  availablePackages: RCPackage[];
  monthly: RCPackage | null;
  annual: RCPackage | null;
  lifetime: RCPackage | null;
};

/** Map of offering identifiers to Offering objects */
export type Offerings = {
  current: Offering | null;
  all: Record<string, Offering>;
};

/** Result wrapper used throughout the module */
export type PurchaseResult<T = void> = {
  ok: boolean;
  data?: T;
  error?: string;
};

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/** iOS native environment check (matches pattern from iap.ts / app-lock.ts) */
const isIosNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === "ios";
};

// ---------------------------------------------------------------------------
// Lazy plugin import
// ---------------------------------------------------------------------------

type CapacitorPurchasesPlugin = {
  configure: (opts: { apiKey: string; appUserID?: string | null }) => Promise<void>;
  getOfferings: () => Promise<{ offerings: Offerings }>;
  purchasePackage: (opts: { aPackage: RCPackage }) => Promise<{ customerInfo: CustomerInfo }>;
  restorePurchases: () => Promise<{ customerInfo: CustomerInfo }>;
  getCustomerInfo: () => Promise<{ customerInfo: CustomerInfo }>;
  logIn: (opts: { appUserID: string }) => Promise<{ customerInfo: CustomerInfo; created: boolean }>;
  logOut: () => Promise<{ customerInfo: CustomerInfo }>;
};

let _pluginPromise: Promise<CapacitorPurchasesPlugin> | null = null;

const getPlugin = (): Promise<CapacitorPurchasesPlugin> => {
  if (_pluginPromise) return _pluginPromise;

  _pluginPromise = import("@capgo/capacitor-purchases").then(
    (mod) => (mod as unknown as { CapacitorPurchases: CapacitorPurchasesPlugin }).CapacitorPurchases
  );

  return _pluginPromise;
};

// ---------------------------------------------------------------------------
// Initialization state
// ---------------------------------------------------------------------------

let _initialized = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Configure RevenueCat SDK.
 * Must be called once at app startup (e.g. in a top-level useEffect).
 * On web, this is a no-op that resolves successfully.
 *
 * @param appUserID - Optional Supabase user ID to link RevenueCat customer with your backend user.
 */
export const initPurchases = async (appUserID?: string | null): Promise<PurchaseResult> => {
  if (_initialized) {
    return { ok: true };
  }

  if (!isIosNative()) {
    // Web: nothing to configure, SDK not available
    _initialized = true;
    return { ok: true };
  }

  if (!REVENUECAT_API_KEY) {
    return { ok: false, error: "NEXT_PUBLIC_REVENUECAT_API_KEY is not set." };
  }

  try {
    const plugin = await getPlugin();
    await plugin.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: appUserID ?? null
    });
    _initialized = true;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to configure RevenueCat.";
    return { ok: false, error: message };
  }
};

/**
 * Fetch available offerings (products/packages) from RevenueCat.
 * On web, returns an empty result.
 */
export const getOfferings = async (): Promise<PurchaseResult<Offerings>> => {
  if (!isIosNative()) {
    return {
      ok: true,
      data: { current: null, all: {} }
    };
  }

  try {
    const plugin = await getPlugin();
    const { offerings } = await plugin.getOfferings();
    return { ok: true, data: offerings };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch offerings.";
    return { ok: false, error: message };
  }
};

/**
 * Purchase the Pro monthly subscription.
 *
 * iOS native: Finds the monthly package from the current offering and triggers
 * the StoreKit purchase flow via RevenueCat.
 *
 * Web: Redirects to a web checkout URL (if configured). Returns an error otherwise.
 */
export const purchaseProMonthly = async (): Promise<PurchaseResult<CustomerInfo>> => {
  // Web fallback: redirect to checkout URL
  if (!isIosNative()) {
    if (WEB_CHECKOUT_URL) {
      window.location.href = WEB_CHECKOUT_URL;
      return { ok: true };
    }
    return { ok: false, error: "In-app purchases are only available on the iOS app." };
  }

  try {
    const plugin = await getPlugin();
    const { offerings } = await plugin.getOfferings();

    if (!offerings.current) {
      return { ok: false, error: "No offerings available. Please try again later." };
    }

    // Try to find the monthly package from the current offering
    let targetPackage: RCPackage | null = offerings.current.monthly ?? null;

    // Fallback: scan all packages for the matching product ID
    if (!targetPackage) {
      targetPackage =
        offerings.current.availablePackages.find(
          (pkg) => pkg.product.identifier === PRO_MONTHLY_PRODUCT_ID
        ) ?? null;
    }

    if (!targetPackage) {
      return {
        ok: false,
        error: `Product ${PRO_MONTHLY_PRODUCT_ID} not found in current offering.`
      };
    }

    const { customerInfo } = await plugin.purchasePackage({ aPackage: targetPackage });
    return { ok: true, data: customerInfo };
  } catch (err) {
    // RevenueCat throws a specific error code when user cancels
    const message = err instanceof Error ? err.message : "Purchase failed.";
    const isCancelled =
      message.toLowerCase().includes("cancel") ||
      message.toLowerCase().includes("user cancelled");
    return {
      ok: false,
      error: isCancelled ? "Purchase was cancelled." : message
    };
  }
};

/**
 * Restore previous purchases (e.g. after reinstall or device change).
 * On web, returns an error since there is nothing to restore.
 */
export const restoreSubscription = async (): Promise<PurchaseResult<CustomerInfo>> => {
  if (!isIosNative()) {
    return { ok: false, error: "Restore is only available on the iOS app." };
  }

  try {
    const plugin = await getPlugin();
    const { customerInfo } = await plugin.restorePurchases();
    return { ok: true, data: customerInfo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Restore failed.";
    return { ok: false, error: message };
  }
};

/**
 * Fetch the current CustomerInfo from RevenueCat.
 * The SDK caches this locally and syncs automatically, so this is fast.
 * On web, returns null data with ok=true.
 */
export const getCustomerInfo = async (): Promise<PurchaseResult<CustomerInfo | null>> => {
  if (!isIosNative()) {
    return { ok: true, data: null };
  }

  try {
    const plugin = await getPlugin();
    const { customerInfo } = await plugin.getCustomerInfo();
    return { ok: true, data: customerInfo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get customer info.";
    return { ok: false, error: message };
  }
};

/**
 * Check whether the "pro" entitlement is currently active.
 *
 * @param customerInfo - CustomerInfo object from any RevenueCat call, or null.
 * @returns true if the pro entitlement exists and is active.
 */
export const isProActive = (customerInfo: CustomerInfo | null | undefined): boolean => {
  if (!customerInfo) return false;

  const proEntitlement = customerInfo.entitlements?.active?.[PRO_ENTITLEMENT_ID];
  return Boolean(proEntitlement?.isActive);
};

// ---------------------------------------------------------------------------
// Identity management helpers
// ---------------------------------------------------------------------------

/**
 * Log in a RevenueCat user (link Supabase user ID with RevenueCat customer).
 * Call this after Supabase auth sign-in to transfer anonymous purchases.
 */
export const loginUser = async (appUserID: string): Promise<PurchaseResult<CustomerInfo>> => {
  if (!isIosNative()) {
    return { ok: true };
  }

  try {
    const plugin = await getPlugin();
    const { customerInfo } = await plugin.logIn({ appUserID });
    return { ok: true, data: customerInfo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log in to RevenueCat.";
    return { ok: false, error: message };
  }
};

/**
 * Log out from RevenueCat (resets to anonymous user).
 * Call this on Supabase auth sign-out.
 */
export const logoutUser = async (): Promise<PurchaseResult> => {
  if (!isIosNative()) {
    return { ok: true };
  }

  try {
    const plugin = await getPlugin();
    await plugin.logOut();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log out from RevenueCat.";
    return { ok: false, error: message };
  }
};
