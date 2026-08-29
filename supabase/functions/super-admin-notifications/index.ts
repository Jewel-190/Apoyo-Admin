import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

/**
 * POST /functions/v1/super-admin-notifications
 *
 * Superadmin request inbox. Rows are inserted by a database trigger on
 * assistance_requests (pending / approved / declined). This function lists,
 * counts, and marks read so the browser never writes those tables.
 *
 * Actions:
 *  - listNotifications
 *  - unreadCount
 *  - markRead
 *  - markAllRead
 *  - getNotification
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const MAX_SEARCH_CHARS = 120;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 90;

type Payload = {
  action?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  eventType?: string;
  search?: string;
  notificationId?: string;
};

const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string, max = RATE_MAX_CALLS) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  for (const [id, hits] of rateBuckets) {
    const fresh = hits.filter((hit) => hit > cutoff);
    if (fresh.length === 0) rateBuckets.delete(id);
    else rateBuckets.set(id, fresh);
  }
  const current = rateBuckets.get(key) || [];
  if (current.length >= max) return true;
  current.push(now);
  rateBuckets.set(key, current);
  return false;
}

async function ensureSuperAdmin(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: userId });
  if (error) throw error;
  return data === true;
}

function clipInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clipText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    createdAt: row.created_at,
    requestId: row.request_id,
    eventType: row.event_type,
    status: row.status,
    title: row.title,
    body: row.body,
    requestCode: row.request_code,
    applicantName: row.applicant_name,
    applicantUserId: row.applicant_user_id,
    serviceName: row.service_name,
    assistanceName: row.assistance_name,
    isRead: Boolean(row.is_read),
    readAt: row.read_at ?? null,
  };
}

async function unreadCount(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
) {
  const { data, error } = await supabase.rpc("count_unread_super_admin_notifications", {
    p_user_id: userId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

async function listNotifications(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  body: Payload
) {
  const page = clipInt(body.page, 1, 1, 10000);
  const pageSize = clipInt(body.pageSize, PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX);
  const status = clipText(body.status, 16).toLowerCase() || "all";
  const eventType = clipText(body.eventType, 32).toLowerCase();
  const search = clipText(body.search, MAX_SEARCH_CHARS);

  const { data, error } = await supabase.rpc("list_super_admin_notifications", {
    p_user_id: userId,
    p_page: page,
    p_page_size: pageSize,
    p_status: status === "unread" || status === "read" ? status : "all",
    p_event_type: eventType || null,
    p_search: search || null,
  });
  if (error) throw error;

  const rows = (data || []) as Record<string, unknown>[];
  const total = rows.length > 0 ? Number(rows[0].total_count || 0) : 0;

  return {
    rows: rows.map(mapRow),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    unreadCount: await unreadCount(supabase, userId),
  };
}

async function getNotification(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  notificationId: string
) {
  if (!isUuid(notificationId)) {
    throw new Error("notificationId is required.");
  }

  const { data: row, error: rowError } = await supabase
    .from("super_admin_notification")
    .select(
      "id, created_at, request_id, event_type, status, title, body, request_code, applicant_name, applicant_user_id, service_name, assistance_name"
    )
    .eq("id", notificationId)
    .maybeSingle();
  if (rowError) throw rowError;
  if (!row) throw new Error("Notification not found.");

  const { data: receipt, error: receiptError } = await supabase
    .from("super_admin_notification_read")
    .select("read_at")
    .eq("notification_id", notificationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (receiptError) throw receiptError;

  return {
    notification: mapRow({
      ...(row as Record<string, unknown>),
      is_read: Boolean(receipt?.read_at),
      read_at: receipt?.read_at ?? null,
    }),
    unreadCount: await unreadCount(supabase, userId),
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();
    const auth = await authorizeRequest(req, supabase);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    if (auth.viaSecret || !auth.userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (!(await ensureSuperAdmin(supabase, auth.userId))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (isRateLimited(auth.userId)) {
      return jsonResponse({ error: "Too many requests. Try again shortly." }, 429);
    }

    let body: Payload = {};
    try {
      body = (await req.json()) as Payload;
    } catch {
      body = {};
    }

    const action = String(body.action ?? "").trim();

    if (action === "listNotifications") {
      const result = await listNotifications(supabase, auth.userId, body);
      return jsonResponse({ success: true, action, ...result });
    }

    if (action === "unreadCount") {
      const count = await unreadCount(supabase, auth.userId);
      return jsonResponse({ success: true, action, unreadCount: count });
    }

    if (action === "getNotification") {
      const result = await getNotification(
        supabase,
        auth.userId,
        String(body.notificationId ?? "")
      );
      return jsonResponse({ success: true, action, ...result });
    }

    if (action === "markRead") {
      const notificationId = String(body.notificationId ?? "").trim();
      if (!isUuid(notificationId)) {
        return jsonResponse({ success: false, error: "notificationId is required." }, 400);
      }
      const { data, error } = await supabase.rpc("mark_super_admin_notification_read", {
        p_user_id: auth.userId,
        p_notification_id: notificationId,
      });
      if (error) throw error;
      if (data === false) {
        return jsonResponse({ success: false, error: "Notification not found." }, 404);
      }
      return jsonResponse({
        success: true,
        action,
        unreadCount: await unreadCount(supabase, auth.userId),
      });
    }

    if (action === "markAllRead") {
      const { error } = await supabase.rpc("mark_all_super_admin_notifications_read", {
        p_user_id: auth.userId,
      });
      if (error) throw error;
      return jsonResponse({
        success: true,
        action,
        unreadCount: 0,
      });
    }

    return jsonResponse(
      {
        success: false,
        error:
          "Invalid action. Use listNotifications, unreadCount, getNotification, markRead, or markAllRead.",
      },
      400
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /required|not found/i.test(message) ? 400 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
