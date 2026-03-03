import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Credentials": "false",
  "Vary": "Origin"
};
const ALLOWED_DELETE_ORIGINS = Deno.env.get("DELETE_ACCOUNT_ALLOWED_ORIGINS")?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
const ALLOWED_REASON = ["user_request"] as const;

const isOriginAllowed = (origin: string | null) => {
  if (!origin) return true;
  if (ALLOWED_DELETE_ORIGINS.length === 0) return true;
  return ALLOWED_DELETE_ORIGINS.includes(origin);
};

const buildCorsHeaders = (origin: string | null) => {
  const allowedOrigin =
    isOriginAllowed(origin) ? (origin ?? "*") : "null";
  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": allowedOrigin
  };
};

type RequestBody = {
  userId?: string;
  requestedAt?: string;
  reason?: string;
  language?: "en" | "ko";
};

const jsonResponse = (status: number, data: Record<string, unknown>, origin: string | null = null) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...buildCorsHeaders(origin)
    }
  });
};

const validateBody = (raw: unknown): RequestBody | null => {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as RequestBody;
  if (!payload.userId || typeof payload.userId !== "string" || payload.userId.length < 10) {
    return null;
  }
  if (payload.reason && !ALLOWED_REASON.includes(payload.reason as (typeof ALLOWED_REASON)[number])) {
    return null;
  }
  return payload;
};

serve(async (request) => {
  const origin = request.headers.get("origin");
  // 학습 포인트:
  // DELETE 요청은 민감 액션이므로 허용 오리진 검사 후 거부한다.
  // 운영 초기에는 "*"가 허용될 수 있어도, 운영 환경 변수로 엄격히 제한하는게 안전하다.
  if (!isOriginAllowed(origin)) {
    return jsonResponse(403, { error: "Origin not allowed" });
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: buildCorsHeaders(origin) });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    }, origin);
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization header" }, origin);
  }

  let payload: RequestBody;
  try {
    const parsed = (await request.json()) as unknown;
    const validated = validateBody(parsed);
    if (!validated) {
      return jsonResponse(400, { error: "Invalid request body" }, origin);
    }
    payload = validated;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return jsonResponse(401, { error: "Invalid or expired session token" }, origin);
  }

  if (data.user.id !== payload.userId) {
    return jsonResponse(403, { error: "Token user does not match requested account" }, origin);
  }

  const deleteResult = await admin.auth.admin.deleteUser(payload.userId, true);
  if (deleteResult.error) {
    return jsonResponse(502, {
      error: deleteResult.error.message || "Failed to delete user"
    }, origin);
  }

  return jsonResponse(200, {
    ok: true,
    userId: payload.userId,
    requestedAt: payload.requestedAt ?? new Date().toISOString(),
    reason: payload.reason ?? "user_request",
    language: payload.language ?? "en"
  }, origin);
});
