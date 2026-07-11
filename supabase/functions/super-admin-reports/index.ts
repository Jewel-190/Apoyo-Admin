import { authorizeRequest, getServiceClient, ServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

/**
 * POST /functions/v1/super-admin-reports
 *
 * Platform-wide reporting backend for the super admin. All data access,
 * super-admin verification, filtering, aggregation, and file generation happen
 * here (service_role); the frontend only requests and downloads.
 *
 * Modes:
 *  - { mode: "summary", categoryId?, startIso?, endIso? }
 *      → { success, total, rangeLabel, platform, lines: [{id,label}], reports: [{id,count}] }
 *  - { mode: "export", reportId, format, categoryId?, startIso?, endIso? }
 *      → { success, fileName, mimeType, base64, recordCount }
 *
 * Auth: super admin JWT (verified via is_superadmin), or SUPER_ADMIN_REPORTS_SECRET
 * for trusted server-to-server calls.
 */

const REPORT_TZ = "Asia/Manila";
const AUDIT_ROW_CAP = 10000;

const STATUS_ORDER = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  "for approval": "For Approval",
  scheduled: "Scheduled",
  approved: "Approved",
  "case study": "Case Study",
};

interface ReportColumn {
  key: string;
  label: string;
  width: number;
}

interface CategoryRow {
  id: string;
  slug: string | null;
  assistance_name: string | null;
  sort_order: number | null;
}

interface ServiceRow {
  id: string;
  category_id: string;
  display_name: string | null;
}

interface RequestRow {
  id: string;
  request_code: string | null;
  user_id: string | null;
  service_id: string | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  case_study_date: string | null;
}

interface AuditRow {
  id: string;
  request_id: string | null;
  action: string | null;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  changed_at: string | null;
}

interface AdminRow {
  user_id: string;
  is_super_admin: boolean;
  category_id: string | null;
  created_at: string | null;
}

interface AppRecord {
  requestId: string;
  code: string;
  applicant: string;
  categoryId: string;
  line: string;
  service: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  caseStudyDate: string | null;
}

// -- Normalizers -------------------------------------------------------------

function normalizeStatus(status: unknown): string {
  const key = String(status ?? "pending").trim().toLowerCase();
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
  if (["in progress", "in_progress"].includes(key)) return "In Progress";
  if (["case study", "case_study", "casestudy", "for case study"].includes(key)) {
    return "Case Study";
  }
  if (["for approval", "for_approval"].includes(key)) return "For Approval";
  if (key === "scheduled") return "Scheduled";
  if (["approved", "complete", "done"].includes(key)) return "Approved";
  return STATUS_LABELS[key] || "Pending";
}

function buildDisplayName(user: Record<string, unknown> | null | undefined): string {
  if (!user) return "Unknown Applicant";
  const parts = [user.first_name, user.middle_name, user.last_name, user.suffix]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown Applicant";
}

function formatActionLabel(action: unknown, oldStatus: unknown, newStatus: unknown): string {
  const raw = String(action ?? "").trim().toLowerCase();
  const to = newStatus ? normalizeStatus(newStatus) : null;
  if (raw === "insert") return "Submitted";
  if (raw === "delete") return "Deleted";
  if (to) return `Moved to ${to}`;
  if (raw === "update") {
    return oldStatus || newStatus ? "Status updated" : "Updated";
  }
  return raw ? raw.replace(/_/g, " ") : "Updated";
}

function toValidDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateCell(value: unknown): string {
  const date = toValidDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: REPORT_TZ,
  });
}

function formatDateTimeCell(value: unknown): string {
  const date = toValidDate(value);
  if (!date) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: REPORT_TZ,
  });
}

function slugify(value: string): string {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "report"
  );
}

function approvalRatePct(approved: number, total: number): number {
  return total > 0 ? Math.round((approved / total) * 1000) / 10 : 0;
}

// -- Auth --------------------------------------------------------------------

async function ensureSuperAdmin(
  supabase: ServiceClient,
  auth: Awaited<ReturnType<typeof authorizeRequest>>
): Promise<void> {
  if (auth.viaSecret) return;
  if (!auth.userId) throw new Error("Forbidden");
  const { data, error } = await supabase.rpc("is_superadmin", { uid: auth.userId });
  if (error) throw error;
  if (data !== true) throw new Error("Forbidden");
}

// -- Data loading ------------------------------------------------------------

async function fetchCategories(supabase: ServiceClient): Promise<CategoryRow[]> {
  const { data, error } = await supabase
    .from("assistance_categories")
    .select("id, slug, assistance_name, sort_order")
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

async function fetchRequests(
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
      .select(
        "id, request_code, user_id, service_id, status, submitted_at, created_at, updated_at, case_study_date"
      )
      .in("service_id", serviceIds)
      .neq("status", "draft")
      .order("submitted_at", { ascending: false, nullsFirst: false })
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

async function fetchUserNames(
  supabase: ServiceClient,
  userIds: string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const map: Record<string, string> = {};
  const pageSize = 1000;
  for (let i = 0; i < ids.length; i += pageSize) {
    const slice = ids.slice(i, i + pageSize);
    const { data, error } = await supabase
      .from("users")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", slice);
    if (error) throw error;
    for (const user of data || []) {
      map[String(user.id)] = buildDisplayName(user as Record<string, unknown>);
    }
  }
  return map;
}

async function fetchAdmins(supabase: ServiceClient): Promise<AdminRow[]> {
  const { data, error } = await supabase
    .from("admins")
    .select("user_id, is_super_admin, category_id, created_at")
    .not("user_id", "is", null)
    .order("is_super_admin", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as AdminRow[];
}

async function fetchAdminEmails(
  supabase: ServiceClient,
  userIds: string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const map: Record<string, string> = {};
  for (const id of ids) {
    try {
      const { data } = await supabase.auth.admin.getUserById(id);
      if (data?.user?.email) map[id] = data.user.email;
    } catch {
      // ignore unresolved ids
    }
  }
  return map;
}

async function fetchAuditLogs(
  supabase: ServiceClient,
  startIso: string | null,
  endIso: string | null
): Promise<AuditRow[]> {
  const rows: AuditRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (rows.length < AUDIT_ROW_CAP) {
    const to = from + pageSize - 1;
    let query = supabase
      .from("audit_logs")
      .select("id, request_id, action, old_status, new_status, changed_by, changed_at")
      .order("changed_at", { ascending: false })
      .range(from, to);
    if (startIso) query = query.gte("changed_at", startIso);
    if (endIso) query = query.lt("changed_at", endIso);

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data || []) as AuditRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows.slice(0, AUDIT_ROW_CAP);
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

// -- Shaping -----------------------------------------------------------------

function buildAppRecords(
  rows: RequestRow[],
  services: ServiceRow[],
  categories: CategoryRow[],
  namesById: Record<string, string>
): AppRecord[] {
  const serviceById = new Map<string, ServiceRow>();
  for (const service of services) serviceById.set(String(service.id), service);
  const categoryById = new Map<string, CategoryRow>();
  for (const category of categories) categoryById.set(String(category.id), category);

  return rows.map((row) => {
    const serviceId = String(row.service_id ?? "").trim();
    const service = serviceById.get(serviceId);
    const categoryId = service ? String(service.category_id) : "";
    const category = categoryById.get(categoryId);
    return {
      requestId: row.id,
      code: row.request_code || row.id,
      applicant: namesById[String(row.user_id ?? "")] || "Unknown Applicant",
      categoryId,
      line: category?.assistance_name || "Unassigned assistance",
      service: service?.display_name || "Request",
      status: normalizeStatus(row.status),
      submittedAt: row.submitted_at,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
      caseStudyDate: row.case_study_date,
    };
  });
}

function filterByRange(
  apps: AppRecord[],
  startIso: string | null,
  endIso: string | null
): AppRecord[] {
  const start = startIso ? toValidDate(startIso) : null;
  const end = endIso ? toValidDate(endIso) : null;
  if (!start && !end) return apps;
  return apps.filter((app) => {
    const activity = toValidDate(app.submittedAt || app.createdAt);
    if (!activity) return false;
    if (start && activity < start) return false;
    if (end && activity >= end) return false;
    return true;
  });
}

function formatRangeLabel(startIso: string | null, endIso: string | null): string {
  const start = startIso ? toValidDate(startIso) : null;
  const end = endIso ? toValidDate(endIso) : null;
  if (!start && !end) return "All time";
  const fmt = (date: Date) =>
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: REPORT_TZ,
    });
  const startLabel = start ? fmt(start) : null;
  const inclusiveEnd = end ? new Date(end.getTime() - 1) : null;
  const endLabel = inclusiveEnd ? fmt(inclusiveEnd) : null;
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }
  return "All time";
}

// -- Report catalog ----------------------------------------------------------

interface BuiltReport {
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  recordCount: number;
}

const REPORT_TITLES: Record<string, string> = {
  platform_summary: "Platform Summary",
  line_performance: "Assistance Performance",
  service_utilization: "Service Utilization",
  master: "Applications Master List (All Assistance)",
  approved: "Approved Beneficiaries (All Assistance)",
  admin_directory: "Admin Directory",
  audit_trail: "System Audit Trail",
};

const REPORT_IDS = Object.keys(REPORT_TITLES);

interface ReportContext {
  apps: AppRecord[];
  categories: CategoryRow[];
  services: ServiceRow[];
  platform: Awaited<ReturnType<typeof fetchPlatformCounts>>;
  admins: AdminRow[];
  adminEmails: Record<string, string>;
  categoryLabelById: Map<string, string>;
  audits: AuditRow[];
  requestMetaById: Map<string, { code: string; line: string; service: string }>;
  actorById: Record<string, string>;
}

/** Records the report "selects" — used both for counts and export sizing. */
function reportCount(reportId: string, ctx: ReportContext): number {
  switch (reportId) {
    case "master":
      return ctx.apps.length;
    case "approved":
      return ctx.apps.filter((a) => a.status === "Approved").length;
    case "line_performance":
      return ctx.categories.length;
    case "service_utilization":
      return ctx.services.length;
    case "admin_directory":
      return ctx.admins.length;
    case "audit_trail":
      return ctx.audits.length;
    case "platform_summary":
    default:
      return ctx.apps.length;
  }
}

function buildReport(reportId: string, ctx: ReportContext): BuiltReport {
  if (reportId === "master") {
    const rows = ctx.apps.map((app) => ({
      code: app.code,
      applicant: app.applicant,
      line: app.line,
      service: app.service,
      status: app.status,
      submitted: formatDateTimeCell(app.submittedAt || app.createdAt),
      updated: formatDateTimeCell(app.updatedAt || app.createdAt),
      caseStudy: formatDateCell(app.caseStudyDate),
    }));
    return {
      recordCount: rows.length,
      columns: [
        { key: "code", label: "Application ID", width: 16 },
        { key: "applicant", label: "Applicant Name", width: 26 },
        { key: "line", label: "Assistance", width: 20 },
        { key: "service", label: "Service", width: 22 },
        { key: "status", label: "Status", width: 16 },
        { key: "submitted", label: "Submitted", width: 22 },
        { key: "updated", label: "Last Updated", width: 22 },
        { key: "caseStudy", label: "Case Study Date", width: 18 },
      ],
      rows,
    };
  }

  if (reportId === "approved") {
    const approvedApps = ctx.apps.filter((a) => a.status === "Approved");
    const rows = approvedApps.map((app) => ({
      code: app.code,
      applicant: app.applicant,
      line: app.line,
      service: app.service,
      submitted: formatDateCell(app.submittedAt || app.createdAt),
      approved: formatDateTimeCell(app.updatedAt || app.createdAt),
    }));
    return {
      recordCount: rows.length,
      columns: [
        { key: "code", label: "Application ID", width: 16 },
        { key: "applicant", label: "Beneficiary Name", width: 26 },
        { key: "line", label: "Assistance", width: 20 },
        { key: "service", label: "Service", width: 22 },
        { key: "submitted", label: "Submitted", width: 20 },
        { key: "approved", label: "Approved On", width: 22 },
      ],
      rows,
    };
  }

  if (reportId === "line_performance") {
    const byCategory = new Map<string, AppRecord[]>();
    for (const app of ctx.apps) {
      const list = byCategory.get(app.categoryId) || [];
      list.push(app);
      byCategory.set(app.categoryId, list);
    }

    const statusColumns = STATUS_ORDER.map((status) => ({
      key: status,
      label: status,
      width: 14,
    }));

    const makeRow = (label: string, list: AppRecord[]) => {
      const row: Record<string, string | number> = { line: label };
      let total = 0;
      for (const status of STATUS_ORDER) {
        const count = list.filter((a) => a.status === status).length;
        row[status] = count;
        total += count;
      }
      row.total = total;
      const approved = list.filter((a) => a.status === "Approved").length;
      row.open = total - approved;
      row.approvalRate = `${approvalRatePct(approved, total)}%`;
      return row;
    };

    const rows: Record<string, string | number>[] = ctx.categories.map((category) =>
      makeRow(category.assistance_name || category.id, byCategory.get(category.id) || [])
    );
    if (rows.length > 0) {
      rows.push(makeRow("TOTAL", ctx.apps));
    }

    return {
      recordCount: ctx.categories.length,
      columns: [
        { key: "line", label: "Assistance", width: 24 },
        { key: "total", label: "Total", width: 12 },
        ...statusColumns,
        { key: "open", label: "Open (non-approved)", width: 18 },
        { key: "approvalRate", label: "Approval Rate", width: 14 },
      ],
      rows,
    };
  }

  if (reportId === "service_utilization") {
    const rows = ctx.services
      .map((service) => {
        const list = ctx.apps.filter((a) => a.service === (service.display_name || "Request"));
        const total = list.length;
        const approved = list.filter((a) => a.status === "Approved").length;
        const row: Record<string, string | number> = {
          line: ctx.categoryLabelById.get(String(service.category_id)) || "Unassigned assistance",
          service: service.display_name || "Request",
          total,
        };
        for (const status of STATUS_ORDER) {
          row[status] = list.filter((a) => a.status === status).length;
        }
        row.approvalRate = `${approvalRatePct(approved, total)}%`;
        return row;
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    return {
      recordCount: ctx.services.length,
      columns: [
        { key: "line", label: "Assistance", width: 20 },
        { key: "service", label: "Service", width: 24 },
        { key: "total", label: "Total", width: 12 },
        ...STATUS_ORDER.map((status) => ({ key: status, label: status, width: 14 })),
        { key: "approvalRate", label: "Approval Rate", width: 14 },
      ],
      rows,
    };
  }

  if (reportId === "admin_directory") {
    const rows = ctx.admins.map((admin) => ({
      email: ctx.adminEmails[admin.user_id] || admin.user_id,
      role: admin.is_super_admin ? "Super Admin" : "Assistance Admin",
      line: admin.is_super_admin
        ? "All assistance"
        : ctx.categoryLabelById.get(String(admin.category_id ?? "")) || "Unassigned",
      created: formatDateCell(admin.created_at),
    }));
    return {
      recordCount: rows.length,
      columns: [
        { key: "email", label: "Admin Email", width: 30 },
        { key: "role", label: "Role", width: 18 },
        { key: "line", label: "Assistance", width: 22 },
        { key: "created", label: "Created", width: 18 },
      ],
      rows,
    };
  }

  if (reportId === "audit_trail") {
    const rows = ctx.audits.map((audit) => {
      const meta = audit.request_id
        ? ctx.requestMetaById.get(String(audit.request_id))
        : undefined;
      return {
        changedAt: formatDateTimeCell(audit.changed_at),
        code: meta?.code || audit.request_id || "",
        line: meta?.line || "",
        service: meta?.service || "",
        action: formatActionLabel(audit.action, audit.old_status, audit.new_status),
        fromStatus: audit.old_status ? normalizeStatus(audit.old_status) : "",
        toStatus: audit.new_status ? normalizeStatus(audit.new_status) : "",
        actor: ctx.actorById[String(audit.changed_by ?? "")] || audit.changed_by || "System",
      };
    });
    return {
      recordCount: rows.length,
      columns: [
        { key: "changedAt", label: "Date & Time", width: 22 },
        { key: "code", label: "Application ID", width: 16 },
        { key: "line", label: "Assistance", width: 20 },
        { key: "service", label: "Service", width: 22 },
        { key: "action", label: "Action", width: 20 },
        { key: "fromStatus", label: "From Status", width: 16 },
        { key: "toStatus", label: "To Status", width: 16 },
        { key: "actor", label: "Performed By", width: 28 },
      ],
      rows,
    };
  }

  // platform_summary — KPI list
  const approved = ctx.apps.filter((a) => a.status === "Approved").length;
  const total = ctx.apps.length;
  const open = total - approved;
  const rows: Record<string, string | number>[] = [
    { metric: "Registered applicants (all time)", value: ctx.platform.registered_applicants },
    { metric: "Assistance admins (all time)", value: ctx.platform.line_admins },
    { metric: "Active assistance", value: ctx.platform.active_assistance_lines },
    { metric: "Active services", value: ctx.platform.active_services },
    { metric: "Applications in range", value: total },
    { metric: "Approved in range", value: approved },
    { metric: "Open (non-approved) in range", value: open },
    { metric: "Approval rate in range", value: `${approvalRatePct(approved, total)}%` },
  ];
  return {
    recordCount: total,
    columns: [
      { key: "metric", label: "Metric", width: 36 },
      { key: "value", label: "Value", width: 20 },
    ],
    rows,
  };
}

// -- File generation ---------------------------------------------------------

function buildExportFile(
  report: BuiltReport,
  meta: { title: string; scopeLabel: string; rangeLabel: string; generatedBy: string },
  format: "xlsx" | "csv"
): string {
  const generatedAt = new Date();
  const headerBlock: (string | number)[][] = [
    [meta.title],
    ["Scope: Platform-wide (Super Admin)"],
    [`Assistance: ${meta.scopeLabel}`],
    [`Date range: ${meta.rangeLabel}`],
    [`Generated: ${generatedAt.toLocaleString("en-US", { timeZone: REPORT_TZ })}`],
    [`Generated by: ${meta.generatedBy}`],
    [`Total records: ${report.recordCount}`],
    [],
  ];
  const tableBlock: (string | number)[][] = [
    report.columns.map((column) => column.label),
    ...report.rows.map((row) =>
      report.columns.map((column) => {
        const value = row[column.key];
        return value === undefined || value === null ? "" : value;
      })
    ),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet([...headerBlock, ...tableBlock]);
  worksheet["!cols"] = report.columns.map((column) => ({ wch: column.width || 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, meta.title.slice(0, 31));
  return XLSX.write(workbook, {
    type: "base64",
    bookType: format === "csv" ? "csv" : "xlsx",
  }) as string;
}

function buildFileName(reportId: string, format: "xlsx" | "csv"): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: REPORT_TZ,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const stamp = `${get("year")}-${get("month")}-${get("day")}_${get("hour")}${get("minute")}`;
  return `platform_${slugify(reportId)}_${stamp}.${format}`;
}

async function resolveGeneratedBy(
  supabase: ServiceClient,
  auth: Awaited<ReturnType<typeof authorizeRequest>>
): Promise<string> {
  if (auth.viaSecret || !auth.userId) return "System";
  try {
    const { data } = await supabase.auth.admin.getUserById(auth.userId);
    return data?.user?.email || "Super Admin";
  } catch {
    return "Super Admin";
  }
}

// -- Handler -----------------------------------------------------------------

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();
    const auth = await authorizeRequest(req, supabase, "SUPER_ADMIN_REPORTS_SECRET");
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    await ensureSuperAdmin(supabase, auth);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const mode = String(body.mode ?? "summary");
    const requestedCategoryId = body.categoryId ? String(body.categoryId).trim() : null;
    const startIso = body.startIso ? String(body.startIso) : null;
    const endIso = body.endIso ? String(body.endIso) : null;
    const reportId = String(body.reportId ?? "");

    const [categories, services] = await Promise.all([
      fetchCategories(supabase),
      fetchServices(supabase),
    ]);

    if (requestedCategoryId && !categories.some((c) => String(c.id) === requestedCategoryId)) {
      return jsonResponse({ error: "Unknown assistance." }, 400);
    }

    const categoryLabelById = new Map<string, string>();
    for (const category of categories) {
      categoryLabelById.set(String(category.id), category.assistance_name || category.id);
    }

    const scopedCategories = requestedCategoryId
      ? categories.filter((c) => String(c.id) === requestedCategoryId)
      : categories;
    const scopedCategoryIds = new Set(scopedCategories.map((c) => String(c.id)));
    const scopedServices = services.filter((s) =>
      scopedCategoryIds.has(String(s.category_id))
    );
    const serviceIds = scopedServices.map((s) => String(s.id));

    const requestRows = await fetchRequests(supabase, serviceIds);
    const namesById = await fetchUserNames(
      supabase,
      requestRows.map((row) => String(row.user_id ?? "")).filter(Boolean)
    );
    const allApps = buildAppRecords(requestRows, scopedServices, scopedCategories, namesById);
    const apps = filterByRange(allApps, startIso, endIso);

    const rangeLabel = formatRangeLabel(startIso, endIso);
    const scopeLabel = requestedCategoryId
      ? categoryLabelById.get(requestedCategoryId) || "Selected assistance"
      : "All assistance";

    if (mode === "summary") {
      const platform = await fetchPlatformCounts(supabase);
      const admins = await fetchAdmins(supabase);
      const audits = await fetchAuditLogs(supabase, startIso, endIso);

      const ctx: ReportContext = {
        apps,
        categories: scopedCategories,
        services: scopedServices,
        platform,
        admins,
        adminEmails: {},
        categoryLabelById,
        audits,
        requestMetaById: new Map(),
        actorById: {},
      };

      const reports = REPORT_IDS.map((id) => ({ id, count: reportCount(id, ctx) }));

      return jsonResponse({
        success: true,
        total: apps.length,
        rangeLabel,
        scopeLabel,
        platform,
        lines: categories.map((c) => ({ id: c.id, label: c.assistance_name || c.id })),
        reports,
      });
    }

    if (mode === "export") {
      if (!REPORT_TITLES[reportId]) {
        return jsonResponse({ error: "Unknown report." }, 400);
      }

      // Load only what the requested report needs.
      const platform =
        reportId === "platform_summary"
          ? await fetchPlatformCounts(supabase)
          : { registered_applicants: 0, line_admins: 0, active_assistance_lines: 0, active_services: 0 };

      let admins: AdminRow[] = [];
      let adminEmails: Record<string, string> = {};
      if (reportId === "admin_directory") {
        admins = await fetchAdmins(supabase);
        adminEmails = await fetchAdminEmails(
          supabase,
          admins.map((a) => a.user_id)
        );
      }

      let audits: AuditRow[] = [];
      const requestMetaById = new Map<string, { code: string; line: string; service: string }>();
      let actorById: Record<string, string> = {};
      if (reportId === "audit_trail") {
        audits = await fetchAuditLogs(supabase, startIso, endIso);
        for (const app of allApps) {
          requestMetaById.set(app.requestId, {
            code: app.code,
            line: app.line,
            service: app.service,
          });
        }
        // Resolve actors: applicant names first, then admin emails.
        const actorIds = [
          ...new Set(audits.map((a) => String(a.changed_by ?? "")).filter(Boolean)),
        ];
        const actorNames = await fetchUserNames(supabase, actorIds);
        const missing = actorIds.filter((id) => !actorNames[id]);
        const actorEmails = await fetchAdminEmails(supabase, missing);
        actorById = { ...actorNames };
        for (const [id, email] of Object.entries(actorEmails)) {
          if (!actorById[id]) actorById[id] = email;
        }
      }

      const ctx: ReportContext = {
        apps,
        categories: scopedCategories,
        services: scopedServices,
        platform,
        admins,
        adminEmails,
        categoryLabelById,
        audits,
        requestMetaById,
        actorById,
      };

      const report = buildReport(reportId, ctx);
      if (report.rows.length === 0) {
        return jsonResponse({ success: false, error: "No records to export in this range." }, 200);
      }

      const format = String(body.format ?? "xlsx") === "csv" ? "csv" : "xlsx";
      const generatedBy = await resolveGeneratedBy(supabase, auth);
      const base64 = buildExportFile(
        report,
        { title: REPORT_TITLES[reportId], scopeLabel, rangeLabel, generatedBy },
        format
      );
      const mimeType =
        format === "csv"
          ? "text/csv;charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      return jsonResponse({
        success: true,
        fileName: buildFileName(reportId, format),
        mimeType,
        base64,
        recordCount: report.recordCount,
      });
    }

    return jsonResponse({ error: "Unknown mode." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
