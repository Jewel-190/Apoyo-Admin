import { authorizeRequest, getServiceClient, ServiceClient } from "../_shared/client.ts";
import { corsHeaders, jsonResponse, preflight } from "../_shared/cors.ts";

// Tables grouped by admin role — must match `src/config/roleConfig.js` REQUEST_SOURCES.
const TABLES_BY_ROLE: Record<string, string[]> = {
  medical_admin: [
    "hospitalization_requests",
    "treatment_requests",
    "medical_requests",
  ],
  financial_admin: ["financial_requests", "monetary_requests"],
  burial_admin: ["burial_requests", "cremation_requests", "columbarium_requests"],
};

const ALL_TABLES = Array.from(new Set(Object.values(TABLES_BY_ROLE).flat()));

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
}

function isoStartOfToday(): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

async function safeCount(
  supabase: ServiceClient,
  table: string,
  builderFn?: (q: ReturnType<ServiceClient["from"]>) => unknown
): Promise<number> {
  try {
    let q = supabase.from(table).select("id", { head: true, count: "exact" });
    if (builderFn) q = builderFn(q) as typeof q;
    const { count, error } = await q;
    if (error) {
      // Table might not exist or query failed — surface 0 so the dashboard
      // still renders rather than failing wholesale.
      return 0;
    }
    return Number(count || 0);
  } catch {
    return 0;
  }
}

async function countsForTable(
  supabase: ServiceClient,
  table: string,
  startIso: string
): Promise<TableCounts> {
  // Run counts in parallel rather than sequentially.
  const [total, today, approved, scheduled, forApproval, inProgress, resubmitted, actionReq] =
    await Promise.all([
      safeCount(supabase, table, (q) => q.not("status", "eq", "draft")),
      safeCount(supabase, table, (q) =>
        q
          .not("status", "eq", "draft")
          .or(`submitted_at.gte.${startIso},created_at.gte.${startIso}`)
      ),
      safeCount(supabase, table, (q) =>
        q.not("status", "eq", "draft").eq("status", "approved")
      ),
      safeCount(supabase, table, (q) =>
        q.not("status", "eq", "draft").eq("status", "scheduled")
      ),
      safeCount(supabase, table, (q) =>
        q.not("status", "eq", "draft").eq("status", "for approval")
      ),
      safeCount(supabase, table, (q) =>
        q
          .not("status", "eq", "draft")
          .or(
            "status.ilike.%in progress%,status.ilike.%in_progress%,status.ilike.%inprogress%"
          )
      ),
      safeCount(supabase, table, (q) =>
        q.not("status", "eq", "draft").or("status.ilike.%resubmi%")
      ),
      safeCount(supabase, table, (q) =>
        q
          .not("status", "eq", "draft")
          .or(
            "status.ilike.%action required%,status.ilike.%action_required%,status.ilike.%requires_action%,status.ilike.%for_revision%,status.ilike.%resubmission_required%"
          )
      ),
    ]);

  const pending = Math.max(
    0,
    total - approved - scheduled - forApproval - inProgress - resubmitted - actionReq
  );

  return {
    total,
    today,
    statuses: {
      Pending: pending,
      "In Progress": inProgress,
      "Action Required": actionReq,
      Resubmitted: resubmitted,
      "For Approval": forApproval,
      Scheduled: scheduled,
      Approved: approved,
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

    // Authenticated admin path: confirm role exists in admins table.
    if (!auth.viaSecret) {
      const { data: adminRow, error: adminError } = await supabase
        .from("admins")
        .select("role")
        .eq("user_id", auth.userId)
        .maybeSingle();

      if (adminError || !adminRow || !TABLES_BY_ROLE[adminRow.role]) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    const startIso = isoStartOfToday();

    // Run per-table aggregations in parallel.
    const tableEntries = await Promise.all(
      ALL_TABLES.map(async (table) => [
        table,
        await countsForTable(supabase, table, startIso),
      ] as const)
    );
    const counts_by_table: Record<string, TableCounts> = Object.fromEntries(tableEntries);

    // Aggregate per-role.
    const roles: Record<string, {
      tables: Record<string, TableCounts>;
      totals: { total: number; today: number };
      statuses: Record<StatusBucket, number>;
    }> = {};

    for (const role of Object.keys(TABLES_BY_ROLE)) {
      const tables = TABLES_BY_ROLE[role] || [];
      const totals = { total: 0, today: 0 };
      const statuses: Record<StatusBucket, number> = {
        Pending: 0,
        "In Progress": 0,
        "Action Required": 0,
        Resubmitted: 0,
        "For Approval": 0,
        Scheduled: 0,
        Approved: 0,
      };

      for (const t of tables) {
        const info = counts_by_table[t];
        if (!info) continue;
        totals.total += info.total;
        totals.today += info.today;
        for (const k of STATUS_BUCKETS) {
          statuses[k] += info.statuses[k] || 0;
        }
      }

      roles[role] = {
        tables: Object.fromEntries(tables.map((t) => [t, counts_by_table[t]])),
        totals,
        statuses,
      };
    }

    // Overall totals (sum of all tables).
    const overallTotals = { total: 0, today: 0 };
    const overallStatuses: Record<StatusBucket, number> = {
      Pending: 0,
      "In Progress": 0,
      "Action Required": 0,
      Resubmitted: 0,
      "For Approval": 0,
      Scheduled: 0,
      Approved: 0,
    };

    for (const t of ALL_TABLES) {
      const info = counts_by_table[t];
      if (!info) continue;
      overallTotals.total += info.total;
      overallTotals.today += info.today;
      for (const k of STATUS_BUCKETS) {
        overallStatuses[k] += info.statuses[k] || 0;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        counts_by_table,
        roles,
        overall: { totals: overallTotals, statuses: overallStatuses },
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
