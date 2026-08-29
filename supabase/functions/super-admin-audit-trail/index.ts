import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { writeAuditEvent } from "../_shared/auditTrail.ts";

/**
 * POST /functions/v1/super-admin-audit-trail
 *
 * Superadmin CMS audit log. Reads are paged and filtered here so the browser
 * never scans public.audit_trail. Writes from this function are limited to
 * login/logout; CMS mutations are recorded by the functions that perform them.
 *
 * Actions:
 *  - listAuditTrail
 *  - recordSession   (login | logout only)
 */

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;
const MAX_SEARCH_CHARS = 120;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 90;
const SESSION_RATE_MAX = 12;

const PRESET_LABELS: Record<string, string> = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  all_time: "All Time",
};

type Payload = {
  action?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  module?: string;
  auditAction?: string;
  preset?: string;
  from?: string;
  to?: string;
  includeFacets?: boolean;
  event?: string;
};

type DateRange = {
  preset: string;
  from: string | null;
  to: string | null;
  label: string;
};

const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string, max = RATE_MAX_CALLS) {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  for (const [id, hits] of rateBuckets) {
    const fresh = hits.filter((hit) => hit > cutoff);
    if (fresh.length === 0) rateBuckets.delete(id);
    else rateBuckets.set(id, fresh);
  }
  const current = rateBuckets.get(key) || [];
  if (current.length >= max) return true;
  current.push(now);
  rateBuckets.set(key, current);
  return false;
}

async function ensureSuperAdmin(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: userId });
  if (error) throw error;
  return data === true;
}

function clipInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clipText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
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
  const fromMonday = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - fromMonday);
  return day;
}

function parseUtcDateOnly(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
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

function formatUtcDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolveRange(presetInput: unknown, fromInput?: unknown, toInput?: unknown): DateRange {
  const preset = String(presetInput ?? "all_time").trim().toLowerCase();
  const now = new Date();
  const todayEnd = endOfUtcDay(now);

  if (preset === "custom") {
    const from = parseUtcDateOnly(fromInput);
    const to = parseUtcDateOnly(toInput);
    if (!from || !to) throw new Error("Select both a start and end date.");
    const toEnd = endOfUtcDay(to);
    if (from.getTime() > toEnd.getTime()) {
      throw new Error("Start date must be on or before end date.");
    }
    return {
      preset: "custom",
      from: from.toISOString(),
      to: toEnd.toISOString(),
      label: `${formatUtcDateLabel(from)} – ${formatUtcDateLabel(to)}`,
    };
  }

  if (preset === "day") {
    const from = startOfUtcDay(now);
    return {
      preset,
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_LABELS.day} · ${formatUtcDateLabel(from)}`,
    };
  }

  if (preset === "week") {
    const from = startOfUtcWeek(now);
    return {
      preset,
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_LABELS.week} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (preset === "month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return {
      preset,
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_LABELS.month} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  return { preset: "all_time", from: null, to: null, label: PRESET_LABELS.all_time };
}

function applyRange(
  // deno-lint-ignore no-explicit-any
  query: any,
  range: DateRange
) {
  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lte("created_at", range.to);
  return query;
}

function applySearch(
  // deno-lint-ignore no-explicit-any
  query: any,
  search: string
) {
  if (!search) return query;
  const term = search.replace(/[%_,()]/g, " ").trim();
  if (!term) return query;
  const like = `%${term}%`;
  return query.or(
    `summary.ilike.${like},actor_email.ilike.${like},ip_address.ilike.${like},resource_id.ilike.${like},module.ilike.${like}`
  );
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    createdAt: row.created_at ? String(row.created_at) : null,
    actorId: row.actor_id ? String(row.actor_id) : null,
    actorEmail: row.actor_email ? String(row.actor_email) : null,
    action: String(row.action ?? ""),
    module: String(row.module ?? ""),
    resourceType: row.resource_type ? String(row.resource_type) : null,
    resourceId: row.resource_id ? String(row.resource_id) : null,
    summary: String(row.summary ?? ""),
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    countryCode: row.country_code ? String(row.country_code) : null,
  };
}

function countMap(rows: Array<{ key: string; count: number }> | null | undefined) {
  const map: Record<string, number> = {};
  for (const row of rows || []) {
    const key = String(row.key || "").trim();
    if (!key) continue;
    map[key] = Number(row.count || 0);
  }
  return map;
}

async function listAuditTrail(
  supabase: ReturnType<typeof getServiceClient>,
  body: Payload
) {
  const page = clipInt(body.page, 1, 1, 10000);
  const pageSize = clipInt(body.pageSize, PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX);
  const search = clipText(body.search, MAX_SEARCH_CHARS);
  const moduleFilter = clipText(body.module, 64);
  const actionFilter = clipText(body.auditAction, 64);
  const range = resolveRange(body.preset, body.from, body.to);
  const includeFacets = body.includeFacets !== false;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let countQuery = supabase.from("audit_trail").select("id", { count: "exact", head: true });
  countQuery = applyRange(countQuery, range);
  countQuery = applySearch(countQuery, search);
  if (moduleFilter) countQuery = countQuery.eq("module", moduleFilter);
  if (actionFilter) countQuery = countQuery.eq("action", actionFilter);

  let dataQuery = supabase
    .from("audit_trail")
    .select(
      "id, created_at, actor_id, actor_email, action, module, resource_type, resource_id, summary, ip_address, country_code"
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  dataQuery = applyRange(dataQuery, range);
  dataQuery = applySearch(dataQuery, search);
  if (moduleFilter) dataQuery = dataQuery.eq("module", moduleFilter);
  if (actionFilter) dataQuery = dataQuery.eq("action", actionFilter);

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);
  if (countError) throw countError;
  if (dataError) throw dataError;

  let facets: { modules: Record<string, number>; actions: Record<string, number> } | null = null;
  if (includeFacets) {
    let moduleQuery = supabase.from("audit_trail").select("module").limit(8000);
    let actionQuery = supabase.from("audit_trail").select("action").limit(8000);
    moduleQuery = applyRange(moduleQuery, range);
    actionQuery = applyRange(actionQuery, range);
    moduleQuery = applySearch(moduleQuery, search);
    actionQuery = applySearch(actionQuery, search);
    if (actionFilter) moduleQuery = moduleQuery.eq("action", actionFilter);
    if (moduleFilter) actionQuery = actionQuery.eq("module", moduleFilter);

    const [moduleRes, actionRes] = await Promise.all([moduleQuery, actionQuery]);
    if (moduleRes.error) throw moduleRes.error;
    if (actionRes.error) throw actionRes.error;

    const modules: Record<string, number> = {};
    for (const row of moduleRes.data || []) {
      const key = String((row as { module?: string }).module || "").trim();
      if (!key) continue;
      modules[key] = (modules[key] || 0) + 1;
    }
    const actions: Record<string, number> = {};
    for (const row of actionRes.data || []) {
      const key = String((row as { action?: string }).action || "").trim();
      if (!key) continue;
      actions[key] = (actions[key] || 0) + 1;
    }
    facets = { modules, actions };
  }

  const total = Number(count ?? 0);
  return {
    range,
    rows: (data || []).map((row) => mapRow(row as Record<string, unknown>)),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    facets,
  };
}

void countMap;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();
    const auth = await authorizeRequest(req, supabase);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    if (auth.viaSecret || !auth.userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    if (!(await ensureSuperAdmin(supabase, auth.userId))) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    let body: Payload = {};
    try {
      body = (await req.json()) as Payload;
    } catch {
      body = {};
    }

    const action = String(body.action ?? "").trim();

    if (action === "recordSession") {
      if (isRateLimited(`session:${auth.userId}`, SESSION_RATE_MAX)) {
        return jsonResponse({ error: "Too many requests. Try again shortly." }, 429);
      }
      const event = String(body.event ?? "").trim().toLowerCase();
      if (event !== "login" && event !== "logout") {
        return jsonResponse({ error: "event must be login or logout." }, 400);
      }
      await writeAuditEvent(supabase, req, {
        actorId: auth.userId,
        action: event,
        module: "session",
        resourceType: "session",
        summary: event === "login" ? "Signed in to the superadmin CMS" : "Signed out of the superadmin CMS",
      });
      return jsonResponse({ success: true, action, event });
    }

    if (isRateLimited(auth.userId)) {
      return jsonResponse({ error: "Too many requests. Try again shortly." }, 429);
    }

    if (action === "listAuditTrail") {
      const result = await listAuditTrail(supabase, body);
      return jsonResponse({ success: true, action, ...result });
    }

    return jsonResponse(
      { success: false, error: "Invalid action. Use listAuditTrail or recordSession." },
      400
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /select both|on or before/i.test(message) ? 400 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
