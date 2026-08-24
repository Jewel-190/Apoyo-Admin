import { supabase } from "./supabaseClient";
import {
  TIME_PRESET_OPTIONS,
  buildDefaultCustomRange,
  resolveTimeRangePreset,
} from "./timeRangePresets";

const FUNCTION_NAME = "super-admin-service-logs";

export { TIME_PRESET_OPTIONS, buildDefaultCustomRange, resolveTimeRangePreset };

function stringifyErrorField(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (value.error != null) return stringifyErrorField(value.error);
    if (typeof value.msg === "string" && value.msg.trim()) return value.msg;
    try {
      return JSON.stringify(value);
    } catch {
      return "Service logs request failed.";
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
      // ignore parse failures
    }
  }

  return stringifyErrorField(error?.message) || "Service logs request failed.";
}

async function invokeServiceLogs(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Service logs request failed.");
  }
  return data;
}

/**
 * Set `includeFacets` to false when only the page number changed — the chip
 * counts cannot move, so the server skips the facet scan entirely.
 */
export async function fetchServiceLogsPage({
  page = 1,
  pageSize = 20,
  search = "",
  status = "",
  assistanceName = "",
  categoryId = "",
  serviceName = "",
  serviceId = "",
  preset = "all_time",
  from = null,
  to = null,
  includeFacets = true,
} = {}) {
  return invokeServiceLogs({
    action: "listServiceLogs",
    page,
    pageSize,
    search,
    status,
    assistanceName,
    categoryId,
    serviceName,
    serviceId,
    preset,
    from,
    to,
    includeFacets,
  });
}

export async function fetchServiceLogDetail(requestId) {
  return invokeServiceLogs({
    action: "getServiceLog",
    requestId,
  });
}

export function formatServiceLogDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
