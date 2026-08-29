import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type NotificationsAction = "list" | "unread-count" | "mark-read";

type NotificationsPayload = {
  action?: string;
  limit?: number;
  requestId?: string;
};

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function parseUuid(value: unknown): string | null {
  const text = (value || "").toString().trim();
  if (!text) return null;
  return UUID_REGEX.test(text) ? text : null;
}

function normalizeAction(value: unknown): NotificationsAction {
  const action = (value || "list").toString().trim().toLowerCase();
  if (action === "unread-count" || action === "mark-read") return action;
  return "list";
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500
    );
  }

  const token = bearerToken(request);
  if (!token) {
    return jsonResponse({ ok: false, error: "Missing bearer token" }, 401);
  }

  let payload: NotificationsPayload = {};
  try {
    payload = (await request.json()) as NotificationsPayload;
  } catch {
    payload = {};
  }

  const action = normalizeAction(payload.action);
  const limit = clampLimit(payload.limit);

  const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(
    token
  );
  if (authError || !authData?.user?.id) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const userId = authData.user.id;

  if (action === "unread-count") {
    const { data, error } = await supabaseAdmin.rpc(
      "get_unread_notification_count_for_user",
      { p_user_id: userId }
    );

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 500);
    }

    return jsonResponse({ ok: true, unreadCount: Number(data || 0) || 0 });
  }

  if (action === "mark-read") {
    const requestId = parseUuid(payload.requestId);
    if (!requestId) {
      return jsonResponse({ ok: false, error: "Invalid requestId" }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc(
      "mark_request_notifications_read_for_user",
      {
        p_user_id: userId,
        p_request_id: requestId,
      }
    );

    if (error) {
      return jsonResponse({ ok: false, error: error.message }, 500);
    }

    return jsonResponse({ ok: true, updated: Number(data || 0) || 0 });
  }

  const { data, error } = await supabaseAdmin.rpc(
    "get_latest_notifications_for_user",
    {
      p_user_id: userId,
      p_limit: limit,
    }
  );

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse({ ok: true, notifications: data || [] });
});
