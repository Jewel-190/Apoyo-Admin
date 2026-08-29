import { supabase } from "./supabaseClient";
import { FAVICON_URL } from "./staticAssets";
import { buildNotificationDescription, formatRelativeWithTime, normalizeStatus } from "./requestData";
import { formatAssistanceLineTitle } from "./assistanceCategoryDisplay";
import { applicantDisplayNameFromRequest, APPLICANT_SNAPSHOT_SELECT } from "./applicantSnapshot";

/** Janitor throttle — live delivery is trigger + Realtime, not this path. */
const CLEANUP_MIN_INTERVAL_MS = 5 * 60_000;
const BROWSER_ALERTS_STORAGE_KEY = "apoyo_admin_browser_alerts_enabled";

let lastCleanupAt = 0;
let cleanupInFlight = null;

function resolveCleanupError(error, data) {
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (typeof error?.context?.error === "string" && error.context.error.trim()) {
    return error.context.error;
  }
  return error?.message || "Notification cleanup failed.";
}

export function isBrowserNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserAlertsPreference() {
  if (typeof window === "undefined") {
    return false;
  }
  const stored = window.localStorage.getItem(BROWSER_ALERTS_STORAGE_KEY);
  if (stored === "0") {
    return false;
  }
  if (stored === "1") {
    return true;
  }
  // Default: if the browser already granted permission, treat alerts as on.
  return isBrowserNotificationSupported() && Notification.permission === "granted";
}

export function setBrowserAlertsPreference(enabled) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(BROWSER_ALERTS_STORAGE_KEY, enabled ? "1" : "0");
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) {
    return "unsupported";
  }

  const result = await Notification.requestPermission();
  if (result === "granted") {
    setBrowserAlertsPreference(true);
  }
  return result;
}

export function shouldShowBrowserNotifications() {
  return (
    isBrowserNotificationSupported() &&
    getBrowserAlertsPreference() &&
    Notification.permission === "granted"
  );
}

/**
 * Janitor / backfill only.
 * Live inbox delivery comes from the audit_logs trigger + Realtime.
 * This calls `admin-notifications` → `process_admin_notifications()` to:
 * - drop rows for approved, declined, or out-of-scope requests
 * - backfill any missed upserts
 *
 * Call on login and manual Reload — not on a live polling loop.
 */
export async function reconcileAdminNotifications({ force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastCleanupAt < CLEANUP_MIN_INTERVAL_MS) {
    return { success: true, skipped: true };
  }

  if (cleanupInFlight) {
    return cleanupInFlight;
  }

  cleanupInFlight = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("admin-notifications", {
        body: {},
      });

      if (error) {
        const message = resolveCleanupError(error, data);
        console.warn("[adminNotifications] cleanup failed:", message);
        return { success: false, error: message };
      }

      if (data?.success === false) {
        const message = data.error || "Notification cleanup failed.";
        console.warn("[adminNotifications] cleanup rejected:", message);
        return { success: false, error: message };
      }

      lastCleanupAt = Date.now();
      return { success: true, ...(data || {}) };
    } catch (error) {
      const message = error?.message || "Notification cleanup failed.";
      console.warn("[adminNotifications] cleanup exception:", message);
      return { success: false, error: message };
    } finally {
      cleanupInFlight = null;
    }
  })();

  return cleanupInFlight;
}

/** @deprecated Use reconcileAdminNotifications — kept for older call sites. */
export const syncAdminNotificationsFromAuditLogs = reconcileAdminNotifications;

export async function fetchUnreadNotificationCountForAdmin(adminUserId) {
  if (!adminUserId) {
    return 0;
  }

  const { data, error } = await supabase.rpc("get_unread_notification_count_for_admin", {
    p_admin_user_id: adminUserId,
  });

  if (error) {
    throw error;
  }

  return Number(data ?? 0);
}

export function scopeAdminNotifications(rows, allowedServiceIds) {
  if (!Array.isArray(rows)) {
    return [];
  }

  if (!allowedServiceIds?.length) {
    return rows;
  }

  return rows.filter(
    (row) => row.service_id && allowedServiceIds.includes(row.service_id)
  );
}

export function isVisibleAdminNotification(row) {
  const statusLabel = normalizeStatus(row?.requestStatus);
  return (
    statusLabel !== "Approved" &&
    statusLabel !== "Declined" &&
    statusLabel !== "Draft"
  );
}

export function mapAdminNotificationForDisplay(row, sourceServiceLookup = {}) {
  const sourceMeta = (row.service_id && sourceServiceLookup[row.service_id]) || {
    serviceId: row.service_id,
    category: row.assistanceCategoryName || "Request",
  };
  const requestKey = `${row.service_id || "request"}-${row.request_id || row.assistance_request_id}`;
  const category =
    row.assistanceCategoryName || sourceMeta.category || sourceMeta.displayName || "Request";
  const displayName = row.applicantName || "Applicant";
  const eventAt = row.changed_at || row.updated_at || row.created_at;
  const statusLabel = normalizeStatus(row.requestStatus);
  const requestId = row.request_id || row.assistance_request_id || null;

  return {
    ...row,
    request_id: requestId,
    assistance_request_id: row.assistance_request_id || requestId,
    requestKey,
    category,
    displayName,
    eventAt,
    statusLabel,
    requestCode:
      row.requestCode ||
      (typeof requestId === "string" ? requestId.slice(0, 8) : "N/A"),
    description: buildNotificationDescription(row, category),
    timeLabel: formatRelativeWithTime(eventAt),
  };
}

/**
 * Full admin inbox: visible rows only, one latest notification per request, newest first.
 */
export function buildAdminNotificationInbox(rows, { sourceServiceLookup = {} } = {}) {
  const mapped = (rows || [])
    .map((row) => mapAdminNotificationForDisplay(row, sourceServiceLookup))
    .filter((row) => isVisibleAdminNotification(row));

  const latestByRequest = mapped.reduce((acc, row) => {
    const key = String(row.request_id || row.id);
    const current = acc.get(key);
    if (!current) {
      acc.set(key, row);
      return acc;
    }

    const currentTime = new Date(current.eventAt || 0).getTime();
    const nextTime = new Date(row.eventAt || 0).getTime();
    if (nextTime >= currentTime) {
      acc.set(key, row);
    }
    return acc;
  }, new Map());

  return [...latestByRequest.values()].sort(
    (a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime()
  );
}

export function buildAdminNotificationPreview(rows, { sourceServiceLookup = {}, maxItems = 8 } = {}) {
  return buildAdminNotificationInbox(rows, { sourceServiceLookup }).slice(
    0,
    Math.max(0, maxItems)
  );
}

export function mergeNotificationIntoInbox(inbox, notification) {
  if (!notification?.id) {
    return Array.isArray(inbox) ? inbox : [];
  }

  const requestKey = String(notification.request_id || notification.id);
  const without = (inbox || []).filter(
    (row) =>
      String(row.id) !== String(notification.id) &&
      String(row.request_id || row.id) !== requestKey
  );

  return [notification, ...without].sort(
    (a, b) => new Date(b.eventAt || 0).getTime() - new Date(a.eventAt || 0).getTime()
  );
}

export function showAdminBrowserNotification(notification, { onClick } = {}) {
  if (!shouldShowBrowserNotifications() || !notification) {
    return null;
  }

  const title = notification.displayName || notification.applicantName || "New activity";
  const body =
    notification.description ||
    buildNotificationDescription(notification, notification.category || "Request");

  try {
    const tag =
      notification.audit_log_id ||
      notification.id ||
      `${notification.request_id || "request"}-${Date.now()}`;

    const instance = new Notification(title, {
      body,
      tag: `admin-notification-${tag}`,
      icon: FAVICON_URL,
      requireInteraction: false,
    });

    instance.onclick = () => {
      window.focus();
      instance.close();
      onClick?.(notification);
    };

    return instance;
  } catch (error) {
    console.warn("[adminNotifications] Unable to show browser notification:", error);
    return null;
  }
}

async function enrichAdminNotificationRows(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  const auditIds = [...new Set(list.map((r) => r.audit_log_id).filter(Boolean))];
  if (auditIds.length === 0) {
    return [];
  }

  const { data: audits, error: auditErr } = await supabase
    .from("audit_logs")
    .select("id, request_id, action, changed_by, changed_at, old_status, new_status")
    .in("id", auditIds);

  if (auditErr) {
    throw auditErr;
  }

  const auditById = Object.fromEntries((audits || []).map((a) => [a.id, a]));
  const requestIds = [
    ...new Set(
      list
        .map((r) => r.assistance_request_id || auditById[r.audit_log_id]?.request_id)
        .filter(Boolean)
    ),
  ];

  if (requestIds.length === 0) {
    return [];
  }

  const { data: requests, error: reqErr } = await supabase
    .from("assistance_requests")
    .select(`id, service_id, status, request_code, user_id, service_name, assistance_name, category_slug, category_id, ${APPLICANT_SNAPSHOT_SELECT}`)
    .in("id", requestIds);

  if (reqErr) {
    throw reqErr;
  }

  const requestById = Object.fromEntries((requests || []).map((r) => [r.id, r]));

  const serviceIds = [...new Set((requests || []).map((r) => r.service_id).filter(Boolean))];
  let servicesById = {};
  let categoriesById = {};

  if (serviceIds.length > 0) {
    const { data: svcRows, error: svcErr } = await supabase
      .from("assistance_services")
      .select("id, display_name, category_id")
      .in("id", serviceIds);

    if (svcErr) {
      throw svcErr;
    }

    servicesById = Object.fromEntries((svcRows || []).map((s) => [s.id, s]));

    const catIds = [
      ...new Set(
        [
          ...(svcRows || []).map((s) => s.category_id),
          ...(requests || []).map((r) => r.category_id),
        ].filter(Boolean)
      ),
    ];
    if (catIds.length > 0) {
      const { data: catRows, error: catErr } = await supabase
        .from("assistance_categories")
        .select("id, slug, assistance_name")
        .in("id", catIds);

      if (catErr) {
        throw catErr;
      }

      categoriesById = Object.fromEntries((catRows || []).map((c) => [c.id, c]));
    }
  }

  return list.map((row) => {
    const al = auditById[row.audit_log_id] || {};
    const reqId = row.assistance_request_id || al.request_id || null;
    const req = reqId ? requestById[reqId] || {} : {};
    const svc = req.service_id ? servicesById[req.service_id] : null;
    const cat = req.category_id
      ? categoriesById[req.category_id]
      : svc?.category_id
        ? categoriesById[svc.category_id]
        : null;
    const snapshotAssistance = String(req.assistance_name || "").trim();
    const snapshotService = String(req.service_name || "").trim();
    const assistanceCategoryName = snapshotAssistance
      ? formatAssistanceLineTitle(snapshotAssistance)
      : cat?.assistance_name
        ? formatAssistanceLineTitle(cat.assistance_name)
        : snapshotService || svc?.display_name || "Other";

    return {
      id: row.id,
      admin_user_id: row.admin_user_id,
      audit_log_id: row.audit_log_id,
      is_read: row.is_read,
      created_at: row.created_at,
      updated_at: row.updated_at,
      assistance_request_id: reqId,
      request_table: "assistance_requests",
      request_id: reqId,
      service_id: req.service_id ?? null,
      assistanceCategorySlug: req.category_slug || cat?.slug || null,
      assistanceCategoryName,
      applicantName: applicantDisplayNameFromRequest(req, "Applicant"),
      requestCode: req.request_code ?? null,
      requestStatus: req.status ?? null,
      action: al.action ?? null,
      changed_by: al.changed_by ?? null,
      changed_at: al.changed_at ?? null,
      old_status: al.old_status ?? null,
      new_status: al.new_status ?? null,
      changed_by_role: null,
    };
  });
}

export async function fetchAdminNotificationsForAdmin(adminUserId) {
  if (!adminUserId) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("admin_notification")
    .select("id, admin_user_id, audit_log_id, assistance_request_id, is_read, created_at, updated_at")
    .eq("admin_user_id", adminUserId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return enrichAdminNotificationRows(rows || []);
}

export async function fetchAdminNotificationById(adminUserId, notificationId) {
  if (!adminUserId || !notificationId) {
    return null;
  }

  const { data: row, error } = await supabase
    .from("admin_notification")
    .select("id, admin_user_id, audit_log_id, assistance_request_id, is_read, created_at, updated_at")
    .eq("admin_user_id", adminUserId)
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!row) {
    return null;
  }

  const enriched = await enrichAdminNotificationRows([row]);
  return enriched[0] ?? null;
}

export function subscribeAdminNotificationChanges(
  adminUserId,
  { onChange, onStatus } = {}
) {
  if (!adminUserId) {
    return () => {};
  }

  const channel = supabase
    .channel(`admin-notification-inbox-${adminUserId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "admin_notification",
        filter: `admin_user_id=eq.${adminUserId}`,
      },
      (payload) => {
        onChange?.(payload);
      }
    )
    .subscribe((status, err) => {
      if (err) {
        console.warn("[adminNotifications] realtime channel error:", err.message || err);
      }
      onStatus?.(status, err);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function markAdminNotificationsReadForAssistanceRequest(
  adminUserId,
  assistanceRequestId
) {
  if (!adminUserId || !assistanceRequestId) {
    return;
  }

  const { error } = await supabase
    .from("admin_notification")
    .update({ is_read: true })
    .eq("admin_user_id", adminUserId)
    .eq("assistance_request_id", assistanceRequestId);

  if (error) {
    throw error;
  }
}
