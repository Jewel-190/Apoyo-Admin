import { supabase } from "./supabaseClient";
import { FAVICON_URL } from "./staticAssets";

const FUNCTION_NAME = "super-admin-notifications";
const ALERTS_STORAGE_KEY = "apoyo_superadmin_browser_alerts_enabled";

export const NOTIFICATION_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
];

export const NOTIFICATION_EVENT_OPTIONS = [
  { value: "", label: "All events" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

const EVENT_LABELS = {
  submitted: "Submitted",
  approved: "Approved",
  declined: "Declined",
};

export function notificationEventLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  return EVENT_LABELS[key] || key || "—";
}

function stringifyErrorField(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (value.error != null) return stringifyErrorField(value.error);
    try {
      return JSON.stringify(value);
    } catch {
      return "Notifications request failed.";
    }
  }
  return String(value);
}

async function readInvokeErrorDetail(error, data) {
  const fromData = stringifyErrorField(data?.error) || stringifyErrorField(data?.message);
  if (fromData) return fromData;

  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      const fromPayload =
        stringifyErrorField(payload?.error) || stringifyErrorField(payload?.message);
      if (fromPayload) return fromPayload;
    } catch {
      // ignore
    }
  }

  return stringifyErrorField(error?.message) || "Notifications request failed.";
}

async function invokeNotifications(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Notifications request failed.");
  }
  return data;
}

export async function fetchSuperAdminNotificationsPage({
  page = 1,
  pageSize = 20,
  status = "all",
  eventType = "",
  search = "",
} = {}) {
  return invokeNotifications({
    action: "listNotifications",
    page,
    pageSize,
    status,
    eventType,
    search,
  });
}

export async function fetchSuperAdminUnreadCount() {
  const data = await invokeNotifications({ action: "unreadCount" });
  return Number(data?.unreadCount || 0);
}

export async function fetchSuperAdminNotification(notificationId) {
  return invokeNotifications({
    action: "getNotification",
    notificationId,
  });
}

export async function markSuperAdminNotificationRead(notificationId) {
  return invokeNotifications({
    action: "markRead",
    notificationId,
  });
}

export async function markAllSuperAdminNotificationsRead() {
  return invokeNotifications({ action: "markAllRead" });
}

export function subscribeSuperAdminNotifications(userId, { onInsert, onReadChange, onStatus } = {}) {
  if (!userId) {
    return () => {};
  }

  const channel = supabase
    .channel(`super-admin-notifications-${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "super_admin_notification" },
      (payload) => onInsert?.(payload?.new || null)
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "super_admin_notification_read",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onReadChange?.(payload)
    )
    .subscribe((status, err) => {
      if (err) {
        console.warn("[superAdminNotifications] realtime error:", err.message || err);
      }
      onStatus?.(status, err);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function isBrowserNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getBrowserAlertsPreference() {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(ALERTS_STORAGE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return isBrowserNotificationSupported() && Notification.permission === "granted";
}

export function setBrowserAlertsPreference(enabled) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERTS_STORAGE_KEY, enabled ? "1" : "0");
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return "unsupported";
  const result = await Notification.requestPermission();
  if (result === "granted") setBrowserAlertsPreference(true);
  return result;
}

export function shouldShowBrowserNotifications() {
  return (
    isBrowserNotificationSupported() &&
    getBrowserAlertsPreference() &&
    Notification.permission === "granted"
  );
}

export function showSuperAdminBrowserNotification(notification, { onClick } = {}) {
  if (!shouldShowBrowserNotifications() || !notification) return null;
  try {
    const title = notification.title || "Apoyo notification";
    const body = notification.body || notificationEventLabel(notification.eventType);
    const instance = new Notification(title, {
      body,
      tag: `superadmin-notification-${notification.id || Date.now()}`,
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
    console.warn("[superAdminNotifications] Unable to show browser notification:", error);
    return null;
  }
}

export function formatNotificationDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatUnreadBadge(count) {
  const n = Number(count || 0);
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
