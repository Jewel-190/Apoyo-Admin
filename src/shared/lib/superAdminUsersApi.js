import { supabase } from "./supabaseClient";
import {
  TIME_PRESET_OPTIONS,
  buildDefaultCustomRange,
  resolveTimeRangePreset,
} from "./timeRangePresets";

const FUNCTION_NAME = "super-admin-user-management";

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
      return "User management request failed.";
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

  return stringifyErrorField(error?.message) || "User management request failed.";
}

async function invokeUserManagement(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(
      stringifyErrorField(data?.error) || "User management request failed."
    );
  }
  return data;
}

export async function fetchUsersPage({
  page = 1,
  pageSize = 20,
  search = "",
  sex = "",
  accountStatus = "",
  preset = "all_time",
  from = null,
  to = null,
} = {}) {
  return invokeUserManagement({
    action: "listUsers",
    page,
    pageSize,
    search,
    sex,
    accountStatus,
    preset,
    from,
    to,
  });
}

export async function exportUsersRows({
  search = "",
  sex = "",
  accountStatus = "",
  preset = "all_time",
  from = null,
  to = null,
} = {}) {
  return invokeUserManagement({
    action: "exportUsers",
    search,
    sex,
    accountStatus,
    preset,
    from,
    to,
  });
}

export async function fetchUserDetail(userId) {
  return invokeUserManagement({
    action: "getUser",
    userId,
  });
}

export async function updateUserProfile(userId, profile) {
  return invokeUserManagement({
    action: "updateUser",
    userId,
    profile,
  });
}

export async function setUserAccountDisabled(userId, disabled) {
  return invokeUserManagement({
    action: "setUserDisabled",
    userId,
    disabled: Boolean(disabled),
  });
}

export function formatUserRegisteredDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function cellValue(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

function collectExtraKeys(rows) {
  const keys = new Set();
  for (const row of rows || []) {
    const extras = row?.extras;
    if (extras && typeof extras === "object") {
      Object.keys(extras).forEach((key) => keys.add(key));
    }
  }
  return Array.from(keys).sort();
}

function usersSheetRows(users) {
  const extraKeys = collectExtraKeys(users);
  const headers = [
    "User ID",
    "Full Name",
    "First Name",
    "Middle Name",
    "Last Name",
    "Suffix",
    "Email (Auth)",
    "Email (Profile)",
    "Sex",
    "Age",
    "Birth Date",
    "Contact",
    "Address",
    "Barangay",
    "VIN",
    "Registered At",
    "Updated At",
    "Account Status",
    "Has Auth Account",
    "Banned Until",
    ...extraKeys.map((key) => `profile.${key}`),
  ];

  const dataRows = (users || []).map((user) => [
    user.id ?? "",
    user.fullName ?? "",
    user.firstName ?? "",
    user.middleName ?? "",
    user.lastName ?? "",
    user.suffix ?? "",
    user.email ?? "",
    user.profileEmail ?? "",
    user.sex ?? "",
    user.age ?? "",
    user.birthDate ? String(user.birthDate).slice(0, 10) : "",
    user.contactNo ?? "",
    user.address ?? "",
    user.barangay ?? "",
    user.voterId ?? "",
    user.createdAt ?? "",
    user.updatedAt ?? "",
    user.disabled ? "Disabled" : "Active",
    user.hasAuthAccount ? "Yes" : "No",
    user.bannedUntil ?? "",
    ...extraKeys.map((key) => cellValue(user.extras?.[key])),
  ]);

  return [headers, ...dataRows];
}

function requestsSheetRows(requests) {
  const extraKeys = collectExtraKeys(requests);
  const headers = [
    "Request ID",
    "Request Code",
    "User ID",
    "Status",
    "Status (Raw)",
    "Service ID",
    "Service Name",
    "Submitted At",
    "Created At",
    "Updated At",
    "Case Study Date",
    ...extraKeys.map((key) => `request.${key}`),
  ];

  const dataRows = (requests || []).map((request) => [
    request.id ?? "",
    request.requestCode ?? "",
    request.userId ?? "",
    request.status ?? "",
    request.statusRaw ?? "",
    request.serviceId ?? "",
    request.serviceName ?? "",
    request.submittedAt ?? "",
    request.createdAt ?? "",
    request.updatedAt ?? "",
    request.caseStudyDate ?? "",
    ...extraKeys.map((key) => cellValue(request.extras?.[key])),
  ]);

  return [headers, ...dataRows];
}

export async function downloadUsersXlsx(users, requests, fileStamp) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const usersAoA = usersSheetRows(users);
  const usersSheet = XLSX.utils.aoa_to_sheet(usersAoA);
  usersSheet["!cols"] = usersAoA[0].map((header) => ({
    wch: Math.min(36, Math.max(12, String(header).length + 2)),
  }));
  XLSX.utils.book_append_sheet(workbook, usersSheet, "Users");

  const requestsAoA = requestsSheetRows(requests);
  const requestsSheet = XLSX.utils.aoa_to_sheet(requestsAoA);
  requestsSheet["!cols"] = requestsAoA[0].map((header) => ({
    wch: Math.min(36, Math.max(12, String(header).length + 2)),
  }));
  XLSX.utils.book_append_sheet(workbook, requestsSheet, "Assistance Requests");

  XLSX.writeFile(workbook, `apoyo-users-${fileStamp || Date.now()}.xlsx`, {
    bookType: "xlsx",
  });
}

export function usersExportFileStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
