import { authorizeRequest, getServiceClient, ServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { applicantDisplayNameFromRequest, APPLICANT_SNAPSHOT_SELECT } from "../_shared/applicantSnapshot.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

/**
 * POST /functions/v1/admin-reports
 *
 * Security-critical reporting backend. All data access, assistance-line scoping,
 * filtering, aggregation, and file generation happen here (service_role) so the
 * frontend cannot over-fetch, escalate scope, or fabricate report contents.
 *
 * Modes:
 *  - { mode: "summary", serviceId?, startIso?, endIso? }
 *      → { success, total, rangeLabel, lineTitle, serviceLabel, reports: [{ id, count }] }
 *  - { mode: "export", reportId, format: "xlsx"|"csv", serviceId?, startIso?, endIso? }
 *      → { success, fileName, mimeType, base64, recordCount }
 *
 * Auth: Supabase user JWT (must be in public.admins), or ADMIN_REPORTS_SECRET
 * for trusted server-to-server calls.
 */

const REPORT_TZ = "Asia/Manila";

const STATUS_ORDER = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
  "Declined",
] as const;

const BACKLOG_STATUSES = new Set<string>([
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
]);

const STATUS_LABELS: Record<string, string> = {
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

interface ReportColumn {
  key: string;
  label: string;
  width: number;
}

interface ScopedServiceRow {
  id: string;
  category_id: string | null;
  display_name: string | null;
}

interface RequestRow {
  id: string;
  request_code: string | null;
  user_id: string | null;
  service_id: string | null;
  service_name?: string | null;
  assistance_name?: string | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  case_study_date: string | null;
  applicant_first_name?: string | null;
  applicant_middle_name?: string | null;
  applicant_last_name?: string | null;
  applicant_suffix?: string | null;
}

interface AppRecord {
  id: string;
  name: string;
  category: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  caseStudyDate: string | null;
}

interface ReportsScope {
  isSuperAdmin: boolean;
  categoryId: string | null;
  serviceIds: string[];
}

// -- Normalizers (kept in sync with src/shared/lib/requestData.js) ------------

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

function daysBetween(fromValue: unknown, nowDate: Date): number | "" {
  const from = toValidDate(fromValue);
  if (!from) return "";
  const diffMs = nowDate.getTime() - from.getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
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

// -- Scope resolution (server-authoritative) ---------------------------------

async function fetchActiveServices(supabase: ServiceClient): Promise<ScopedServiceRow[]> {
  const { data, error } = await supabase
    .from("assistance_services")
    .select("id, category_id, display_name")
    .order("sort_order");

  if (error) throw error;
  return (data || []) as ScopedServiceRow[];
}

async function resolveReportsScope(
  supabase: ServiceClient,
  auth: Awaited<ReturnType<typeof authorizeRequest>>,
  services: ScopedServiceRow[]
): Promise<ReportsScope> {
  const allServiceIds = [
    ...new Set(services.map((s) => String(s.id || "").trim()).filter(Boolean)),
  ];

  if (auth.viaSecret) {
    return { isSuperAdmin: true, categoryId: null, serviceIds: allServiceIds };
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
    return { isSuperAdmin: true, categoryId: null, serviceIds: allServiceIds };
  }

  const categoryId = String(adminRow.category_id ?? "").trim();
  if (!categoryId) {
    throw new Error("Forbidden");
  }

  const serviceIds = services
    .filter((service) => String(service.category_id ?? "").trim() === categoryId)
    .map((service) => String(service.id || "").trim())
    .filter(Boolean);

  return { isSuperAdmin: false, categoryId, serviceIds };
}

async function resolveLineTitle(
  supabase: ServiceClient,
  scope: ReportsScope
): Promise<string> {
  if (scope.isSuperAdmin || !scope.categoryId) {
    return "All Assistance";
  }

  const { data } = await supabase
    .from("assistance_categories")
    .select("assistance_name")
    .eq("id", scope.categoryId)
    .maybeSingle();

  const name = String(data?.assistance_name ?? "").trim();
  if (!name) return "Assistance";
  return /\bassistance$/i.test(name) ? name : `${name} Assistance`;
}

async function resolveGeneratedBy(
  supabase: ServiceClient,
  auth: Awaited<ReturnType<typeof authorizeRequest>>
): Promise<string> {
  if (auth.viaSecret || !auth.userId) {
    return "System";
  }
  try {
    const { data } = await supabase.auth.admin.getUserById(auth.userId);
    return data?.user?.email || "Admin";
  } catch {
    return "Admin";
  }
}

// -- Data loading + scoping --------------------------------------------------

async function fetchScopedRequests(
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
        "id, request_code, user_id, service_id, service_name, assistance_name, status, submitted_at, created_at, updated_at, case_study_date, " +
          APPLICANT_SNAPSHOT_SELECT
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

function buildAppRecords(
  rows: RequestRow[],
  serviceLabelById: Record<string, string>
): AppRecord[] {
  return rows.map((row) => {
    const serviceId = String(row.service_id ?? "").trim();
    return {
      id: row.request_code || row.id,
      name: applicantDisplayNameFromRequest(row as Record<string, unknown>),
      category:
        String(row.service_name || "").trim() ||
        serviceLabelById[serviceId] ||
        "Request",
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

  if (!start && !end) {
    return apps;
  }

  return apps.filter((app) => {
    const activity = toValidDate(app.submittedAt || app.createdAt);
    if (!activity) return false;
    if (start && activity < start) return false;
    if (end && activity >= end) return false;
    return true;
  });
}

// -- Report definitions (server-side source of truth) ------------------------

interface BuiltReport {
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
  recordCount: number;
  aggregate?: boolean;
}

function selectForReport(reportId: string, apps: AppRecord[]): AppRecord[] {
  switch (reportId) {
    case "approved":
      return apps.filter((app) => app.status === "Approved");
    case "declined":
      return apps.filter((app) => app.status === "Declined");
    case "backlog":
      return apps.filter((app) => BACKLOG_STATUSES.has(app.status));
    case "master":
    case "status_summary":
    default:
      return apps;
  }
}

function buildReport(reportId: string, apps: AppRecord[]): BuiltReport {
  if (reportId === "master") {
    return {
      recordCount: apps.length,
      columns: [
        { key: "id", label: "Application ID", width: 16 },
        { key: "name", label: "Applicant Name", width: 26 },
        { key: "category", label: "Service Category", width: 22 },
        { key: "status", label: "Status", width: 16 },
        { key: "submitted", label: "Submitted Date", width: 22 },
        { key: "updated", label: "Last Updated", width: 22 },
        { key: "caseStudy", label: "Case Study Date", width: 18 },
      ],
      rows: apps.map((app) => ({
        id: app.id,
        name: app.name,
        category: app.category,
        status: app.status,
        submitted: formatDateTimeCell(app.submittedAt || app.createdAt),
        updated: formatDateTimeCell(app.updatedAt || app.createdAt),
        caseStudy: formatDateCell(app.caseStudyDate),
      })),
    };
  }

  if (reportId === "approved") {
    return {
      recordCount: apps.length,
      columns: [
        { key: "id", label: "Application ID", width: 16 },
        { key: "name", label: "Beneficiary Name", width: 26 },
        { key: "category", label: "Service Category", width: 22 },
        { key: "submitted", label: "Submitted Date", width: 22 },
        { key: "approved", label: "Approved On", width: 22 },
      ],
      rows: apps.map((app) => ({
        id: app.id,
        name: app.name,
        category: app.category,
        submitted: formatDateCell(app.submittedAt || app.createdAt),
        approved: formatDateTimeCell(app.updatedAt || app.createdAt),
      })),
    };
  }

  if (reportId === "declined") {
    return {
      recordCount: apps.length,
      columns: [
        { key: "id", label: "Application ID", width: 16 },
        { key: "name", label: "Applicant Name", width: 26 },
        { key: "category", label: "Service Category", width: 22 },
        { key: "submitted", label: "Submitted Date", width: 22 },
        { key: "declined", label: "Declined On", width: 22 },
      ],
      rows: apps.map((app) => ({
        id: app.id,
        name: app.name,
        category: app.category,
        submitted: formatDateCell(app.submittedAt || app.createdAt),
        declined: formatDateTimeCell(app.updatedAt || app.createdAt),
      })),
    };
  }

  if (reportId === "backlog") {
    const now = new Date();
    return {
      recordCount: apps.length,
      columns: [
        { key: "id", label: "Application ID", width: 16 },
        { key: "name", label: "Applicant Name", width: 26 },
        { key: "category", label: "Service Category", width: 22 },
        { key: "status", label: "Current Status", width: 16 },
        { key: "submitted", label: "Submitted Date", width: 22 },
        { key: "daysOpen", label: "Days Open", width: 12 },
      ],
      rows: apps.map((app) => ({
        id: app.id,
        name: app.name,
        category: app.category,
        status: app.status,
        submitted: formatDateCell(app.submittedAt || app.createdAt),
        daysOpen: daysBetween(app.submittedAt || app.createdAt, now),
      })),
    };
  }

  // status_summary (aggregate)
  const categories = [...new Set(apps.map((app) => app.category))].sort();
  const columns: ReportColumn[] = [
    { key: "category", label: "Service Category", width: 24 },
    ...STATUS_ORDER.map((status) => ({ key: status, label: status, width: 15 })),
    { key: "Total", label: "Total", width: 12 },
  ];

  const rows: Record<string, string | number>[] = categories.map((category) => {
    const row: Record<string, string | number> = { category };
    let total = 0;
    for (const status of STATUS_ORDER) {
      const count = apps.filter(
        (app) => app.category === category && app.status === status
      ).length;
      row[status] = count;
      total += count;
    }
    row.Total = total;
    return row;
  });

  const totalsRow: Record<string, string | number> = { category: "TOTAL" };
  let grandTotal = 0;
  for (const status of STATUS_ORDER) {
    const count = apps.filter((app) => app.status === status).length;
    totalsRow[status] = count;
    grandTotal += count;
  }
  totalsRow.Total = grandTotal;
  if (rows.length > 0) {
    rows.push(totalsRow);
  }

  return { recordCount: apps.length, columns, rows, aggregate: true };
}

const REPORT_TITLES: Record<string, string> = {
  master: "Applications Master List",
  approved: "Approved Beneficiaries",
  declined: "Declined Requests",
  backlog: "Open Workload (Backlog)",
  status_summary: "Status Summary",
};

const REPORT_IDS = Object.keys(REPORT_TITLES);

// -- Range label -------------------------------------------------------------

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
  // end is exclusive; show inclusive final day.
  const inclusiveEnd = end ? new Date(end.getTime() - 1) : null;
  const endLabel = inclusiveEnd ? fmt(inclusiveEnd) : null;

  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }
  return "All time";
}

// -- File generation ---------------------------------------------------------

function buildExportFile(
  report: BuiltReport,
  meta: {
    title: string;
    lineTitle: string;
    serviceLabel: string;
    rangeLabel: string;
    generatedBy: string;
  },
  format: "xlsx" | "csv"
): string {
  const generatedAt = new Date();
  const headerBlock: (string | number)[][] = [
    [meta.title],
    [`Assistance: ${meta.lineTitle}`],
    [`Service scope: ${meta.serviceLabel}`],
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

function buildFileName(
  lineTitle: string,
  reportId: string,
  format: "xlsx" | "csv"
): string {
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
  return `${slugify(lineTitle)}_${reportId}_${stamp}.${format}`;
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
    const auth = await authorizeRequest(req, supabase, "ADMIN_REPORTS_SECRET");
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const mode = String(body.mode ?? "summary");
    const requestedServiceId = body.serviceId ? String(body.serviceId).trim() : null;
    const startIso = body.startIso ? String(body.startIso) : null;
    const endIso = body.endIso ? String(body.endIso) : null;

    const services = await fetchActiveServices(supabase);
    const scope = await resolveReportsScope(supabase, auth, services);

    // Enforce scope: a requested service must belong to this admin's line.
    let effectiveServiceIds = scope.serviceIds;
    let serviceLabel = "All services";
    if (requestedServiceId) {
      if (!scope.serviceIds.includes(requestedServiceId)) {
        return jsonResponse({ error: "Service is outside your scope." }, 403);
      }
      effectiveServiceIds = [requestedServiceId];
      const match = services.find((s) => String(s.id) === requestedServiceId);
      serviceLabel = match?.display_name || "Selected service";
    }

    const serviceLabelById: Record<string, string> = {};
    for (const service of services) {
      serviceLabelById[String(service.id)] = service.display_name || "Request";
    }

    const rows = await fetchScopedRequests(supabase, effectiveServiceIds);
    const allApps = buildAppRecords(rows, serviceLabelById);
    const apps = filterByRange(allApps, startIso, endIso);

    const rangeLabel = formatRangeLabel(startIso, endIso);
    const lineTitle = await resolveLineTitle(supabase, scope);

    if (mode === "summary") {
      const reports = REPORT_IDS.map((id) => ({
        id,
        count: selectForReport(id, apps).length,
      }));

      return jsonResponse({
        success: true,
        total: apps.length,
        rangeLabel,
        lineTitle,
        serviceLabel,
        reports,
      });
    }

    if (mode === "export") {
      const reportId = String(body.reportId ?? "");
      const format = String(body.format ?? "xlsx") === "csv" ? "csv" : "xlsx";

      if (!REPORT_TITLES[reportId]) {
        return jsonResponse({ error: "Unknown report." }, 400);
      }

      const selected = selectForReport(reportId, apps);
      if (selected.length === 0) {
        return jsonResponse({ success: false, error: "No records to export in this range." }, 200);
      }

      const report = buildReport(reportId, selected);
      const generatedBy = await resolveGeneratedBy(supabase, auth);

      const base64 = buildExportFile(
        report,
        {
          title: REPORT_TITLES[reportId],
          lineTitle,
          serviceLabel,
          rangeLabel,
          generatedBy,
        },
        format
      );

      const mimeType =
        format === "csv"
          ? "text/csv;charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

      return jsonResponse({
        success: true,
        fileName: buildFileName(lineTitle, reportId, format),
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
