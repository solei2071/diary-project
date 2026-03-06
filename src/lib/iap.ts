/**
 * iap.ts — In-App Purchase (StoreKit) 처리
 *
 * iOS 네이티브: @capacitor-community/in-app-purchases 또는
 *              window.webkit.messageHandlers 브릿지로 네이티브 StoreKit 호출
 * Web: 결제 페이지(외부 URL)로 리다이렉트
 *
 * 보안 원칙:
 * - 영수증 검증은 반드시 서버(verify-iap Edge Function)에서 수행
 * - 클라이언트는 receiptData를 서버에 전달만 하고 직접 구독 업데이트 불가
 * - 서버가 검증 후 user_subscriptions를 업데이트
 */

export type IAPProductId = "com.dailyflow.diary.pro_monthly" | "com.dailyflow.diary.pro_yearly";

export type IAPPurchaseResult = {
  success: boolean;
  productId: string;
  transactionId: string;
  receiptData: string; // base64 encoded Apple receipt
};

export type IAPVerifyResult = {
  ok: boolean;
  plan: "pro" | "free";
  expiresAt: string | null;
  error?: string;
};

/** iOS 네이티브 환경 여부 */
const isIosNative = (): boolean => {
  if (typeof window === "undefined") return false;
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === "ios";
};

/**
 * StoreKit 구매 시작 (iOS 네이티브)
 * 네이티브 앱에서 호출하면 StoreKit 결제 시트가 표시됨.
 * 성공 시 receiptData를 서버에 전달해 검증 필요.
 */
export const purchaseProduct = async (productId: IAPProductId): Promise<IAPPurchaseResult> => {
  if (!isIosNative()) {
    throw new Error("IAP is only available on iOS native.");
  }

  // window.webkit.messageHandlers 브릿지 시도 (Swift 네이티브 핸들러)
  const handlers = (window as {
    webkit?: {
      messageHandlers?: {
        startPurchase?: { postMessage: (payload: unknown) => void };
        startCheckout?: { postMessage: (payload: unknown) => void };
      };
    };
  }).webkit?.messageHandlers;

  if (!handlers?.startPurchase && !handlers?.startCheckout) {
    throw new Error("Native IAP bridge is not available. Ensure the WKScriptMessageHandler is registered in Swift.");
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("IAP purchase timed out."));
    }, 120_000);

    // 네이티브에서 결과를 window 이벤트로 전달받는 패턴
    const onSuccess = (event: CustomEvent<IAPPurchaseResult>) => {
      window.clearTimeout(timeout);
      window.removeEventListener("diary:iap-success" as never, onSuccess as EventListener);
      window.removeEventListener("diary:iap-error" as never, onError as EventListener);
      resolve(event.detail);
    };

    const onError = (event: CustomEvent<{ message: string }>) => {
      window.clearTimeout(timeout);
      window.removeEventListener("diary:iap-success" as never, onSuccess as EventListener);
      window.removeEventListener("diary:iap-error" as never, onError as EventListener);
      reject(new Error(event.detail?.message ?? "Purchase failed."));
    };

    window.addEventListener("diary:iap-success" as never, onSuccess as EventListener);
    window.addEventListener("diary:iap-error" as never, onError as EventListener);

    // 네이티브 브릿지 호출
    const bridge = handlers.startPurchase ?? handlers.startCheckout;
    bridge!.postMessage({ productId });
  });
};

/**
 * 서버(verify-iap Edge Function)에 영수증 검증 요청.
 * 검증 성공 시 서버가 user_subscriptions를 Pro로 업데이트.
 */
export const verifyPurchaseWithServer = async (
  userId: string,
  accessToken: string,
  purchase: IAPPurchaseResult,
  verifyEndpoint: string
): Promise<IAPVerifyResult> => {
  const response = await fetch(verifyEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      userId,
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      receiptData: purchase.receiptData
    })
  });

  if (!response.ok) {
    let errorMsg = "Receipt verification failed.";
    try {
      const json = (await response.json()) as { error?: string };
      errorMsg = json.error ?? errorMsg;
    } catch {
      // no-op
    }
    return { ok: false, plan: "free", expiresAt: null, error: errorMsg };
  }

  const result = (await response.json()) as { ok: boolean; plan?: string; expiresAt?: string | null };
  return {
    ok: result.ok,
    plan: result.plan === "pro" ? "pro" : "free",
    expiresAt: result.expiresAt ?? null
  };
};

/**
 * 구매 복원 (StoreKit restoreCompletedTransactions).
 * 앱 재설치 또는 디바이스 변경 후 구독 복원에 사용.
 */
export const restorePurchases = (): Promise<void> => {
  if (!isIosNative()) {
    return Promise.reject(new Error("Restore is only available on iOS native."));
  }

  const handlers = (window as {
    webkit?: { messageHandlers?: { restorePurchases?: { postMessage: (payload: unknown) => void } } };
  }).webkit?.messageHandlers;

  if (!handlers?.restorePurchases) {
    return Promise.reject(new Error("Native restore bridge is not available."));
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("Restore timed out."));
    }, 60_000);

    const onDone = () => {
      window.clearTimeout(timeout);
      window.removeEventListener("diary:iap-restore-done" as never, onDone as EventListener);
      window.removeEventListener("diary:iap-error" as never, onError as EventListener);
      resolve();
    };

    const onError = (event: CustomEvent<{ message: string }>) => {
      window.clearTimeout(timeout);
      window.removeEventListener("diary:iap-restore-done" as never, onDone as EventListener);
      window.removeEventListener("diary:iap-error" as never, onError as EventListener);
      reject(new Error(event.detail?.message ?? "Restore failed."));
    };

    window.addEventListener("diary:iap-restore-done" as never, onDone as EventListener);
    window.addEventListener("diary:iap-error" as never, onError as EventListener);

    handlers.restorePurchases!.postMessage({});
  });
};
