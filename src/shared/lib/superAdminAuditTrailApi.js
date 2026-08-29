import { supabase } from "./supabaseClient";
import {
  TIME_PRESET_OPTIONS,
  buildDefaultCustomRange,
  resolveTimeRangePreset,
} from "./timeRangePresets";

const FUNCTION_NAME = "super-admin-audit-trail";

export { TIME_PRESET_OPTIONS, buildDefaultCustomRange, resolveTimeRangePreset };

export const AUDIT_MODULE_OPTIONS = [
  { value: "session", label: "Session" },
  { value: "content.services", label: "Content · Services" },
  { value: "content.web", label: "Content · Web" },
  { value: "data.users", label: "Data · Users" },
  { value: "data.admins", label: "Data · Admins" },
  { value: "data.voters", label: "Data · Voters" },
  { value: "data.barangays", label: "Data · Barangays" },
  { value: "settings", label: "Settings" },
  { value: "reports", label: "Reports" },
];

export const AUDIT_ACTION_OPTIONS = [
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "restore", label: "Restore" },
  { value: "archive", label: "Archive" },
  { value: "export", label: "Export" },
  { value: "disable", label: "Disable" },
  { value: "enable", label: "Enable" },
  { value: "reset", label: "Reset" },
];

const MODULE_LABELS = Object.fromEntries(
  AUDIT_MODULE_OPTIONS.map((item) => [item.value, item.label])
);
const ACTION_LABELS = Object.fromEntries(
  AUDIT_ACTION_OPTIONS.map((item) => [item.value, item.label])
);

export function auditModuleLabel(value) {
  const key = String(value || "").trim();
  return MODULE_LABELS[key] || key || "—";
}

export function auditActionLabel(value) {
  const key = String(value || "").trim();
  return ACTION_LABELS[key] || key || "—";
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
      return "Audit trail request failed.";
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

  return stringifyErrorField(error?.message) || "Audit trail request failed.";
}

async function invokeAuditTrail(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Audit trail request failed.");
  }
  return data;
}

export async function fetchAuditTrailPage({
  page = 1,
  pageSize = 20,
  search = "",
  module = "",
  auditAction = "",
  preset = "all_time",
  from = null,
  to = null,
  includeFacets = true,
} = {}) {
  return invokeAuditTrail({
    action: "listAuditTrail",
    page,
    pageSize,
    search,
    module,
    auditAction,
    preset,
    from,
    to,
    includeFacets,
  });
}

export async function recordSuperadminSessionEvent(event) {
  const normalized = String(event || "").trim().toLowerCase();
  if (normalized !== "login" && normalized !== "logout") return null;
  try {
    return await invokeAuditTrail({
      action: "recordSession",
      event: normalized,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Audit session event failed:", error);
    }
    return null;
  }
}

export function formatAuditDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatAuditTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatAuditLocation(row) {
  const ip = String(row?.ipAddress || "").trim();
  const country = String(row?.countryCode || "").trim().toUpperCase();
  if (ip && country) return `${ip} · ${country}`;
  if (ip) return ip;
  if (country) return country;
  return "—";
}
