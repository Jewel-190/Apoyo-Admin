import { supabase } from "./supabaseClient";
import { getSessionCachedQuery, invalidateSessionCacheByPrefix } from "./querySessionCache";

export const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  "for approval": "For Approval",
  scheduled: "Scheduled",
  approved: "Approved",
  declined: "Declined",
  "case study": "Case Study",
};

export function normalizeStatus(status) {
  const key = String(status || "pending").trim().toLowerCase();

  if (
    [
      "action required",
      "action_required",
      "requires_action",
      "for_revision",
      "resubmission_required",
      "resubmission required",
    ].includes(key)
  ) {
    return "Action Required";
  }

  if (["resubmitted", "resubmission", "resubmission_required"].includes(key)) {
    return "Resubmitted";
  }

  if (["in progress", "in_progress"].includes(key)) {
    return "In Progress";
  }

  if (["case study", "case_study", "casestudy", "for case study"].includes(key)) {
    return "Case Study";
  }

  if (["for approval", "for_approval"].includes(key)) {
    return "For Approval";
  }

  if (key === "scheduled") {
    return "Scheduled";
  }

  if (["approved", "complete", "done"].includes(key)) {
    return "Approved";
  }

  if (["declined", "denied", "rejected"].includes(key)) {
    return "Declined";
  }

  return STATUS_LABELS[key] || "Pending";
}

export function formatDate(dateValue) {
  if (!dateValue) {
    return "N/A";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function toValidDate(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRelativeWithTime(dateValue) {
  const date = toValidDate(dateValue);
  if (!date) return "Unknown time";

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative;

  if (diffMinutes < 1) {
    relative = "Just now";
  } else if (diffMinutes < 60) {
    relative = `${diffMinutes} min ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffDays < 30) {
    relative = `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else {
    const diffMonths = Math.floor(diffDays / 30);
    relative = `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  }

  const exactDateTime = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${relative} | ${exactDateTime}`;
}

export function buildNotificationDescription(notification, categoryLabel) {
  const action = String(notification?.action || "").trim().toLowerCase();

  if (action === "insert") return `New request submitted in ${categoryLabel}`;
  if (action === "update") return `Request updated in ${categoryLabel}`;
  if (action.includes("resubmit")) return `Resubmitted documents in ${categoryLabel}`;
  if (action.includes("action_required")) return `Action required update in ${categoryLabel}`;
  if (action.includes("for approval") || action.includes("for_approval")) {
    return `For approval update in ${categoryLabel}`;
  }
  if (action.includes("scheduled")) return `Scheduled update in ${categoryLabel}`;
  if (action.includes("approved")) return `Approved update in ${categoryLabel}`;
  if (action.includes("declined") || action.includes("denied") || action.includes("rejected")) {
    return `Declined update in ${categoryLabel}`;
  }
  if (action.includes("status")) return `Status update in ${categoryLabel}`;

  return `Request update in ${categoryLabel}`;
}

export function normalizeAttachmentResult(value) {
  const key = String(value || "pending").trim().toLowerCase();

  if (["action required", "action_required", "requires_action"].includes(key)) {
    return "Action Required";
  }

  if (key === "approved") {
    return "Approved";
  }

  if (["verified", "complete", "done"].includes(key)) {
    return "Verified";
  }

  if (key === "in progress" || key === "in_progress") {
    return "In Progress";
  }

  if (["resubmitted", "resubmission", "resubmission_required"].includes(key)) {
    return "Resubmitted";
  }

  return "Pending";
}

export function buildDisplayName(user) {
  if (!user) {
    return "Unknown Applicant";
  }

  const nameParts = [
    user.first_name,
    user.middle_name,
    user.last_name,
    user.suffix,
  ].filter(Boolean);

  return nameParts.length > 0 ? nameParts.join(" ") : "Unknown Applicant";
}

const REQUEST_LIST_SELECT =
  "id, request_code, user_id, created_at, updated_at, submitted_at, status, case_study_date, service_id, service_name, assistance_name, category_slug, category_id";

function requestServiceLabel(row, meta) {
  const snapshot = String(row?.service_name ?? "").trim();
  if (snapshot) return snapshot;
  return meta?.category || meta?.displayName || "Request";
}

function resolveServiceId(source) {
  const id = source?.serviceId;
  return id ? String(id).trim() : null;
}

function buildApplicationsCacheKey(sources) {
  const serviceIds = [
    ...new Set(
      (Array.isArray(sources) ? sources : [])
        .map((source) => resolveServiceId(source))
        .filter(Boolean)
    ),
  ].sort();
  return `apps:${serviceIds.join(",")}`;
}

export function invalidateApplicationsListCache() {
  invalidateSessionCacheByPrefix("apps:");
}

/** Call after any assistance request / attachment write so queue pages see fresh data. */
export function invalidateAdminPipelineCaches() {
  invalidateApplicationsListCache();
}

export function invalidateAdminDashboardAnalyticsCache() {
  invalidateSessionCacheByPrefix("dashboard-analytics:");
}

/**
 * Dashboard analytics is server-aggregated in the admin-dashboard-analytics
 * edge function. Frontend only fetches this payload.
 */
export async function fetchAdminDashboardAnalytics({
  forceRefresh = false,
  cacheScopeKey = "global",
  serviceMonitor = null,
} = {}) {
  const scope = String(cacheScopeKey || "global").trim() || "global";
  const monitorFrom = String(serviceMonitor?.from ?? "").trim();
  const monitorTo = String(serviceMonitor?.to ?? "").trim();
  const monitorKey =
    monitorFrom && monitorTo ? `:custom:${monitorFrom}:${monitorTo}` : "";
  const cacheKey = `dashboard-analytics:${scope}${monitorKey}`;
  const body =
    monitorFrom && monitorTo
      ? { service_monitor: { from: monitorFrom, to: monitorTo } }
      : {};

  return getSessionCachedQuery(
    cacheKey,
    async () => {
      const { data, error } = await supabase.functions.invoke(
        "admin-dashboard-analytics",
        { body }
      );

      if (error) {
        throw new Error(error.message || "Unable to load dashboard analytics.");
      }

      if (!data?.success) {
        throw new Error(data?.error || "Unable to load dashboard analytics.");
      }

      return data;
    },
    { forceRefresh, ttlMs: 45_000 }
  );
}

const DASHBOARD_STATUS_BUCKETS = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
  "Declined",
];

function emptyDashboardStatusBuckets() {
  return Object.fromEntries(DASHBOARD_STATUS_BUCKETS.map((key) => [key, 0]));
}

function isActivityToday(dateValue) {
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

function resolveDashboardStatusBucket(status) {
  const normalized = normalizeStatus(status);
  return DASHBOARD_STATUS_BUCKETS.includes(normalized) ? normalized : "Pending";
}

/**
 * Builds dashboard chart/card metrics from the scoped applications list.
 * Replaces the admin-dashboard-analytics edge function (one list query vs dozens of counts).
 */
export function buildDashboardAnalyticsFromApplications(applications, { scopeKey, sourceTables }) {
  const countsByTable = {};

  for (const app of applications ?? []) {
    const serviceId = String(app?.serviceId ?? "").trim();
    if (!serviceId) continue;

    if (!countsByTable[serviceId]) {
      countsByTable[serviceId] = {
        total: 0,
        today: 0,
        statuses: emptyDashboardStatusBuckets(),
        statuses_today: emptyDashboardStatusBuckets(),
      };
    }

    const bucket = countsByTable[serviceId];
    const statusKey = resolveDashboardStatusBucket(app.status);
    const activityAt = app.submittedAt || app.createdAt;
    const today = isActivityToday(activityAt);

    bucket.total += 1;
    bucket.statuses[statusKey] += 1;
    if (today) {
      bucket.today += 1;
      bucket.statuses_today[statusKey] += 1;
    }
  }

  const serviceIds = (sourceTables ?? []).map((source) => resolveServiceId(source)).filter(Boolean);
  const roleKey = scopeKey || "line_admin";
  const totals = { total: 0, today: 0 };
  const statuses = emptyDashboardStatusBuckets();
  const statusesToday = emptyDashboardStatusBuckets();
  const tables = {};

  for (const serviceId of serviceIds) {
    const info = countsByTable[serviceId] ?? {
      total: 0,
      today: 0,
      statuses: emptyDashboardStatusBuckets(),
      statuses_today: emptyDashboardStatusBuckets(),
    };
    tables[serviceId] = info;
    totals.total += info.total;
    totals.today += info.today;
    for (const key of DASHBOARD_STATUS_BUCKETS) {
      statuses[key] += info.statuses[key] || 0;
      statusesToday[key] += info.statuses_today[key] || 0;
    }
  }

  return {
    success: true,
    timestamp: new Date().toISOString(),
    counts_by_table: countsByTable,
    roles: {
      [roleKey]: {
        tables,
        totals,
        statuses,
        statuses_today: statusesToday,
      },
    },
    overall: {
      totals,
      statuses,
      statuses_today: statusesToday,
    },
  };
}

async function fetchApplicationsBySourcesUncached(sources) {
  const sourceList = Array.isArray(sources) ? sources : [];

  if (sourceList.length === 0) {
    return [];
  }

  const resolved = sourceList.map((source) => ({
    ...source,
    serviceId: resolveServiceId(source),
  }));

  const serviceIds = [...new Set(resolved.map((s) => s.serviceId).filter(Boolean))];

  if (serviceIds.length === 0) {
    return [];
  }

  const metaByServiceId = Object.fromEntries(
    resolved.filter((s) => s.serviceId).map((s) => [s.serviceId, s])
  );

  const { data: rows, error } = await supabase
    .from("assistance_requests")
    .select(REQUEST_LIST_SELECT)
    .in("service_id", serviceIds)
    .neq("status", "draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const userIds = [
    ...new Set((rows || []).map((row) => row.user_id).filter(Boolean)),
  ];

  let usersById = {};

  if (userIds.length > 0) {
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", userIds);

    if (usersError) {
      throw usersError;
    }

    usersById = Object.fromEntries((usersData || []).map((user) => [user.id, user]));
  }

  return (rows || [])
    .map((row) => {
      const meta = metaByServiceId[row.service_id] || {};
      const serviceId = row.service_id || meta.serviceId || "";

      return {
        key: `${serviceId}-${row.id}`,
        id: row.request_code || row.id,
        requestId: row.id,
        requestCode: row.request_code || row.id,
        userId: row.user_id,
        name: buildDisplayName(usersById[row.user_id]),
        category: requestServiceLabel(row, meta),
        date: formatDate(row.submitted_at || row.created_at),
        submittedAt: row.submitted_at || null,
        updatedAt: row.updated_at || null,
        createdAt: row.created_at,
        status: normalizeStatus(row.status),
        serviceId,
        caseStudyDate: row.case_study_date ?? null,
      };
    })
    .sort((a, b) => {
      const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
}

/**
 * Lists applications for an admin role using the unified assistance_requests table.
 * source entries should include { serviceId, category } from role config.
 */
export async function fetchApplicationsBySources(sources, { forceRefresh = false } = {}) {
  const sourceList = Array.isArray(sources) ? sources : [];
  if (sourceList.length === 0) {
    return [];
  }

  const cacheKey = buildApplicationsCacheKey(sourceList);
  return getSessionCachedQuery(
    cacheKey,
    () => fetchApplicationsBySourcesUncached(sourceList),
    { forceRefresh }
  );
}

const APPROVED_PAGE_SIZE_DEFAULT = 50;
const APPROVED_USER_SEARCH_LIMIT = 300;

function escapeIlikePattern(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function quotePostgrestValue(value) {
  return `"${String(value).replace(/"/g, "")}"`;
}

const MONTH_NAME_TO_INDEX = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function buildLocalDateRange(year, monthIndex, day = 1, { unit = "day" } = {}) {
  const start = new Date(year, monthIndex, day, 0, 0, 0, 0);
  if (Number.isNaN(start.getTime())) {
    return null;
  }

  const end = new Date(start);
  if (unit === "year") {
    end.setFullYear(end.getFullYear() + 1);
  } else if (unit === "month") {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

/**
 * Parses common application-date search inputs into a local [start, end) range.
 * Supports: July 10, 2026 | Jul 10 2026 | 2026-07-10 | 7/10/2026 | July 2026 | 2026 | July 10
 */
function parseApprovedSearchDateRange(searchTerm) {
  const raw = String(searchTerm || "").trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const now = new Date();

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (match) {
    return buildLocalDateRange(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      { unit: "day" }
    );
  }

  match = /^(\d{4})-(\d{2})$/.exec(normalized);
  if (match) {
    return buildLocalDateRange(Number(match[1]), Number(match[2]) - 1, 1, {
      unit: "month",
    });
  }

  match = /^(\d{4})$/.exec(normalized);
  if (match) {
    const year = Number(match[1]);
    if (year >= 2000 && year <= 2100) {
      return buildLocalDateRange(year, 0, 1, { unit: "year" });
    }
    return null;
  }

  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  if (match) {
    return buildLocalDateRange(
      Number(match[3]),
      Number(match[1]) - 1,
      Number(match[2]),
      { unit: "day" }
    );
  }

  match =
    /^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:\s+(\d{4}))?$/.exec(
      normalized
    );
  if (match) {
    const monthIndex = MONTH_NAME_TO_INDEX[match[1]];
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : now.getFullYear();
    if (monthIndex == null || day < 1 || day > 31) {
      return null;
    }
    return buildLocalDateRange(year, monthIndex, day, { unit: "day" });
  }

  match =
    /^(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?$/.exec(
      normalized
    );
  if (match) {
    const monthIndex = MONTH_NAME_TO_INDEX[match[1]];
    const year = match[2] ? Number(match[2]) : now.getFullYear();
    if (monthIndex == null) {
      return null;
    }
    return buildLocalDateRange(year, monthIndex, 1, { unit: "month" });
  }

  return null;
}

function buildApprovedDateSearchOrParts(dateRange) {
  if (!dateRange?.start || !dateRange?.end) {
    return [];
  }

  const startIso = quotePostgrestValue(dateRange.start.toISOString());
  const endIso = quotePostgrestValue(dateRange.end.toISOString());

  // Match the displayed Application Date (submitted_at, else created_at).
  return [
    `and(submitted_at.gte.${startIso},submitted_at.lt.${endIso})`,
    `and(submitted_at.is.null,created_at.gte.${startIso},created_at.lt.${endIso})`,
  ];
}

/** Inclusive UTC window for Application Date (submitted_at, else created_at). */
function buildApprovedTimeRangeOrParts(fromIso, toIso) {
  if (!fromIso || !toIso) {
    return [];
  }

  const startIso = quotePostgrestValue(fromIso);
  const endIso = quotePostgrestValue(toIso);

  return [
    `and(submitted_at.not.is.null,submitted_at.gte.${startIso},submitted_at.lte.${endIso})`,
    `and(submitted_at.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`,
  ];
}

async function findApplicantUserIdsForSearch(searchTerm) {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (query.length < 2) {
    return [];
  }

  const tokens = query.split(/\s+/).filter(Boolean).slice(0, 5);
  if (tokens.length === 0) {
    return [];
  }

  const orParts = [];
  for (const token of tokens) {
    const pattern = quotePostgrestValue(`%${escapeIlikePattern(token)}%`);
    orParts.push(
      `first_name.ilike.${pattern}`,
      `middle_name.ilike.${pattern}`,
      `last_name.ilike.${pattern}`,
      `suffix.ilike.${pattern}`
    );
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, middle_name, last_name, suffix")
    .or(orParts.join(","))
    .limit(APPROVED_USER_SEARCH_LIMIT);

  if (error) {
    throw error;
  }

  return (data || [])
    .filter((user) => {
      const haystack = buildDisplayName(user).toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    })
    .map((user) => user.id);
}

/**
 * Server-paginated Archive queue (approved + declined). Never loads the full set into memory.
 * Search matches application ID, applicant name, and application date across the whole dataset.
 * Optional time presets filter by Application Date (submitted_at, else created_at).
 * Pass `statuses` to limit to `approved`, `declined`, or both.
 */
export async function fetchArchiveApplicationsPage({
  sources = [],
  serviceId = null,
  search = "",
  page = 1,
  pageSize = APPROVED_PAGE_SIZE_DEFAULT,
  timeRange = null,
  statuses = ["approved", "declined"],
} = {}) {
  const sourceList = Array.isArray(sources) ? sources : [];
  const resolved = sourceList.map((source) => ({
    ...source,
    serviceId: resolveServiceId(source),
  }));
  const allServiceIds = [
    ...new Set(resolved.map((source) => source.serviceId).filter(Boolean)),
  ];

  if (allServiceIds.length === 0) {
    return { applications: [], total: 0, page: 1, pageSize, range: null };
  }

  const scopedServiceId = serviceId ? String(serviceId).trim() : null;
  const serviceIds = scopedServiceId
    ? allServiceIds.filter((id) => id === scopedServiceId)
    : allServiceIds;

  if (serviceIds.length === 0) {
    return { applications: [], total: 0, page: 1, pageSize, range: null };
  }

  const metaByServiceId = Object.fromEntries(
    resolved.filter((source) => source.serviceId).map((source) => [source.serviceId, source])
  );

  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize) || APPROVED_PAGE_SIZE_DEFAULT));
  let safePage = Math.max(1, Math.floor(page) || 1);
  const searchTerm = String(search || "").trim();
  let matchingUserIds = [];
  const dateRange = searchTerm ? parseApprovedSearchDateRange(searchTerm) : null;
  if (searchTerm) {
    matchingUserIds = await findApplicantUserIdsForSearch(searchTerm);
  }

  const rangeFrom =
    typeof timeRange?.from === "string" && timeRange.from.trim()
      ? timeRange.from.trim()
      : null;
  const rangeTo =
    typeof timeRange?.to === "string" && timeRange.to.trim()
      ? timeRange.to.trim()
      : null;
  const timeRangeOrParts = buildApprovedTimeRangeOrParts(rangeFrom, rangeTo);

  const allowedStatuses = (Array.isArray(statuses) ? statuses : ["approved", "declined"])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => value === "approved" || value === "declined");
  const archiveStatuses = allowedStatuses.length > 0 ? [...new Set(allowedStatuses)] : ["approved", "declined"];

  const buildQuery = () => {
    let nextQuery = supabase
      .from("assistance_requests")
      .select(REQUEST_LIST_SELECT, { count: "exact" })
      .in("status", archiveStatuses)
      .in("service_id", serviceIds)
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (timeRangeOrParts.length > 0) {
      nextQuery = nextQuery.or(timeRangeOrParts.join(","));
    }

    if (searchTerm) {
      const pattern = quotePostgrestValue(`%${escapeIlikePattern(searchTerm)}%`);
      const orParts = [
        `request_code.ilike.${pattern}`,
        ...buildApprovedDateSearchOrParts(dateRange),
      ];
      if (matchingUserIds.length > 0) {
        orParts.push(`user_id.in.(${matchingUserIds.join(",")})`);
      }
      nextQuery = nextQuery.or(orParts.join(","));
    }

    return nextQuery;
  };

  const fetchPage = async (pageNumber) => {
    const from = (pageNumber - 1) * safePageSize;
    const to = from + safePageSize - 1;
    return buildQuery().range(from, to);
  };

  let { data: rows, error, count } = await fetchPage(safePage);

  if (error) {
    throw error;
  }

  const total = Number(count || 0);
  const maxPage = Math.max(1, Math.ceil(total / safePageSize) || 1);

  if (total > 0 && safePage > maxPage) {
    safePage = maxPage;
    ({ data: rows, error, count } = await fetchPage(safePage));
    if (error) {
      throw error;
    }
  }

  const userIds = [
    ...new Set((rows || []).map((row) => row.user_id).filter(Boolean)),
  ];

  let usersById = {};
  if (userIds.length > 0) {
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", userIds);

    if (usersError) {
      throw usersError;
    }

    usersById = Object.fromEntries((usersData || []).map((user) => [user.id, user]));
  }

  const applications = (rows || []).map((row) => {
    const meta = metaByServiceId[row.service_id] || {};
    const rowServiceId = row.service_id || meta.serviceId || "";

    return {
      key: `${rowServiceId}-${row.id}`,
      id: row.request_code || row.id,
      requestId: row.id,
      requestCode: row.request_code || row.id,
      userId: row.user_id,
      name: buildDisplayName(usersById[row.user_id]),
      category: requestServiceLabel(row, meta),
      date: formatDate(row.submitted_at || row.created_at),
      submittedAt: row.submitted_at || null,
      updatedAt: row.updated_at || null,
      createdAt: row.created_at,
      status: normalizeStatus(row.status),
      serviceId: rowServiceId,
      caseStudyDate: row.case_study_date ?? null,
    };
  });

  return {
    applications,
    total: Number(count ?? total),
    page: total === 0 ? 1 : safePage,
    pageSize: safePageSize,
    range: timeRange
      ? {
          from: rangeFrom,
          to: rangeTo,
          label: timeRange.label || null,
        }
      : null,
  };
}

/** @deprecated Use `fetchArchiveApplicationsPage`. */
export const fetchApprovedApplicationsPage = fetchArchiveApplicationsPage;

