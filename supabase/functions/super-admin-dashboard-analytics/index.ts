import { authorizeRequest, getServiceClient, ServiceClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse, preflight } from "../_shared/cors.ts";

const STATUS_BUCKETS = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
] as const;
type StatusBucket = (typeof STATUS_BUCKETS)[number];
const PERIOD_KEYS = ["day", "week", "month", "all_time"] as const;
type PeriodKey = (typeof PERIOD_KEYS)[number];

type StatusCountMap = Record<StatusBucket, number>;
type PeriodTotals = Record<PeriodKey, number>;
type PeriodStatuses = Record<PeriodKey, StatusCountMap>;

interface CategoryRow {
  id: string;
  slug: string | null;
  assistance_name: string | null;
  sort_order: number | null;
  theme_json: unknown;
}

interface ServiceRow {
  id: string;
  category_id: string;
  display_name: string | null;
  sort_order: number | null;
}

interface RequestRow {
  id: string;
  request_code: string | null;
  service_id: string;
  status: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CategoryMetricBundle {
  label: string;
  totals: PeriodTotals;
  statuses: PeriodStatuses;
}

interface MonitorRow {
  category_id: string;
  label: string;
  applications: number;
  statuses: StatusCountMap;
}

interface MonitorSnapshot {
  range: {
    preset: PeriodKey | "custom";
    from: string | null;
    to: string | null;
    label: string;
  };
  rows: MonitorRow[];
}

interface CustomMonitorRequest {
  from: string;
  to: string;
}

const PRESET_RANGE_LABELS: Record<PeriodKey, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  all_time: "All Time",
};

function emptyStatuses(): StatusCountMap {
  return {
    Pending: 0,
    "In Progress": 0,
    "Action Required": 0,
    Resubmitted: 0,
    "For Approval": 0,
    Scheduled: 0,
    Approved: 0,
  };
}

function emptyPeriodTotals(): PeriodTotals {
  return { day: 0, week: 0, month: 0, all_time: 0 };
}

function emptyPeriodStatuses(): PeriodStatuses {
  return {
    day: emptyStatuses(),
    week: emptyStatuses(),
    month: emptyStatuses(),
    all_time: emptyStatuses(),
  };
}

function resolveStatusBucket(raw: unknown): StatusBucket {
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

  return "Pending";
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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseUtcDateOnly(value: string): Date | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoDate) {
    return new Date(
      Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    );
  }

  const parsed = parseDate(trimmed);
  return parsed ? startOfUtcDay(parsed) : null;
}

function formatUtcDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function resolveActivityDate(row: RequestRow): Date | null {
  return (
    parseDate(row.submitted_at) ??
    parseDate(row.created_at) ??
    parseDate(row.updated_at)
  );
}

function mapCategoryLabel(value: string | null, categoryId: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || categoryId;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function normalizeThemeHex(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value) return null;
  if (!value.startsWith("#") && HEX_RE.test(value)) {
    value = `#${value}`;
  }
  if (!HEX_RE.test(value)) return null;
  if (value.length === 4) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (value.length === 9) {
    return value.slice(0, 7).toLowerCase();
  }
  return value.toLowerCase();
}

function legacyGradientPair(raw: unknown): [string, string] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const a = normalizeThemeHex(raw[0]);
  const b = normalizeThemeHex(raw[1]);
  if (!a || !b) return null;
  return [a, b];
}

function defaultAccentHexForSlug(slug: string | null): string {
  const key = String(slug ?? "").trim().toLowerCase();
  if (key === "medical") return "#12b4d8";
  if (key === "financial") return "#f6d34d";
  if (key === "burial") return "#7c3aed";
  return "#6b7280";
}

function parseThemeJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return normalizeThemeHex(raw) ? { primary: raw } : null;
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function readAccentFromThemeObject(obj: Record<string, unknown> | null): string | null {
  if (!obj) return null;

  const primary = normalizeThemeHex(obj.primary);
  if (primary) return primary;

  const stripe =
    legacyGradientPair(obj.home_card_stripe_gradient) ??
    legacyGradientPair(obj.homeCardStripeGradient);
  if (stripe) return stripe[0];

  const status =
    legacyGradientPair(obj.status_card_header_gradient) ??
    legacyGradientPair(obj.statusCardHeaderGradient);
  if (status) return status[0];

  const secondary = normalizeThemeHex(obj.secondary);
  if (secondary) return secondary;

  return null;
}

function resolveCategoryColor(category: CategoryRow): string {
  const parsed = parseThemeJson(category.theme_json);
  return (
    readAccentFromThemeObject(parsed) ?? defaultAccentHexForSlug(category.slug)
  );
}

function buildCategoryColorMap(categories: CategoryRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const category of categories) {
    map.set(category.id, resolveCategoryColor(category));
  }
  return map;
}

function buildPresetRangeMeta(periodKey: PeriodKey): MonitorSnapshot["range"] {
  const now = new Date();
  const todayEnd = endOfUtcDay(now);

  if (periodKey === "all_time") {
    return {
      preset: periodKey,
      from: null,
      to: null,
      label: PRESET_RANGE_LABELS.all_time,
    };
  }

  if (periodKey === "week") {
    const from = startOfUtcWeek(now);
    return {
      preset: periodKey,
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_RANGE_LABELS.week} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (periodKey === "month") {
    const from = startOfUtcMonth(now);
    return {
      preset: periodKey,
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

function buildMonitorRow(
  categoryId: string,
  label: string,
  statuses: StatusCountMap,
  applications: number
): MonitorRow {
  return {
    category_id: categoryId,
    label,
    applications,
    statuses,
  };
}

function buildMonitorSnapshot(
  categories: CategoryRow[],
  metricsByCategoryId: Record<string, CategoryMetricBundle>,
  periodKey: PeriodKey
): MonitorSnapshot {
  const rows = categories
    .map((category) => {
      const metric = metricsByCategoryId[category.id];
      if (!metric) return null;

      return buildMonitorRow(
        category.id,
        metric.label,
        { ...metric.statuses[periodKey] },
        metric.totals[periodKey]
      );
    })
    .filter((row): row is MonitorRow => row !== null)
    .sort((a, b) => {
      if (b.applications !== a.applications) {
        return b.applications - a.applications;
      }
      return a.label.localeCompare(b.label);
    });

  return {
    range: buildPresetRangeMeta(periodKey),
    rows,
  };
}

function buildMonitorCustomRange(
  categories: CategoryRow[],
  rows: RequestRow[],
  serviceCategoryById: Map<string, string>,
  metricsByCategoryId: Record<string, CategoryMetricBundle>,
  fromStr: string,
  toStr: string
): MonitorSnapshot | null {
  const from = parseUtcDateOnly(fromStr);
  const to = parseUtcDateOnly(toStr);
  if (!from || !to) return null;

  const toEnd = endOfUtcDay(to);
  if (from.getTime() > toEnd.getTime()) return null;

  const aggregates = new Map<
    string,
    { label: string; statuses: StatusCountMap; applications: number }
  >();

  for (const category of categories) {
    const metric = metricsByCategoryId[category.id];
    if (!metric) continue;
    aggregates.set(category.id, {
      label: metric.label,
      statuses: emptyStatuses(),
      applications: 0,
    });
  }

  for (const row of rows) {
    const serviceId = String(row.service_id || "").trim();
    const categoryId = serviceCategoryById.get(serviceId);
    if (!categoryId) continue;

    const aggregate = aggregates.get(categoryId);
    if (!aggregate) continue;

    const activityDate = resolveActivityDate(row);
    if (!activityDate || activityDate < from || activityDate > toEnd) {
      continue;
    }

    const statusBucket = resolveStatusBucket(row.status);
    aggregate.applications += 1;
    aggregate.statuses[statusBucket] += 1;
  }

  const monitorRows = [...aggregates.entries()]
    .map(([categoryId, aggregate]) =>
      buildMonitorRow(
        categoryId,
        aggregate.label,
        aggregate.statuses,
        aggregate.applications
      )
    )
    .sort((a, b) => {
      if (b.applications !== a.applications) {
        return b.applications - a.applications;
      }
      return a.label.localeCompare(b.label);
    });

  return {
    range: {
      preset: "custom",
      from: fromStr,
      to: toStr,
      label: `${formatUtcDateLabel(from)} – ${formatUtcDateLabel(to)}`,
    },
    rows: monitorRows,
  };
}

function buildCategoryMonitorPayload(
  categories: CategoryRow[],
  metricsByCategoryId: Record<string, CategoryMetricBundle>,
  rows: RequestRow[],
  serviceCategoryById: Map<string, string>,
  customMonitorRange: CustomMonitorRequest | null
) {
  const presets = {
    day: buildMonitorSnapshot(categories, metricsByCategoryId, "day"),
    week: buildMonitorSnapshot(categories, metricsByCategoryId, "week"),
    month: buildMonitorSnapshot(categories, metricsByCategoryId, "month"),
    all_time: buildMonitorSnapshot(categories, metricsByCategoryId, "all_time"),
  };

  const custom =
    customMonitorRange?.from && customMonitorRange?.to
      ? buildMonitorCustomRange(
          categories,
          rows,
          serviceCategoryById,
          metricsByCategoryId,
          customMonitorRange.from,
          customMonitorRange.to
        )
      : null;

  return { presets, custom };
}

function buildDistribution(
  categories: CategoryRow[],
  metricsByCategoryId: Record<string, CategoryMetricBundle>,
  categoryColors: Map<string, string>
) {
  const byPeriod: Record<
    PeriodKey,
    Array<{ category_id: string; label: string; value: number; color: string }>
  > = {
    day: [],
    week: [],
    month: [],
    all_time: [],
  };

  for (const periodKey of PERIOD_KEYS) {
    byPeriod[periodKey] = categories
      .map((category) => {
        const info = metricsByCategoryId[category.id];
        return {
          category_id: category.id,
          label: info?.label || mapCategoryLabel(category.assistance_name, category.id),
          value: info?.totals?.[periodKey] ?? 0,
          color: categoryColors.get(category.id) || defaultAccentHexForSlug(category.slug),
        };
      })
      .filter((entry) => entry.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.label.localeCompare(b.label);
      });
  }

  return byPeriod;
}

async function ensureSuperAdminCaller(
  supabase: ServiceClient,
  callerUserId: string
) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: callerUserId });
  if (error) throw error;
  if (data !== true) {
    throw new Error("Forbidden");
  }
}

async function fetchCategories(supabase: ServiceClient): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("assistance_categories")
    .select("id, slug, assistance_name, sort_order, theme_json")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data || []) as CategoryRow[];
}

async function fetchServices(supabase: ServiceClient): Promise<ServiceRow[]> {
  const { data, error } = await supabase
    .from("assistance_services")
    .select("id, category_id, display_name, sort_order")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;
  return (data || []) as ServiceRow[];
}

async function fetchAssistanceRequests(
  supabase: ServiceClient,
  serviceIds: string[]
): Promise<RequestRow[]> {
  if (!serviceIds.length) return [];

  const pageSize = 1000;
  const rows: RequestRow[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("assistance_requests")
      .select("id, request_code, service_id, status, submitted_at, created_at, updated_at")
      .in("service_id", serviceIds)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const batch = (data || []) as RequestRow[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchPlatformCounts(supabase: ServiceClient) {
  const [
    { count: applicantCount, error: applicantError },
    { count: lineAdminCount, error: lineAdminError },
    { count: categoryCount, error: categoryError },
    { count: serviceCount, error: serviceError },
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase
      .from("admins")
      .select("user_id", { count: "exact", head: true })
      .eq("is_super_admin", false),
    supabase
      .from("assistance_categories")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("assistance_services")
      .select("id", { count: "exact", head: true })
      .eq("active", true),
  ]);

  if (applicantError) throw applicantError;
  if (lineAdminError) throw lineAdminError;
  if (categoryError) throw categoryError;
  if (serviceError) throw serviceError;

  return {
    registered_applicants: Number(applicantCount ?? 0),
    line_admins: Number(lineAdminCount ?? 0),
    active_assistance_lines: Number(categoryCount ?? 0),
    active_services: Number(serviceCount ?? 0),
  };
}

function buildPayload(
  categories: CategoryRow[],
  services: ServiceRow[],
  rows: RequestRow[],
  platform: Awaited<ReturnType<typeof fetchPlatformCounts>>,
  customMonitorRange: CustomMonitorRequest | null
) {
  const now = new Date();
  const periodStarts: Record<Exclude<PeriodKey, "all_time">, Date> = {
    day: startOfUtcDay(now),
    week: startOfUtcWeek(now),
    month: startOfUtcMonth(now),
  };

  const serviceCategoryById = new Map<string, string>();
  for (const service of services) {
    serviceCategoryById.set(String(service.id), String(service.category_id));
  }

  const sortedCategories = [...categories].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const metricsByCategoryId: Record<string, CategoryMetricBundle> = {};
  for (const category of sortedCategories) {
    metricsByCategoryId[category.id] = {
      label: mapCategoryLabel(category.assistance_name, category.id),
      totals: emptyPeriodTotals(),
      statuses: emptyPeriodStatuses(),
    };
  }

  const pipeline = emptyStatuses();

  for (const row of rows) {
    const serviceId = String(row.service_id || "").trim();
    const categoryId = serviceCategoryById.get(serviceId);
    if (!categoryId || !metricsByCategoryId[categoryId]) continue;

    const statusBucket = resolveStatusBucket(row.status);
    const metric = metricsByCategoryId[categoryId];
    pipeline[statusBucket] += 1;

    metric.totals.all_time += 1;
    metric.statuses.all_time[statusBucket] += 1;

    const activityDate = resolveActivityDate(row);
    if (activityDate) {
      for (const period of ["day", "week", "month"] as const) {
        if (activityDate >= periodStarts[period]) {
          metric.totals[period] += 1;
          metric.statuses[period][statusBucket] += 1;
        }
      }
    }
  }

  const periods: Record<
    PeriodKey,
    {
      applications: number;
      categories_with_activity: number;
      approved: number;
      approval_rate_pct: number;
      statuses: StatusCountMap;
      distribution: Array<{ category_id: string; label: string; value: number }>;
    }
  > = {
    day: {
      applications: 0,
      categories_with_activity: 0,
      approved: 0,
      approval_rate_pct: 0,
      statuses: emptyStatuses(),
      distribution: [],
    },
    week: {
      applications: 0,
      categories_with_activity: 0,
      approved: 0,
      approval_rate_pct: 0,
      statuses: emptyStatuses(),
      distribution: [],
    },
    month: {
      applications: 0,
      categories_with_activity: 0,
      approved: 0,
      approval_rate_pct: 0,
      statuses: emptyStatuses(),
      distribution: [],
    },
    all_time: {
      applications: 0,
      categories_with_activity: 0,
      approved: 0,
      approval_rate_pct: 0,
      statuses: emptyStatuses(),
      distribution: [],
    },
  };

  for (const metric of Object.values(metricsByCategoryId)) {
    for (const period of PERIOD_KEYS) {
      periods[period].applications += metric.totals[period];
      if (metric.totals[period] > 0) {
        periods[period].categories_with_activity += 1;
      }
      for (const status of STATUS_BUCKETS) {
        periods[period].statuses[status] += metric.statuses[period][status] || 0;
      }
    }
  }

  for (const period of PERIOD_KEYS) {
    const approved = periods[period].statuses.Approved ?? 0;
    const total = periods[period].applications;
    periods[period].approved = approved;
    periods[period].approval_rate_pct =
      total > 0 ? Math.round((approved / total) * 1000) / 10 : 0;
  }

  const categoryColors = buildCategoryColorMap(sortedCategories);

  const distributionByPeriod = buildDistribution(
    sortedCategories,
    metricsByCategoryId,
    categoryColors
  );
  for (const period of PERIOD_KEYS) {
    periods[period].distribution = distributionByPeriod[period];
  }

  const backlogCategories = sortedCategories
    .map((category) => {
      const metric = metricsByCategoryId[category.id];
      if (!metric) return null;

      const backlog =
        metric.statuses.all_time.Pending +
        metric.statuses.all_time["Action Required"] +
        metric.statuses.all_time.Resubmitted +
        metric.statuses.all_time["For Approval"];

      return {
        category_id: category.id,
        label: metric.label,
        backlog_count: backlog,
        pending: metric.statuses.all_time.Pending,
        action_required: metric.statuses.all_time["Action Required"],
        resubmitted: metric.statuses.all_time.Resubmitted,
        for_approval: metric.statuses.all_time["For Approval"],
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null && row.backlog_count > 0)
    .sort((a, b) => {
      if (b.backlog_count !== a.backlog_count) {
        return b.backlog_count - a.backlog_count;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, 8);

  const category_monitor = buildCategoryMonitorPayload(
    sortedCategories,
    metricsByCategoryId,
    rows,
    serviceCategoryById,
    customMonitorRange
  );

  return {
    platform,
    periods,
    pipeline,
    backlog_categories: backlogCategories,
    category_monitor,
    categories: sortedCategories.map((category) => ({
      category_id: category.id,
      slug: category.slug,
      label: mapCategoryLabel(category.assistance_name, category.id),
      color: categoryColors.get(category.id) || defaultAccentHexForSlug(category.slug),
    })),
  };
}

async function parseCustomMonitorRequest(
  req: Request
): Promise<CustomMonitorRequest | null> {
  if (req.method !== "POST") return null;

  try {
    const body = await req.json();
    const monitor = body?.category_monitor ?? body?.service_monitor;
    const from = String(monitor?.from ?? "").trim();
    const to = String(monitor?.to ?? "").trim();
    if (!from || !to) return null;
    return { from, to };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();

    const auth = await authorizeRequest(
      req,
      supabase,
      "SUPER_ADMIN_DASHBOARD_ANALYTICS_SECRET"
    );

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    if (auth.viaSecret || !auth.userId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    await ensureSuperAdminCaller(supabase, auth.userId);

    const [categories, services, platform] = await Promise.all([
      fetchCategories(supabase),
      fetchServices(supabase),
      fetchPlatformCounts(supabase),
    ]);

    const serviceIds = [
      ...new Set(services.map((service) => String(service.id || "").trim()).filter(Boolean)),
    ];

    const rows = await fetchAssistanceRequests(supabase, serviceIds);
    const customMonitorRange = await parseCustomMonitorRequest(req);
    const payload = buildPayload(
      categories,
      services,
      rows,
      platform,
      customMonitorRange
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
