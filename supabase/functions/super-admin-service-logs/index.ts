import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

/**
 * POST /functions/v1/super-admin-service-logs
 *
 * Centralized assistance-request log for superadmin Data Management.
 * The browser never queries assistance_requests / users directly for this
 * module: every read is brokered here, behind is_superadmin(), and only the
 * whitelisted projection below is returned.
 *
 * Labels prefer immutable snapshots on assistance_requests (service_name,
 * assistance_name, category_id). The live catalog is a fallback for rows that
 * predate the retention migration.
 *
 * Actions:
 *  - listServiceLogs (paged rows + faceted counts)
 *  - getServiceLog   (one row + applicant identity)
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const USER_SEARCH_CAP = 100;
const FACET_SCAN_CAP = 5000;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_SEARCH_CHARS = 120;
const MAX_NAME_CHARS = 200;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_CALLS = 120;

const USER_SELECT = "id, first_name, middle_name, last_name, suffix, email, barangay";
const USER_SELECT_MINIMAL = "id, first_name, middle_name, last_name, suffix";
const REQUEST_SELECT =
  "id, request_code, status, service_id, user_id, service_name, assistance_name, category_id, submitted_at, created_at, updated_at, case_study_date";
const FACET_SELECT = "status, assistance_name, category_id, service_id, service_name";

/** DB values accepted per status label. Anything else is rejected, not passed through. Drafts are never listed. */
const STATUS_ALIASES: Record<string, string[]> = {
  pending: ["pending"],
  "in progress": ["in progress", "in_progress"],
  "action required": ["action required", "action_required"],
  resubmitted: ["resubmitted"],
  "for approval": ["for approval", "for_approval"],
  scheduled: ["scheduled"],
  "case study": ["case study", "case_study"],
  approved: ["approved"],
  declined: ["declined", "denied", "rejected"],
};

type Payload = {
  action?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  assistanceName?: string;
  categoryId?: string;
  serviceName?: string;
  serviceId?: string;
  preset?: string;
  from?: string;
  to?: string;
  includeFacets?: boolean;
  requestId?: string;
};

type DateRange = {
  preset: string;
  from: string | null;
  to: string | null;
  label: string;
};

type ServiceMeta = {
  serviceName: string;
  assistanceName: string;
  categoryId: string | null;
};

/** Selection normalized once, then reused by both the SQL filters and the facet math. */
type Selection = {
  search: string;
  searchUuid: string | null;
  searchToken: string;
  userIds: string[];
  statusValues: string[];
  assistanceCategoryId: string | null;
  assistanceNames: string[];
  serviceId: string | null;
  serviceName: string;
  range: DateRange;
};

type FacetDimension = "status" | "assistance" | "service";

/** Error whose message is safe to show the caller. Everything else is masked. */
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function secureJson(body: unknown, status = 200) {
  return jsonResponse(body, status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message || "");
  }
  return String(error ?? "");
}

/**
 * Best-effort per-caller throttle. Isolates are not shared, so this bounds a
 * single hot isolate rather than the whole project; it is cheap insurance
 * against a runaway client loop hammering full-table facet scans.
 */
const rateBuckets = new Map<string, number[]>();

function isRateLimited(callerId: string) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  for (const [key, hits] of rateBuckets) {
    const fresh = hits.filter((hit) => hit > cutoff);
    if (fresh.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, fresh);
  }

  const current = rateBuckets.get(callerId) || [];
  if (current.length >= RATE_LIMIT_MAX_CALLS) return true;
  current.push(now);
  rateBuckets.set(callerId, current);
  return false;
}

async function ensureSuperAdminCaller(
  supabase: ReturnType<typeof getServiceClient>,
  callerUserId: string
) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: callerUserId });
  if (error) throw error;
  return data === true;
}

function isUuidLike(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

function scalarString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function boundedString(value: unknown, maxChars: number) {
  return scalarString(value).slice(0, maxChars).trim();
}

function buildFullName(row: Record<string, unknown>) {
  const parts = [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .map((part) => scalarString(part))
    .filter(Boolean);
  return parts.join(" ") || "—";
}

function formatAssistanceName(value: unknown) {
  const name = scalarString(value);
  if (!name) return "";
  if (name.toLowerCase().endsWith(" assistance")) return name;
  return `${name} Assistance`;
}

function stripAssistanceSuffix(value: unknown) {
  return scalarString(value).replace(/\s+assistance$/i, "").trim();
}

/**
 * PostgREST `or(...)` takes a filter expression, so only a conservative
 * character set may reach it. Everything else is dropped before it is used.
 */
function safeLikeToken(value: string) {
  return value.replace(/[^A-Za-z0-9\- ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** PostgREST requires quoted values when wildcards are used inside `or(...)`. */
function quoteFilterValue(value: string) {
  return `"${String(value).replace(/"/g, "")}"`;
}

function formatUtcDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

function startOfUtcWeek(date: Date) {
  const day = startOfUtcDay(date);
  const weekday = day.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - daysFromMonday);
  return day;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseUtcDateOnly(value: unknown) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function resolveDateRange(
  presetInput: unknown,
  customFrom?: unknown,
  customTo?: unknown
): DateRange {
  const preset = String(presetInput || "all_time").trim().toLowerCase() || "all_time";
  const now = new Date();
  const todayEnd = endOfUtcDay(now);

  if (preset === "custom") {
    const from = parseUtcDateOnly(customFrom);
    const to = parseUtcDateOnly(customTo);
    if (!from || !to) {
      throw new ApiError("Select both a start and end date.");
    }
    const toEnd = endOfUtcDay(to);
    if (from.getTime() > toEnd.getTime()) {
      throw new ApiError("Start date must be on or before end date.");
    }
    return {
      preset: "custom",
      from: from.toISOString(),
      to: toEnd.toISOString(),
      label: `${formatUtcDateLabel(from)} – ${formatUtcDateLabel(to)}`,
    };
  }

  if (preset === "week") {
    const from = startOfUtcWeek(now);
    return {
      preset: "week",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `This Week · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (preset === "month") {
    const from = startOfUtcMonth(now);
    return {
      preset: "month",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `This Month · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (preset === "day") {
    const from = startOfUtcDay(now);
    return {
      preset: "day",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `Today · ${formatUtcDateLabel(from)}`,
    };
  }

  return { preset: "all_time", from: null, to: null, label: "All Time" };
}

function normalizeStatusLabel(raw: unknown) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (["action required", "action_required", "requires_action"].includes(key)) {
    return "Action Required";
  }
  if (["in progress", "in_progress"].includes(key)) return "In Progress";
  if (["for approval", "for_approval"].includes(key)) return "For Approval";
  if (["case study", "case_study", "casestudy", "for case study"].includes(key)) {
    return "Case Study";
  }
  if (key === "resubmitted") return "Resubmitted";
  if (key === "scheduled") return "Scheduled";
  if (key === "approved") return "Approved";
  if (["declined", "denied", "rejected"].includes(key)) return "Declined";
  if (key === "pending") return "Pending";
  if (!key) return "Pending";
  return "Pending";
}

function statusFilterValues(statusInput: unknown) {
  const raw = boundedString(statusInput, 40).toLowerCase();
  if (!raw) return [] as string[];
  if (STATUS_ALIASES[raw]) return STATUS_ALIASES[raw];
  const byLabel = Object.entries(STATUS_ALIASES).find(([dbValue, aliases]) => {
    return normalizeStatusLabel(dbValue).toLowerCase() === raw || aliases.includes(raw);
  });
  if (byLabel) return byLabel[1];
  throw new ApiError("Unknown status filter.");
}

/** Both spellings are accepted so "Medical" and "Medical Assistance" chips match. */
function assistanceNameVariants(value: string) {
  if (!value) return [] as string[];
  const raw = stripAssistanceSuffix(value);
  const formatted = formatAssistanceName(raw || value);
  return [...new Set([value, raw, formatted].filter(Boolean))];
}

async function resolveServiceMetaByIds(
  supabase: ReturnType<typeof getServiceClient>,
  serviceIds: unknown[]
) {
  const ids = [...new Set(serviceIds.filter(Boolean).map(String))].filter(isUuidLike);
  const metaByServiceId: Record<string, ServiceMeta> = {};
  if (ids.length === 0) return metaByServiceId;

  const { data: services, error: servicesError } = await supabase
    .from("assistance_services")
    .select("id, display_name, category_id")
    .in("id", ids);

  if (servicesError) {
    const retry = await supabase
      .from("assistance_services")
      .select("id, display_name")
      .in("id", ids);
    if (retry.error) throw retry.error;
    for (const service of retry.data || []) {
      metaByServiceId[String(service.id)] = {
        serviceName: scalarString(service.display_name) || "Service",
        assistanceName: "",
        categoryId: null,
      };
    }
    return metaByServiceId;
  }

  const categoryIds = [
    ...new Set(
      (services || [])
        .map((service) => service.category_id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  let categoriesById: Record<string, string> = {};
  if (categoryIds.length > 0) {
    const { data: categories, error: categoriesError } = await supabase
      .from("assistance_categories")
      .select("id, assistance_name")
      .in("id", categoryIds);
    if (!categoriesError) {
      categoriesById = Object.fromEntries(
        (categories || []).map((category) => [
          String(category.id),
          formatAssistanceName(category.assistance_name),
        ])
      );
    }
  }

  for (const service of services || []) {
    const categoryId = service.category_id ? String(service.category_id) : null;
    metaByServiceId[String(service.id)] = {
      serviceName: scalarString(service.display_name) || "Service",
      assistanceName: categoryId ? categoriesById[categoryId] || "" : "",
      categoryId,
    };
  }

  return metaByServiceId;
}

async function fetchUsersByIds(
  supabase: ReturnType<typeof getServiceClient>,
  userIds: string[]
) {
  const ids = [...new Set(userIds.filter(Boolean).map(String))].filter(isUuidLike);
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;

  const { data, error } = await supabase.from("users").select(USER_SELECT).in("id", ids);
  if (error) {
    const retry = await supabase.from("users").select(USER_SELECT_MINIMAL).in("id", ids);
    if (retry.error) throw retry.error;
    for (const row of retry.data || []) {
      map.set(String(row.id), row as Record<string, unknown>);
    }
    return map;
  }

  for (const row of data || []) {
    map.set(String(row.id), row as Record<string, unknown>);
  }
  return map;
}

function mapApplicant(row: Record<string, unknown> | undefined, userId: string | null) {
  if (!row) {
    return { userId, applicantName: "—", applicantEmail: "", applicantBarangay: "" };
  }
  return {
    userId: String(row.id || userId || ""),
    applicantName: buildFullName(row),
    applicantEmail: scalarString(row.email),
    applicantBarangay: scalarString(row.barangay),
  };
}

function mapRequestRow(
  row: Record<string, unknown>,
  metaByServiceId: Record<string, ServiceMeta>,
  userMap: Map<string, Record<string, unknown>>
) {
  const serviceId = row.service_id ? String(row.service_id) : null;
  const userId = row.user_id ? String(row.user_id) : null;
  const snapshotService = scalarString(row.service_name);
  const snapshotAssistance = scalarString(row.assistance_name);
  const meta = (serviceId && metaByServiceId[serviceId]) || {
    serviceName: "Service",
    assistanceName: "",
    categoryId: null,
  };

  return {
    id: row.id,
    requestCode: scalarString(row.request_code) || scalarString(row.id),
    status: normalizeStatusLabel(row.status),
    statusRaw: scalarString(row.status),
    serviceId,
    serviceName: snapshotService || meta.serviceName,
    assistanceName: snapshotAssistance
      ? formatAssistanceName(snapshotAssistance)
      : meta.assistanceName,
    categoryId: row.category_id ? String(row.category_id) : meta.categoryId,
    submittedAt: row.submitted_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    caseStudyDate: row.case_study_date || null,
    ...mapApplicant(userId ? userMap.get(userId) : undefined, userId),
  };
}

/** Rows already carrying both snapshots need no catalog lookup at all. */
function serviceIdsNeedingCatalogFallback(rows: Record<string, unknown>[]) {
  return rows
    .filter((row) => !scalarString(row.service_name) || !scalarString(row.assistance_name))
    .map((row) => row.service_id);
}

async function findUserIdsForSearch(
  supabase: ReturnType<typeof getServiceClient>,
  token: string
) {
  if (!token) return [] as string[];
  const pattern = quoteFilterValue(`%${token}%`);

  const attempt = async (columns: string[]) => {
    let query = supabase.from("users").select("id").limit(USER_SEARCH_CAP);
    if (columns.length === 1) {
      query = query.ilike(columns[0], `%${token}%`);
    } else {
      query = query.or(columns.map((column) => `${column}.ilike.${pattern}`).join(","));
    }
    return await query;
  };

  const { data, error } = await attempt([
    "first_name",
    "middle_name",
    "last_name",
    "suffix",
    "email",
    "contact_number",
    "voter_id_number",
  ]);

  if (error) {
    const retry = await attempt(["first_name", "middle_name", "last_name", "suffix"]);
    if (retry.error) throw retry.error;
    return (retry.data || []).map((row) => String(row.id));
  }

  return (data || []).map((row) => String(row.id));
}

async function buildSelection(
  supabase: ReturnType<typeof getServiceClient>,
  body: Payload
): Promise<Selection> {
  const range = resolveDateRange(body.preset, body.from, body.to);
  const search = boundedString(body.search, MAX_SEARCH_CHARS);
  const searchUuid = isUuidLike(search) ? search : null;
  const searchToken = searchUuid ? "" : safeLikeToken(search);

  const categoryId = boundedString(body.categoryId, 64);
  const serviceId = boundedString(body.serviceId, 64);
  if (categoryId && !isUuidLike(categoryId)) {
    throw new ApiError("Invalid assistance filter.");
  }
  if (serviceId && !isUuidLike(serviceId)) {
    throw new ApiError("Invalid service filter.");
  }

  const assistanceName = boundedString(body.assistanceName, MAX_NAME_CHARS);

  return {
    search,
    searchUuid,
    searchToken,
    userIds: searchToken ? await findUserIdsForSearch(supabase, searchToken) : [],
    statusValues: statusFilterValues(body.status),
    assistanceCategoryId: categoryId || null,
    assistanceNames: categoryId ? [] : assistanceNameVariants(assistanceName),
    serviceId: serviceId || null,
    serviceName: serviceId ? "" : boundedString(body.serviceName, MAX_NAME_CHARS),
    range,
  };
}

function applyRequestFilters(
  // deno-lint-ignore no-explicit-any
  query: any,
  selection: Selection,
  omit: FacetDimension | null = null
) {
  let next = query.neq("status", "draft");

  if (selection.range.from) next = next.gte("created_at", selection.range.from);
  if (selection.range.to) next = next.lte("created_at", selection.range.to);

  if (selection.searchUuid) {
    next = next.or(`id.eq.${selection.searchUuid},user_id.eq.${selection.searchUuid}`);
  } else if (selection.search) {
    if (!selection.searchToken && selection.userIds.length === 0) {
      return { empty: true as const, query: next };
    }
    if (selection.searchToken && selection.userIds.length > 0) {
      const codePattern = quoteFilterValue(`%${selection.searchToken}%`);
      next = next.or(
        `request_code.ilike.${codePattern},user_id.in.(${selection.userIds.join(",")})`
      );
    } else if (selection.searchToken) {
      next = next.ilike("request_code", `%${selection.searchToken}%`);
    } else {
      next = next.in("user_id", selection.userIds);
    }
  }

  if (omit !== "status" && selection.statusValues.length > 0) {
    next = next.in("status", selection.statusValues);
  }

  if (omit !== "assistance") {
    if (selection.assistanceCategoryId) {
      next = next.eq("category_id", selection.assistanceCategoryId);
    } else if (selection.assistanceNames.length > 0) {
      next = next.in("assistance_name", selection.assistanceNames);
    }
  }

  if (omit !== "service") {
    if (selection.serviceId) {
      next = next.eq("service_id", selection.serviceId);
    } else if (selection.serviceName) {
      next = next.eq("service_name", selection.serviceName);
    }
  }

  return { empty: false as const, query: next };
}

/**
 * One scan feeds all three facet groups. Each group is counted with the other
 * dimensions still applied, so a chip's number is what you get when you click
 * it — without paying for a query per dimension.
 */
async function fetchFacetRows(
  supabase: ReturnType<typeof getServiceClient>,
  selection: Selection
) {
  const scanSelection: Selection = {
    ...selection,
    statusValues: [],
    assistanceCategoryId: null,
    assistanceNames: [],
    serviceId: null,
    serviceName: "",
  };
  const base = supabase
    .from("assistance_requests")
    .select(FACET_SELECT)
    .order("created_at", { ascending: false })
    .limit(FACET_SCAN_CAP + 1);
  const filtered = applyRequestFilters(base, scanSelection);
  if (filtered.empty) return { rows: [] as Record<string, unknown>[], truncated: false };

  const { data, error } = await filtered.query;
  if (error) throw error;

  const rows = (data || []) as Record<string, unknown>[];
  const truncated = rows.length > FACET_SCAN_CAP;
  return { rows: truncated ? rows.slice(0, FACET_SCAN_CAP) : rows, truncated };
}

function buildFacets(rows: Record<string, unknown>[], selection: Selection, truncated: boolean) {
  const matchesStatus = (row: Record<string, unknown>) =>
    selection.statusValues.length === 0 ||
    selection.statusValues.includes(String(row.status ?? "").trim().toLowerCase());

  const assistanceNameSet = new Set(
    selection.assistanceNames.map((name) => name.toLowerCase())
  );
  const matchesAssistance = (row: Record<string, unknown>) => {
    if (selection.assistanceCategoryId) {
      return String(row.category_id ?? "") === selection.assistanceCategoryId;
    }
    if (assistanceNameSet.size === 0) return true;
    return assistanceNameSet.has(scalarString(row.assistance_name).toLowerCase());
  };

  const matchesService = (row: Record<string, unknown>) => {
    if (selection.serviceId) return String(row.service_id ?? "") === selection.serviceId;
    if (!selection.serviceName) return true;
    return scalarString(row.service_name) === selection.serviceName;
  };

  const statuses: Record<string, number> = {};
  const assistanceMap = new Map<
    string,
    { key: string; label: string; categoryId: string | null; assistanceName: string; count: number }
  >();
  const serviceMap = new Map<
    string,
    {
      key: string;
      label: string;
      serviceId: string | null;
      serviceName: string;
      assistanceName: string;
      count: number;
    }
  >();

  for (const row of rows) {
    const okStatus = matchesStatus(row);
    const okAssistance = matchesAssistance(row);
    const okService = matchesService(row);

    if (okAssistance && okService) {
      const rawStatus = String(row.status ?? "").trim().toLowerCase();
      if (rawStatus !== "draft") {
        const label = normalizeStatusLabel(row.status);
        statuses[label] = (statuses[label] || 0) + 1;
      }
    }

    if (okStatus && okService) {
      const snapshot = scalarString(row.assistance_name);
      const label = snapshot ? formatAssistanceName(snapshot) : "";
      if (label) {
        const categoryId = row.category_id ? String(row.category_id) : null;
        const key = categoryId || label.toLowerCase();
        const current = assistanceMap.get(key);
        if (current) current.count += 1;
        else {
          assistanceMap.set(key, {
            key,
            label,
            categoryId,
            assistanceName: label,
            count: 1,
          });
        }
      }
    }

    if (okStatus && okAssistance) {
      const label = scalarString(row.service_name);
      if (label) {
        const serviceId = row.service_id ? String(row.service_id) : null;
        const key = serviceId || label.toLowerCase();
        const current = serviceMap.get(key);
        if (current) current.count += 1;
        else {
          serviceMap.set(key, {
            key,
            label,
            serviceId,
            serviceName: label,
            assistanceName: scalarString(row.assistance_name)
              ? formatAssistanceName(row.assistance_name)
              : "",
            count: 1,
          });
        }
      }
    }
  }

  const byCountThenLabel = (
    a: { count: number; label: string },
    b: { count: number; label: string }
  ) => b.count - a.count || a.label.localeCompare(b.label);

  return {
    statuses,
    assistance: [...assistanceMap.values()].sort(byCountThenLabel),
    services: [...serviceMap.values()].sort(byCountThenLabel),
    truncated,
  };
}

function emptyFacets() {
  return { statuses: {}, assistance: [], services: [], truncated: false };
}

async function listServiceLogs(
  supabase: ReturnType<typeof getServiceClient>,
  body: Payload
) {
  const selection = await buildSelection(supabase, body);
  const includeFacets = body.includeFacets !== false;
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Math.floor(Number(body.pageSize) || PAGE_SIZE_DEFAULT))
  );
  const page = Math.max(1, Math.floor(Number(body.page) || 1));
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  const emptyResult = {
    logs: [] as ReturnType<typeof mapRequestRow>[],
    total: 0,
    page,
    pageSize,
    range: selection.range,
    ...(includeFacets ? { facets: emptyFacets() } : {}),
  };

  const listBase = supabase
    .from("assistance_requests")
    .select(REQUEST_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });
  const filteredList = applyRequestFilters(listBase, selection);
  if (filteredList.empty) return emptyResult;

  const [listResult, facetResult] = await Promise.all([
    filteredList.query.range(rangeFrom, rangeTo),
    includeFacets ? fetchFacetRows(supabase, selection) : Promise.resolve(null),
  ]);

  if (listResult.error) throw listResult.error;

  const rows = (listResult.data || []) as Record<string, unknown>[];
  const [userMap, metaByServiceId] = await Promise.all([
    fetchUsersByIds(
      supabase,
      rows.map((row) => String(row.user_id || ""))
    ),
    resolveServiceMetaByIds(supabase, serviceIdsNeedingCatalogFallback(rows)),
  ]);

  return {
    logs: rows.map((row) => mapRequestRow(row, metaByServiceId, userMap)),
    total: Number(listResult.count || 0),
    page,
    pageSize,
    range: selection.range,
    ...(facetResult
      ? { facets: buildFacets(facetResult.rows, selection, facetResult.truncated) }
      : {}),
  };
}

async function getServiceLog(
  supabase: ReturnType<typeof getServiceClient>,
  requestId: string
) {
  if (!isUuidLike(requestId)) {
    throw new ApiError("requestId is required.");
  }

  const { data, error } = await supabase
    .from("assistance_requests")
    .select(REQUEST_SELECT)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("Service log not found.", 404);

  const row = data as Record<string, unknown>;
  if (String(row.status ?? "").trim().toLowerCase() === "draft") {
    throw new ApiError("Service log not found.", 404);
  }
  const [userMap, metaByServiceId] = await Promise.all([
    fetchUsersByIds(supabase, [String(row.user_id || "")]),
    resolveServiceMetaByIds(supabase, serviceIdsNeedingCatalogFallback([row])),
  ]);

  const log = mapRequestRow(row, metaByServiceId, userMap);
  const profile = row.user_id ? userMap.get(String(row.user_id)) : undefined;

  return {
    log,
    user: profile
      ? {
          id: String(profile.id),
          fullName: buildFullName(profile),
          email: scalarString(profile.email),
          barangay: scalarString(profile.barangay),
        }
      : {
          id: log.userId,
          fullName: log.applicantName,
          email: log.applicantEmail,
          barangay: log.applicantBarangay,
        },
  };
}

async function readBody(req: Request): Promise<Payload> {
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    throw new ApiError("Request body too large.", 413);
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new ApiError("Request body too large.", 413);
  }

  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ApiError("Invalid JSON body.");
    }
    return parsed as Payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Invalid JSON body.");
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return secureJson({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();

    const auth = await authorizeRequest(req, supabase);
    if (!auth.ok) {
      return secureJson({ error: auth.error }, auth.status);
    }
    // Service-to-service secrets are not accepted: this data is superadmin-only.
    if (auth.viaSecret || !auth.userId) {
      return secureJson({ error: "Unauthorized" }, 401);
    }

    if (!(await ensureSuperAdminCaller(supabase, auth.userId))) {
      return secureJson({ error: "Forbidden" }, 403);
    }

    if (isRateLimited(auth.userId)) {
      return secureJson({ error: "Too many requests. Try again shortly." }, 429);
    }

    const body = await readBody(req);
    const action = String(body.action ?? "").trim();

    if (action === "listServiceLogs") {
      const result = await listServiceLogs(supabase, body);
      return secureJson({ success: true, action, ...result });
    }

    if (action === "getServiceLog") {
      const detail = await getServiceLog(supabase, String(body.requestId ?? ""));
      return secureJson({ success: true, action, ...detail });
    }

    return secureJson(
      { success: false, error: "Invalid action. Use listServiceLogs or getServiceLog." },
      400
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return secureJson({ success: false, error: error.message }, error.status);
    }
    // Database/runtime details stay in the function logs, never in the response.
    console.error("super-admin-service-logs failed:", errorMessage(error));
    return secureJson(
      { success: false, error: "Service logs request failed. Please try again." },
      500
    );
  }
});
