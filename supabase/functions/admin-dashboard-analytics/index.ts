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

interface ScopedServiceRow {
  id: string;
  category_id: string;
  display_name: string | null;
  sort_order: number | null;
}

interface CatalogRow {
  services: ScopedServiceRow[];
}

interface DashboardScope {
  isSuperAdmin: boolean;
  categoryId: string | null;
  serviceIds: string[];
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

interface ServiceMetricBundle {
  label: string;
  category_id: string;
  totals: PeriodTotals;
  statuses: PeriodStatuses;
}

interface MonitorRow {
  service_id: string;
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

function normalizeKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
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

function isFollowUpStatus(status: StatusBucket): boolean {
  return (
    status === "Pending" ||
    status === "Resubmitted" ||
    status === "Action Required"
  );
}

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

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay();
  // Monday as week start.
  const diff = day === 0 ? 6 : day - 1;
  dayStart.setUTCDate(dayStart.getUTCDate() - diff);
  return dayStart;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveActivityDate(row: RequestRow): Date | null {
  return (
    parseDate(row.submitted_at) ??
    parseDate(row.created_at) ??
    parseDate(row.updated_at)
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

  const parsed = parseDate(trimmed);
  if (!parsed) {
    return null;
  }

  return startOfUtcDay(parsed);
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

function formatUtcDateLabel(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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
  serviceId: string,
  label: string,
  statuses: StatusCountMap,
  applications: number
): MonitorRow {
  return {
    service_id: serviceId,
    label,
    applications,
    statuses,
  };
}

function buildMonitorSnapshot(
  scopedServices: ScopedServiceRow[],
  metricsByServiceId: Record<string, ServiceMetricBundle>,
  periodKey: PeriodKey
): MonitorSnapshot {
  const rows = scopedServices
    .map((service) => {
      const metric = metricsByServiceId[service.id];
      if (!metric) {
        return null;
      }

      return buildMonitorRow(
        service.id,
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
  scopedServices: ScopedServiceRow[],
  rows: RequestRow[],
  metricsByServiceId: Record<string, ServiceMetricBundle>,
  fromStr: string,
  toStr: string
): MonitorSnapshot | null {
  const from = parseUtcDateOnly(fromStr);
  const to = parseUtcDateOnly(toStr);
  if (!from || !to) {
    return null;
  }

  const toEnd = endOfUtcDay(to);
  if (from.getTime() > toEnd.getTime()) {
    return null;
  }

  const aggregates = new Map<
    string,
    { label: string; statuses: StatusCountMap; applications: number }
  >();

  for (const service of scopedServices) {
    const metric = metricsByServiceId[service.id];
    if (!metric) {
      continue;
    }
    aggregates.set(service.id, {
      label: metric.label,
      statuses: emptyStatuses(),
      applications: 0,
    });
  }

  for (const row of rows) {
    const serviceId = String(row.service_id || "").trim();
    const aggregate = aggregates.get(serviceId);
    if (!aggregate) {
      continue;
    }

    const activityDate = resolveActivityDate(row);
    if (!activityDate || activityDate < from || activityDate > toEnd) {
      continue;
    }

    const statusBucket = resolveStatusBucket(row.status);
    aggregate.applications += 1;
    aggregate.statuses[statusBucket] += 1;
  }

  const monitorRows = [...aggregates.entries()]
    .map(([serviceId, aggregate]) =>
      buildMonitorRow(
        serviceId,
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

function buildServiceMonitorPayload(
  scopedServices: ScopedServiceRow[],
  metricsByServiceId: Record<string, ServiceMetricBundle>,
  rows: RequestRow[],
  customMonitorRange: CustomMonitorRequest | null
) {
  const presets = {
    day: buildMonitorSnapshot(scopedServices, metricsByServiceId, "day"),
    week: buildMonitorSnapshot(scopedServices, metricsByServiceId, "week"),
    month: buildMonitorSnapshot(scopedServices, metricsByServiceId, "month"),
    all_time: buildMonitorSnapshot(scopedServices, metricsByServiceId, "all_time"),
  };

  const custom =
    customMonitorRange?.from && customMonitorRange?.to
      ? buildMonitorCustomRange(
          scopedServices,
          rows,
          metricsByServiceId,
          customMonitorRange.from,
          customMonitorRange.to
        )
      : null;

  return { presets, custom };
}

function mapServiceLabel(value: string | null, serviceId: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || serviceId;
}

function buildDistribution(
  services: ScopedServiceRow[],
  metricsByServiceId: Record<string, { totals: PeriodTotals }>
) {
  const byPeriod: Record<
    PeriodKey,
    Array<{ service_id: string; label: string; value: number }>
  > = {
    day: [],
    week: [],
    month: [],
    all_time: [],
  };

  for (const periodKey of PERIOD_KEYS) {
    const entries = services
      .map((service) => {
        const info = metricsByServiceId[service.id];
        return {
          service_id: service.id,
          label: mapServiceLabel(service.display_name, service.id),
          value: info?.totals?.[periodKey] ?? 0,
        };
      })
      .filter((entry) => entry.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.label.localeCompare(b.label);
      });
    byPeriod[periodKey] = entries;
  }

  return byPeriod;
}

async function fetchCatalog(supabase: ServiceClient): Promise<CatalogRow> {
  const { data: services, error } = await supabase
    .from("assistance_services")
    .select("id, category_id, display_name, sort_order")
    .eq("active", true)
    .order("sort_order");

  if (error) throw error;

  return {
    services: (services || []) as ScopedServiceRow[],
  };
}

function collectActiveServiceIds(services: CatalogRow["services"]): string[] {
  return [...new Set(services.map((s) => String(s.id || "").trim()).filter(Boolean))];
}

async function resolveDashboardScope(
  supabase: ServiceClient,
  auth: Awaited<ReturnType<typeof authorizeRequest>>,
  catalog: CatalogRow
): Promise<DashboardScope> {
  const allServiceIds = collectActiveServiceIds(catalog.services);

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

async function fetchAssistanceRequestsForServices(
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

    if (batch.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

function buildPayload(
  catalog: CatalogRow,
  scope: DashboardScope,
  rows: RequestRow[],
  customMonitorRange: CustomMonitorRequest | null = null
) {
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const weekStart = startOfUtcWeek(now);
  const monthStart = startOfUtcMonth(now);
  const periodStarts: Record<Exclude<PeriodKey, "all_time">, Date> = {
    day: dayStart,
    week: weekStart,
    month: monthStart,
  };

  const scopedServices = catalog.services
    .filter((service) => scope.serviceIds.includes(service.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const metricsByServiceId: Record<string, ServiceMetricBundle> = {};

  for (const service of scopedServices) {
    metricsByServiceId[service.id] = {
      label: mapServiceLabel(service.display_name, service.id),
      category_id: service.category_id,
      totals: emptyPeriodTotals(),
      statuses: emptyPeriodStatuses(),
    };
  }

  for (const row of rows) {
    const serviceId = String(row.service_id || "").trim();
    if (!serviceId || !metricsByServiceId[serviceId]) {
      continue;
    }

    const activityDate = resolveActivityDate(row);
    const statusBucket = resolveStatusBucket(row.status);
    const metric = metricsByServiceId[serviceId];

    metric.totals.all_time += 1;
    metric.statuses.all_time[statusBucket] += 1;

    if (activityDate) {
      if (activityDate >= periodStarts.day) {
        metric.totals.day += 1;
        metric.statuses.day[statusBucket] += 1;
      }
      if (activityDate >= periodStarts.week) {
        metric.totals.week += 1;
        metric.statuses.week[statusBucket] += 1;
      }
      if (activityDate >= periodStarts.month) {
        metric.totals.month += 1;
        metric.statuses.month[statusBucket] += 1;
      }
    }
  }

  const periods: Record<
    PeriodKey,
    {
      applications: number;
      services_with_activity: number;
      statuses: StatusCountMap;
      distribution: Array<{ service_id: string; label: string; value: number }>;
    }
  > = {
    day: { applications: 0, services_with_activity: 0, statuses: emptyStatuses(), distribution: [] },
    week: { applications: 0, services_with_activity: 0, statuses: emptyStatuses(), distribution: [] },
    month: { applications: 0, services_with_activity: 0, statuses: emptyStatuses(), distribution: [] },
    all_time: { applications: 0, services_with_activity: 0, statuses: emptyStatuses(), distribution: [] },
  };

  for (const metric of Object.values(metricsByServiceId)) {
    for (const period of PERIOD_KEYS) {
      periods[period].applications += metric.totals[period];
      if (metric.totals[period] > 0) {
        periods[period].services_with_activity += 1;
      }
      for (const status of STATUS_BUCKETS) {
        periods[period].statuses[status] += metric.statuses[period][status] || 0;
      }
    }
  }

  const distributionByPeriod = buildDistribution(scopedServices, metricsByServiceId);
  for (const period of PERIOD_KEYS) {
    periods[period].distribution = distributionByPeriod[period];
  }

  const follow_ups = rows
    .map((row) => {
      const serviceId = String(row.service_id || "").trim();
      const serviceMetric = metricsByServiceId[serviceId];
      if (!serviceMetric) return null;

      const status = resolveStatusBucket(row.status);
      if (!isFollowUpStatus(status)) return null;

      const changeAt = row.updated_at || row.submitted_at || row.created_at || null;

      return {
        key: `${serviceId}-${row.id}`,
        id: row.request_code || row.id,
        requestId: row.id,
        requestCode: row.request_code || row.id,
        serviceId,
        category: serviceMetric.label,
        status,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        changeAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTs = new Date(a!.changeAt || 0).getTime();
      const bTs = new Date(b!.changeAt || 0).getTime();
      return aTs - bTs;
    })
    .slice(0, 8);

  const tables = Object.fromEntries(
    Object.entries(metricsByServiceId).map(([serviceId, metric]) => [
      serviceId,
      {
        service_id: serviceId,
        label: metric.label,
        category_id: metric.category_id,
        periods: metric.totals,
        statuses: metric.statuses,
      },
    ])
  );

  const service_monitor = buildServiceMonitorPayload(
    scopedServices,
    metricsByServiceId,
    rows,
    customMonitorRange
  );

  return {
    scope: {
      is_super_admin: scope.isSuperAdmin,
      category_id: scope.categoryId,
      service_ids: scope.serviceIds,
      service_count: scope.serviceIds.length,
    },
    services: scopedServices.map((service) => ({
      service_id: service.id,
      label: mapServiceLabel(service.display_name, service.id),
      category_id: service.category_id,
    })),
    periods,
    tables,
    service_monitor,
    follow_ups,
  } as const;
}

async function parseCustomMonitorRequest(
  req: Request
): Promise<CustomMonitorRequest | null> {
  if (req.method !== "POST") {
    return null;
  }

  try {
    const body = await req.json();
    const monitor = body?.service_monitor;
    const from = String(monitor?.from ?? "").trim();
    const to = String(monitor?.to ?? "").trim();
    if (!from || !to) {
      return null;
    }
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
      "ADMIN_DASHBOARD_ANALYTICS_SECRET"
    );

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const catalog = await fetchCatalog(supabase);
    const scope = await resolveDashboardScope(supabase, auth, catalog);
    const rows = await fetchAssistanceRequestsForServices(supabase, scope.serviceIds);
    const customMonitorRange = await parseCustomMonitorRequest(req);
    const payload = buildPayload(catalog, scope, rows, customMonitorRange);

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
    return jsonResponse({ success: false, error: message }, 500);
  }
});
