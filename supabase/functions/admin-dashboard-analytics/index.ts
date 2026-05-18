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

interface TableCounts {
  total: number;
  today: number;
  statuses: Record<StatusBucket, number>;
  statuses_today: Record<StatusBucket, number>;
}

interface CatalogRow {
  categories: Array<{
    id: string;
    slug: string | null;
    admin_role_key: string | null;
    sort_order?: number | null;
  }>;
  services: Array<{
    id: string;
    category_id: string;
    display_name?: string | null;
    active?: boolean | null;
    sort_order?: number | null;
  }>;
}

function normKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function lineRoleMatchesCatalogAdminKey(lineRaw: unknown, categoryAdminRoleKey: unknown): boolean {
  const line = normKey(lineRaw);
  const cat = normKey(categoryAdminRoleKey);
  if (!line || !cat) return false;
  if (line === cat) return true;
  if (cat === `${line}_admin` || line === `${cat}_admin`) return true;
  const strip = (k: string) => k.replace(/_admin$/, "");
  return strip(line) === strip(cat) && strip(line).length > 0;
}

function resolveLineRole(
  adminRow: { role?: string | null; category_id?: string | null; service_type?: string | null },
  categories: CatalogRow["categories"]
): string | null {
  const explicit = normKey(adminRow?.role);
  if (explicit === "super_admin") {
    return "super_admin";
  }

  let raw: string | null = explicit || null;

  if (!raw && categories?.length && adminRow?.category_id) {
    const c = categories.find((x) => x.id === adminRow.category_id);
    raw = c?.admin_role_key ? normKey(c.admin_role_key) : null;
  }

  if (!raw && categories?.length) {
    const st = normKey(adminRow?.service_type);
    if (st) {
      const bySlug = categories.find((x) => normKey(x.slug) === st);
      const byRole = categories.find(
        (x) =>
          x.admin_role_key &&
          lineRoleMatchesCatalogAdminKey(adminRow?.service_type, x.admin_role_key)
      );
      const c = bySlug || byRole;
      raw = c?.admin_role_key ? normKey(c.admin_role_key) : null;
    }
  }

  if (!raw) {
    return null;
  }

  if (raw !== "super_admin" && categories?.length) {
    const cat = categories.find(
      (x) =>
        x.admin_role_key &&
        lineRoleMatchesCatalogAdminKey(raw, x.admin_role_key)
    );
    if (cat?.admin_role_key) {
      return normKey(cat.admin_role_key);
    }
  }

  return raw;
}

function isoStartOfToday(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

async function fetchCatalog(supabase: ServiceClient): Promise<CatalogRow> {
  const [{ data: categories, error: e1 }, { data: services, error: e2 }] = await Promise.all([
    supabase
      .from("assistance_categories")
      .select("id, slug, admin_role_key, sort_order")
      .order("sort_order"),
    supabase
      .from("assistance_services")
      .select("id, category_id, display_name, active, sort_order")
      .eq("active", true)
      .order("sort_order"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return {
    categories: categories || [],
    services: services || [],
  };
}

function collectActiveServiceIds(services: CatalogRow["services"]): string[] {
  const ids: string[] = [];
  for (const s of services) {
    const id = String(s.id || "").trim();
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function buildServiceIdsByRole(catalog: CatalogRow): Record<string, string[]> {
  const { categories, services } = catalog;
  const byRole: Record<string, string[]> = {};
  for (const c of categories) {
    const rk = normKey(c.admin_role_key);
    if (!rk) {
      continue;
    }
    const serviceIds = services
      .filter((s) => s.category_id === c.id)
      .map((s) => String(s.id || "").trim())
      .filter(Boolean);
    if (!byRole[rk]) {
      byRole[rk] = [];
    }
    for (const id of serviceIds) {
      if (!byRole[rk].includes(id)) {
        byRole[rk].push(id);
      }
    }
  }
  return byRole;
}

async function safeAssistanceCount(
  supabase: ServiceClient,
  serviceId: string,
  builderFn?: (q: ReturnType<ServiceClient["from"]>) => unknown
): Promise<number> {
  try {
    let q = supabase
      .from("assistance_requests")
      .select("id", { head: true, count: "exact" })
      .eq("service_id", serviceId);
    if (builderFn) q = builderFn(q) as typeof q;
    const { count, error } = await q;
    if (error) {
      return 0;
    }
    return Number(count || 0);
  } catch {
    return 0;
  }
}

function withSubmittedTodayFilter<T extends { or: (filter: string) => T }>(
  q: T,
  startIso: string | null
): T {
  if (!startIso) {
    return q;
  }
  return q.or(`submitted_at.gte.${startIso},created_at.gte.${startIso}`);
}

async function statusCountsForServiceId(
  supabase: ServiceClient,
  serviceId: string,
  startIso: string | null
): Promise<Record<StatusBucket, number>> {
  const base = <T extends { not: (col: string, op: string, val: string) => T }>(q: T) =>
    withSubmittedTodayFilter(q.not("status", "eq", "draft"), startIso);

  const [total, approved, scheduled, forApproval, inProgress, resubmitted, actionReq] =
    await Promise.all([
      safeAssistanceCount(supabase, serviceId, (q) => base(q)),
      safeAssistanceCount(supabase, serviceId, (q) =>
        base(q).eq("status", "approved")
      ),
      safeAssistanceCount(supabase, serviceId, (q) =>
        base(q).eq("status", "scheduled")
      ),
      safeAssistanceCount(supabase, serviceId, (q) =>
        base(q).eq("status", "for approval")
      ),
      safeAssistanceCount(supabase, serviceId, (q) =>
        base(q).or(
          "status.ilike.%in progress%,status.ilike.%in_progress%,status.ilike.%inprogress%"
        )
      ),
      safeAssistanceCount(supabase, serviceId, (q) =>
        base(q).or("status.ilike.%resubmi%")
      ),
      safeAssistanceCount(supabase, serviceId, (q) =>
        base(q).or(
          "status.ilike.%action required%,status.ilike.%action_required%,status.ilike.%requires_action%,status.ilike.%for_revision%,status.ilike.%resubmission_required%"
        )
      ),
    ]);

  const pending = Math.max(
    0,
    total - approved - scheduled - forApproval - inProgress - resubmitted - actionReq
  );

  return {
    Pending: pending,
    "In Progress": inProgress,
    "Action Required": actionReq,
    Resubmitted: resubmitted,
    "For Approval": forApproval,
    Scheduled: scheduled,
    Approved: approved,
  };
}

async function countsForServiceId(
  supabase: ServiceClient,
  serviceId: string,
  startIso: string
): Promise<TableCounts> {
  const [total, today, statuses, statuses_today] = await Promise.all([
    safeAssistanceCount(supabase, serviceId, (q) => q.not("status", "eq", "draft")),
    safeAssistanceCount(supabase, serviceId, (q) =>
      q
        .not("status", "eq", "draft")
        .or(`submitted_at.gte.${startIso},created_at.gte.${startIso}`)
    ),
    statusCountsForServiceId(supabase, serviceId, null),
    statusCountsForServiceId(supabase, serviceId, startIso),
  ]);

  return {
    total,
    today,
    statuses,
    statuses_today,
  };
}

async function buildPayload(supabase: ServiceClient) {
  const catalog = await fetchCatalog(supabase);
  const SERVICE_IDS_BY_ROLE = buildServiceIdsByRole(catalog);
  const ALL_SERVICE_IDS = collectActiveServiceIds(catalog.services);

  const startIso = isoStartOfToday();

  const tableEntries = await Promise.all(
    ALL_SERVICE_IDS.map(async (serviceId) => [
      serviceId,
      await countsForServiceId(supabase, serviceId, startIso),
    ] as const)
  );
  const counts_by_table: Record<string, TableCounts> = Object.fromEntries(tableEntries);

  const emptyStatuses = (): Record<StatusBucket, number> => ({
    Pending: 0,
    "In Progress": 0,
    "Action Required": 0,
    Resubmitted: 0,
    "For Approval": 0,
    Scheduled: 0,
    Approved: 0,
  });

  const roles: Record<
    string,
    {
      tables: Record<string, TableCounts>;
      totals: { total: number; today: number };
      statuses: Record<StatusBucket, number>;
      statuses_today: Record<StatusBucket, number>;
    }
  > = {};

  for (const role of Object.keys(SERVICE_IDS_BY_ROLE)) {
    const serviceIds = SERVICE_IDS_BY_ROLE[role] || [];
    const totals = { total: 0, today: 0 };
    const statuses = emptyStatuses();
    const statuses_today = emptyStatuses();

    for (const serviceId of serviceIds) {
      const info = counts_by_table[serviceId];
      if (!info) continue;
      totals.total += info.total;
      totals.today += info.today;
      for (const k of STATUS_BUCKETS) {
        statuses[k] += info.statuses[k] || 0;
        statuses_today[k] += info.statuses_today[k] || 0;
      }
    }

    roles[role] = {
      tables: Object.fromEntries(serviceIds.map((k) => [k, counts_by_table[k]])),
      totals,
      statuses,
      statuses_today,
    };
  }

  const overallTotals = { total: 0, today: 0 };
  const overallStatuses = emptyStatuses();
  const overallStatusesToday = emptyStatuses();

  for (const serviceId of ALL_SERVICE_IDS) {
    const info = counts_by_table[serviceId];
    if (!info) continue;
    overallTotals.total += info.total;
    overallTotals.today += info.today;
    for (const k of STATUS_BUCKETS) {
      overallStatuses[k] += info.statuses[k] || 0;
      overallStatusesToday[k] += info.statuses_today[k] || 0;
    }
  }

  return {
    counts_by_table,
    roles,
    overall: {
      totals: overallTotals,
      statuses: overallStatuses,
      statuses_today: overallStatusesToday,
    },
  };
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

    if (!auth.viaSecret) {
      const { data: adminRow, error: adminError } = await supabase
        .from("admins")
        .select("role, category_id, service_type")
        .eq("user_id", auth.userId)
        .maybeSingle();

      if (adminError || !adminRow) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const catalog = await fetchCatalog(supabase);
      const line = resolveLineRole(adminRow, catalog.categories);
      if (!line) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    const payload = await buildPayload(supabase);

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
