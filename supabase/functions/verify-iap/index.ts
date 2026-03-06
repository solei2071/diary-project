import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// Apple IAP 검증 엔드포인트
const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

// 앱 번들 ID — Apple 영수증의 bundle_id 검증에 사용
const EXPECTED_BUNDLE_ID = "com.dailyflow.diary";

// Apple status 코드: 21007 = 영수증이 Sandbox 영수증임 (Production에서 검증 시 반환)
const APPLE_STATUS_SANDBOX_RECEIPT = 21007;

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Credentials": "false",
  "Vary": "Origin"
};

const buildCorsHeaders = (origin: string | null) => {
  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": origin ?? "*"
  };
};

const jsonResponse = (
  status: number,
  data: Record<string, unknown>,
  origin: string | null = null
) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...buildCorsHeaders(origin)
    }
  });
};

type RequestBody = {
  userId: string;
  receiptData: string;
  productId: string;
  transactionId: string;
};

const validateBody = (raw: unknown): RequestBody | null => {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Partial<RequestBody>;

  if (!payload.userId || typeof payload.userId !== "string" || payload.userId.length < 10) {
    return null;
  }
  if (!payload.receiptData || typeof payload.receiptData !== "string" || payload.receiptData.length === 0) {
    return null;
  }
  if (!payload.productId || typeof payload.productId !== "string") {
    return null;
  }
  if (!payload.transactionId || typeof payload.transactionId !== "string") {
    return null;
  }

  return {
    userId: payload.userId,
    receiptData: payload.receiptData,
    productId: payload.productId,
    transactionId: payload.transactionId
  };
};

// Apple 서버에 영수증 검증 요청을 보내는 헬퍼
// 학습 포인트:
// Production 먼저 시도 → status 21007이면 Sandbox로 재시도한다.
// 이는 Apple 공식 권장 플로우다.
const verifyReceiptWithApple = async (
  receiptData: string,
  sharedSecret: string
): Promise<{ status: number; latestReceiptInfo?: AppleReceiptInfo[] }> => {
  const body = JSON.stringify({
    "receipt-data": receiptData,
    password: sharedSecret,
    "exclude-old-transactions": true
  });

  // 1차: Production 서버 시도
  const productionResponse = await fetch(APPLE_PRODUCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body
  });
  const productionResult = await productionResponse.json() as AppleVerifyResponse;

  if (productionResult.status === APPLE_STATUS_SANDBOX_RECEIPT) {
    // Production에서 21007 반환 시 Sandbox로 fallback
    const sandboxResponse = await fetch(APPLE_SANDBOX_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    const sandboxResult = await sandboxResponse.json() as AppleVerifyResponse;
    return {
      status: sandboxResult.status,
      latestReceiptInfo: sandboxResult.latest_receipt_info
    };
  }

  return {
    status: productionResult.status,
    latestReceiptInfo: productionResult.latest_receipt_info
  };
};

type AppleReceiptInfo = {
  product_id: string;
  transaction_id: string;
  expires_date_ms?: string;
  bundle_id?: string;
};

type AppleVerifyResponse = {
  status: number;
  // 학습 포인트: latest_receipt_info는 자동 갱신 구독의 경우 가장 최신 영수증 목록을 담는다.
  latest_receipt_info?: AppleReceiptInfo[];
  receipt?: {
    bundle_id: string;
    in_app?: AppleReceiptInfo[];
  };
};

serve(async (request) => {
  const origin = request.headers.get("origin");

  // Preflight CORS 요청 처리
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: buildCorsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  // 필수 환경변수 확인
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appleSharedSecret = Deno.env.get("APPLE_SHARED_SECRET");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    }, origin);
  }

  if (!appleSharedSecret) {
    return jsonResponse(500, {
      error: "Server is missing APPLE_SHARED_SECRET"
    }, origin);
  }

  // Authorization 헤더에서 JWT 추출
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization header" }, origin);
  }

  // 요청 바디 파싱 및 유효성 검증
  let body: RequestBody;
  try {
    const parsed = (await request.json()) as unknown;
    const validated = validateBody(parsed);
    if (!validated) {
      return jsonResponse(400, { error: "Invalid request body: userId, receiptData, productId, transactionId are required" }, origin);
    }
    body = validated;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, origin);
  }

  // 서비스 역할 클라이언트 생성 — DB 쓰기는 반드시 서비스 역할 키로만 수행
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // JWT 검증: 토큰이 유효한 Supabase 사용자인지 확인
  const { data: userData, error: authError } = await admin.auth.getUser(token);
  if (authError || !userData.user) {
    return jsonResponse(401, { error: "Invalid or expired session token" }, origin);
  }

  // 학습 포인트:
  // 토큰의 userId와 요청 바디의 userId가 일치하는지 반드시 확인한다.
  // 이 검사가 없으면 A 사용자가 B 사용자의 구독을 업데이트할 수 있다.
  if (userData.user.id !== body.userId) {
    return jsonResponse(403, { error: "Token user does not match requested userId" }, origin);
  }

  // Apple 서버에 영수증 검증 요청
  let appleResult: { status: number; latestReceiptInfo?: AppleReceiptInfo[] };
  try {
    appleResult = await verifyReceiptWithApple(body.receiptData, appleSharedSecret);
  } catch {
    return jsonResponse(502, { error: "Failed to reach Apple verification server" }, origin);
  }

  // 학습 포인트:
  // Apple status 0만 유효한 영수증이다.
  // 다른 코드는 모두 실패로 처리해야 하며, 특히 21003(인증 실패), 21004(공유 시크릿 불일치) 등을 주의한다.
  if (appleResult.status !== 0) {
    return jsonResponse(400, {
      error: "Apple receipt verification failed",
      appleStatus: appleResult.status
    }, origin);
  }

  // 영수증에서 해당 transactionId에 맞는 구매 정보 탐색
  const receiptInfo = appleResult.latestReceiptInfo ?? [];
  const matchedTransaction = receiptInfo.find(
    (info) => info.transaction_id === body.transactionId
  );

  // transactionId가 없어도 productId가 일치하는 영수증이 있으면 유효로 처리
  const relevantReceipt = matchedTransaction ?? receiptInfo.find(
    (info) => info.product_id === body.productId
  );

  if (!relevantReceipt) {
    return jsonResponse(400, {
      error: "No matching receipt found for the provided transactionId or productId"
    }, origin);
  }

  // bundle_id 검증: 다른 앱의 영수증을 재사용하는 공격 방지
  // latest_receipt_info 항목에는 bundle_id가 없을 수 있으므로 있을 때만 검사한다.
  if (relevantReceipt.bundle_id && relevantReceipt.bundle_id !== EXPECTED_BUNDLE_ID) {
    return jsonResponse(400, {
      error: "Receipt bundle_id does not match expected app"
    }, origin);
  }

  // expires_date_ms 파싱 (자동 갱신 구독의 경우)
  const expiresAt = relevantReceipt.expires_date_ms
    ? new Date(Number(relevantReceipt.expires_date_ms)).toISOString()
    : null;

  // user_subscriptions 테이블에 Pro 구독 upsert
  // 학습 포인트:
  // onConflict: "user_id"로 설정하면 동일 user_id가 있을 때 INSERT 대신 UPDATE한다.
  // ignoreDuplicates: false여야 UPDATE가 실제로 실행된다.
  const { error: upsertError } = await admin
    .from("user_subscriptions")
    .upsert(
      {
        user_id: body.userId,
        plan: "pro",
        product_id: body.productId,
        transaction_id: body.transactionId,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id",
        ignoreDuplicates: false
      }
    );

  if (upsertError) {
    return jsonResponse(502, {
      error: "Failed to update subscription in database",
      detail: upsertError.message
    }, origin);
  }

  return jsonResponse(200, {
    ok: true,
    userId: body.userId,
    plan: "pro",
    productId: body.productId,
    transactionId: body.transactionId,
    expiresAt
  }, origin);
});
