import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Credentials": "false",
  "Vary": "Origin"
};

type RequestBody = {
  userId?: string;
  requestedAt?: string;
  reason?: string;
  language?: "en" | "ko";
};

const jsonResponse = (status: number, data: Record<string, unknown>) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS
    }
  });
};

const validateBody = (raw: unknown): RequestBody | null => {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as RequestBody;
  if (!payload.userId || typeof payload.userId !== "string" || payload.userId.length < 10) {
    return null;
  }
  return payload;
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, {
      error: "Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  let payload: RequestBody;
  try {
    const parsed = (await request.json()) as unknown;
    const validated = validateBody(parsed);
    if (!validated) {
      return jsonResponse(400, { error: "Invalid request body" });
    }
    payload = validated;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return jsonResponse(401, { error: "Invalid or expired session token" });
  }

  if (data.user.id !== payload.userId) {
    return jsonResponse(403, { error: "Token user does not match requested account" });
  }

  const deleteResult = await admin.auth.admin.deleteUser(payload.userId, true);
  if (deleteResult.error) {
    return jsonResponse(502, {
      error: deleteResult.error.message || "Failed to delete user"
    });
  }

  return jsonResponse(200, {
    ok: true,
    userId: payload.userId,
    requestedAt: payload.requestedAt ?? new Date().toISOString(),
    reason: payload.reason ?? "user_request",
    language: payload.language ?? "en"
  });
});
