import { authorizeRequest, getServiceClient, ServiceClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse, preflight } from "../_shared/cors.ts";
import { applicantDisplayNameFromRequest, APPLICANT_SNAPSHOT_SELECT } from "../_shared/applicantSnapshot.ts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const PERIOD_KEYS = ["day", "week", "month", "all_time", "custom"] as const;
type PeriodKey = (typeof PERIOD_KEYS)[number];

const PRESET_RANGE_LABELS: Record<Exclude<PeriodKey, "custom">, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  all_time: "All Time",
};

interface ActivityLogDateRange {
  preset: PeriodKey;
  from: string | null;
  to: string | null;
  label: string;
}

interface ScopedServiceRow {
  id: string;
  category_id: string;
  display_name: string | null;
}

interface CatalogRow {
  services: ScopedServiceRow[];
}

interface DashboardScope {
  isSuperAdmin: boolean;
  categoryId: string | null;
  serviceIds: string[];
}

interface AuditLogRow {
  id: string;
  request_id: string;
  action: string | null;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  changed_at: string | null;
}

interface AssistanceRequestRow {
  id: string;
  request_code: string | null;
  user_id: string | null;
  service_id: string;
  service_name?: string | null;
  applicant_first_name?: string | null;
  applicant_middle_name?: string | null;
  applicant_last_name?: string | null;
  applicant_suffix?: string | null;
}

interface ActivityLogEntry {
  id: string;
  changed_at: string | null;
  action: string | null;
  action_label: string;
  old_status: string | null;
  new_status: string | null;
  request_id: string;
  request_code: string | null;
  applicant_name: string;
  service_category: string;
  admin_email: string | null;
}

function clampLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function clampOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  dayStart.setUTCDate(dayStart.getUTCDate() - diff);
  return dayStart;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

function parseUtcDateOnly(value: string): Date | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDate) {
    return new Date(
      Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    );
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return startOfUtcDay(parsed);
}

function formatUtcDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function normalizePreset(value: unknown): PeriodKey {
  const key = String(value ?? "").trim().toLowerCase();
  if (key === "today") {
    return "day";
  }
  if (PERIOD_KEYS.includes(key as PeriodKey)) {
    return key as PeriodKey;
  }
  return "day";
}

function resolveActivityLogDateRange(
  presetInput: unknown,
  customFrom?: unknown,
  customTo?: unknown
): ActivityLogDateRange {
  const preset = normalizePreset(presetInput);
  const now = new Date();
  const todayEnd = endOfUtcDay(now);

  if (preset === "all_time") {
    return {
      preset,
      from: null,
      to: null,
      label: PRESET_RANGE_LABELS.all_time,
    };
  }

  if (preset === "custom") {
    const from = parseUtcDateOnly(String(customFrom ?? ""));
    const to = parseUtcDateOnly(String(customTo ?? ""));
    if (!from || !to) {
      throw new Error("Select both a start and end date.");
    }

    const toEnd = endOfUtcDay(to);
    if (from.getTime() > toEnd.getTime()) {
      throw new Error("Start date must be on or before end date.");
    }

    return {
      preset,
      from: from.toISOString(),
      to: toEnd.toISOString(),
      label: `${formatUtcDateLabel(from)} – ${formatUtcDateLabel(to)}`,
    };
  }

  if (preset === "week") {
    const from = startOfUtcWeek(now);
    return {
      preset,
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_RANGE_LABELS.week} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (preset === "month") {
    const from = startOfUtcMonth(now);
    return {
      preset,
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_RANGE_LABELS.month} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  const from = startOfUtcDay(now);
  return {
    preset: "day",
    from: from.toISOString(),
    to: todayEnd.toISOString(),
    label: `${PRESET_RANGE_LABELS.day} · ${formatUtcDateLabel(from)}`,
  };
}

function mapServiceLabel(value: string | null, serviceId: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || serviceId;
}

function normalizeStatusLabel(raw: unknown): string {
  const key = String(raw ?? "").trim().toLowerCase();

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

  if (["in progress", "in_progress", "inprogress"].includes(key)) {
    return "In Progress";
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

  if (key === "draft") {
    return "Draft";
  }

  if (!key) {
    return "Pending";
  }

  return key
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityLabel(
  action: string | null,
  oldStatus: string | null,
  newStatus: string | null
): string {
  const actionKey = String(action ?? "").trim().toUpperCase();
  const newLabel = normalizeStatusLabel(newStatus);
  const oldLabel = normalizeStatusLabel(oldStatus);

  if (actionKey === "INSERT" || actionKey === "CREATE") {
    return "Apply";
  }

  if (actionKey === "DELETE") {
    return "Deleted";
  }

  if (newLabel && oldLabel && newLabel !== oldLabel) {
    return `Moved to ${newLabel}`;
  }

  if (newLabel) {
    return `Moved to ${newLabel}`;
  }

  if (actionKey === "STATUS_CHANGE") {
    return "Status updated";
  }

  if (actionKey === "UPDATE") {
    return "Updated";
  }

  return normalizeStatusLabel(action) || "Updated";
}

async function fetchCatalog(supabase: ServiceClient): Promise<CatalogRow> {
  const { data: services, error } = await supabase
    .from("assistance_services")
    .select("id, category_id, display_name")
    .order("sort_order");

  if (error) {
    throw error;
  }

  return {
    services: (services || []) as ScopedServiceRow[],
  };
}

async function resolveActivityLogScope(
  supabase: ServiceClient,
  auth: Awaited<ReturnType<typeof authorizeRequest>>,
  catalog: CatalogRow
): Promise<DashboardScope> {
  const allServiceIds = [
    ...new Set(
      catalog.services.map((service) => String(service.id || "").trim()).filter(Boolean)
    ),
  ];

  if (auth.viaSecret) {
    return {
      isSuperAdmin: true,
      categoryId: null,
      serviceIds: allServiceIds,
    };
  }

  const { data: adminRow, error } = await supabase
    .from("admins")
    .select("is_super_admin, category_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error || !adminRow) {
    throw new Error("Forbidden");
  }

  if (adminRow.is_super_admin === true) {
    return {
      isSuperAdmin: true,
      categoryId: null,
      serviceIds: allServiceIds,
    };
  }

  const categoryId = String(adminRow.category_id ?? "").trim();
  if (!categoryId) {
    throw new Error("Forbidden");
  }

  const serviceIds = catalog.services
    .filter((service) => service.category_id === categoryId)
    .map((service) => String(service.id || "").trim())
    .filter(Boolean);

  return {
    isSuperAdmin: false,
    categoryId,
    serviceIds,
  };
}

async function fetchScopedRequestIds(
  supabase: ServiceClient,
  serviceIds: string[]
): Promise<string[]> {
  if (!serviceIds.length) {
    return [];
  }

  const ids: string[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("assistance_requests")
      .select("id")
      .in("service_id", serviceIds)
      .neq("status", "draft")
      .range(from, to);

    if (error) {
      throw error;
    }

    const batch = (data || []) as Array<{ id: string }>;
    ids.push(...batch.map((row) => String(row.id)).filter(Boolean));

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return ids;
}

function applyAuditLogDateFilters(
  // deno-lint-ignore no-explicit-any
  query: any,
  range: ActivityLogDateRange
) {
  if (range.from) {
    query = query.gte("changed_at", range.from);
  }
  if (range.to) {
    query = query.lte("changed_at", range.to);
  }
  return query;
}

async function fetchAuditLogsPage(
  supabase: ServiceClient,
  requestIds: string[],
  offset: number,
  limit: number,
  range: ActivityLogDateRange
): Promise<{ rows: AuditLogRow[]; total: number }> {
  if (!requestIds.length) {
    return { rows: [], total: 0 };
  }

  let countQuery = supabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .in("request_id", requestIds);
  countQuery = applyAuditLogDateFilters(countQuery, range);

  const { count, error: countError } = await countQuery;

  if (countError) {
    throw countError;
  }

  let dataQuery = supabase
    .from("audit_logs")
    .select("id, request_id, action, old_status, new_status, changed_by, changed_at")
    .in("request_id", requestIds)
    .order("changed_at", { ascending: false })
    .range(offset, offset + limit - 1);
  dataQuery = applyAuditLogDateFilters(dataQuery, range);

  const { data, error } = await dataQuery;

  if (error) {
    throw error;
  }

  return {
    rows: (data || []) as AuditLogRow[],
    total: Number(count ?? 0),
  };
}

async function fetchRequestsByIds(
  supabase: ServiceClient,
  requestIds: string[]
): Promise<Map<string, AssistanceRequestRow>> {
  const map = new Map<string, AssistanceRequestRow>();
  if (!requestIds.length) {
    return map;
  }

  const chunkSize = 500;
  for (let index = 0; index < requestIds.length; index += chunkSize) {
    const chunk = requestIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("assistance_requests")
      .select(`id, request_code, user_id, service_id, service_name, ${APPLICANT_SNAPSHOT_SELECT}`)
      .in("id", chunk);

    if (error) {
      throw error;
    }

    for (const row of (data || []) as AssistanceRequestRow[]) {
      map.set(row.id, row);
    }
  }

  return map;
}

async function fetchServiceLabels(
  supabase: ServiceClient,
  serviceIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!serviceIds.length) {
    return map;
  }

  const { data, error } = await supabase
    .from("assistance_services")
    .select("id, display_name")
    .in("id", serviceIds);

  if (error) {
    throw error;
  }

  for (const row of data || []) {
    map.set(
      String(row.id),
      mapServiceLabel(row.display_name, String(row.id))
    );
  }

  return map;
}

async function fetchAdminEmails(
  supabase: ServiceClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (!userIds.length) {
    return emails;
  }

  const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
  const { data: adminRows, error: adminError } = await supabase
    .from("admins")
    .select("user_id")
    .in("user_id", uniqueIds);

  if (adminError) {
    throw adminError;
  }

  const adminIds = new Set(
    (adminRows || []).map((row) => String(row.user_id || "").trim()).filter(Boolean)
  );

  await Promise.all(
    uniqueIds
      .filter((userId) => adminIds.has(userId))
      .map(async (userId) => {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error || !data?.user?.email) {
          return;
        }
        emails.set(userId, String(data.user.email).trim().toLowerCase());
      })
  );

  return emails;
}

async function buildActivityLogsPayload(
  supabase: ServiceClient,
  scope: DashboardScope,
  offset: number,
  limit: number,
  range: ActivityLogDateRange
) {
  const requestIds = await fetchScopedRequestIds(supabase, scope.serviceIds);
  const { rows: auditRows, total } = await fetchAuditLogsPage(
    supabase,
    requestIds,
    offset,
    limit,
    range
  );

  const pageRequestIds = [
    ...new Set(auditRows.map((row) => row.request_id).filter(Boolean)),
  ];
  const requestsById = await fetchRequestsByIds(supabase, pageRequestIds);

  const serviceIds = [
    ...new Set(
      [...requestsById.values()]
        .map((request) => request.service_id)
        .filter(Boolean)
    ),
  ];
  const serviceLabels = await fetchServiceLabels(supabase, serviceIds);

  const changedByIds = [
    ...new Set(auditRows.map((row) => row.changed_by).filter(Boolean) as string[]),
  ];
  const adminEmails = await fetchAdminEmails(supabase, changedByIds);

  const logs: ActivityLogEntry[] = auditRows.map((row) => {
    const request = requestsById.get(row.request_id);
    const changedBy = row.changed_by ? String(row.changed_by) : null;

    return {
      id: row.id,
      changed_at: row.changed_at,
      action: row.action,
      action_label: formatActivityLabel(row.action, row.old_status, row.new_status),
      old_status: row.old_status,
      new_status: row.new_status,
      request_id: row.request_id,
      request_code: request?.request_code ?? null,
      applicant_name: applicantDisplayNameFromRequest(request as Record<string, unknown> | undefined),
      service_category: request
        ? String(request.service_name || "").trim() ||
          (request.service_id
            ? serviceLabels.get(request.service_id) || request.service_id
            : "Unknown Service")
        : "Unknown Service",
      admin_email: changedBy ? adminEmails.get(changedBy) ?? null : null,
    };
  });

  return {
    scope: {
      is_super_admin: scope.isSuperAdmin,
      category_id: scope.categoryId,
      service_count: scope.serviceIds.length,
    },
    range,
    logs,
    pagination: {
      limit,
      offset,
      total,
      has_more: offset + logs.length < total,
    },
  };
}

async function parseRequestOptions(req: Request) {
  if (req.method === "GET") {
    const url = new URL(req.url);
    return {
      limit: clampLimit(url.searchParams.get("limit")),
      offset: clampOffset(url.searchParams.get("offset")),
      preset: normalizePreset(url.searchParams.get("preset") || "day"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    };
  }

  try {
    const body = await req.json();
    return {
      limit: clampLimit(body?.limit),
      offset: clampOffset(body?.offset),
      preset: normalizePreset(body?.preset ?? "day"),
      from: body?.from ?? null,
      to: body?.to ?? null,
    };
  } catch {
    return {
      limit: DEFAULT_LIMIT,
      offset: 0,
      preset: "day" as PeriodKey,
      from: null,
      to: null,
    };
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) {
    return pre;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();
    const auth = await authorizeRequest(
      req,
      supabase,
      "ADMIN_ACTIVITY_LOGS_SECRET"
    );

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    if (auth.viaSecret) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: adminMembership, error: adminCheckError } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (adminCheckError) {
      throw adminCheckError;
    }

    if (!adminMembership) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { limit, offset, preset, from, to } = await parseRequestOptions(req);
    const range = resolveActivityLogDateRange(preset, from, to);
    const catalog = await fetchCatalog(supabase);
    const scope = await resolveActivityLogScope(supabase, auth, catalog);
    const payload = await buildActivityLogsPayload(
      supabase,
      scope,
      offset,
      limit,
      range
    );

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
