import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient";

const RANGE_PRESETS = [
  { value: "day", label: "Today" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "This Month" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

const EXPORT_FORMATS = [
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "csv", label: "CSV (.csv)" },
];

/** Display metadata only — all data/logic lives in the super-admin-reports edge function. */
const REPORT_CARDS = [
  {
    id: "platform_summary",
    title: "Platform Summary",
    description:
      "Executive KPIs: registered applicants, admins, active assistance and services, applications, and approval rate.",
    icon: "📊",
    unit: "records covered",
  },
  {
    id: "line_performance",
    title: "Assistance Performance",
    description:
      "Per-assistance status matrix with totals, open workload, and approval rate across the whole platform.",
    icon: "🏛️",
    unit: "assistance",
  },
  {
    id: "service_utilization",
    title: "Service Utilization",
    description:
      "Requests and outcomes per service, ranked by volume — highlights demand and bottlenecks.",
    icon: "🧩",
    unit: "services",
  },
  {
    id: "master",
    title: "Applications Master List",
    description:
      "Every request across all assistance with applicant, service, status, and key dates.",
    icon: "🗂️",
    unit: "rows in range",
  },
  {
    id: "approved",
    title: "Approved Beneficiaries",
    description:
      "All approved beneficiaries across every assistance — built for disbursement records and audits.",
    icon: "✅",
    unit: "rows in range",
  },
  {
    id: "declined",
    title: "Declined Requests",
    description:
      "Requests declined at disbursement across every assistance — kept in Archive for audit.",
    icon: "⛔",
    unit: "rows in range",
  },
  {
    id: "admin_directory",
    title: "Admin Directory",
    description:
      "Governance snapshot of all admin accounts, their role, assigned assistance, and creation date.",
    icon: "👥",
    unit: "admins",
  },
  {
    id: "audit_trail",
    title: "System Audit Trail",
    description:
      "Chronological record of request movements across the platform and who performed each action.",
    icon: "🧾",
    unit: "events in range",
  },
];

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDefaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  return { from: toDateInputValue(from), to: toDateInputValue(to) };
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Resolves [start, end) in the admin's local time, then sends absolute ISO instants. */
function resolveRangeIso(preset, customRange) {
  const now = new Date();
  const toIso = (start, end) => ({
    startIso: start ? start.toISOString() : null,
    endIso: end ? end.toISOString() : null,
  });

  if (preset === "day") {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return toIso(start, end);
  }
  if (preset === "week") {
    const end = new Date(startOfDay(now));
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return toIso(start, end);
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return toIso(start, end);
  }
  if (preset === "custom" && customRange?.from && customRange?.to) {
    const start = startOfDay(new Date(`${customRange.from}T00:00:00`));
    const end = startOfDay(new Date(`${customRange.to}T00:00:00`));
    end.setDate(end.getDate() + 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return toIso(null, null);
    }
    return toIso(start, end);
  }
  return toIso(null, null);
}

function downloadBase64File(base64, fileName, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "report";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const PLATFORM_KPIS = [
  { key: "registered_applicants", label: "Applicants" },
  { key: "line_admins", label: "Assistance Admins" },
  { key: "active_assistance_lines", label: "Assistance" },
  { key: "active_services", label: "Services" },
];

function SkeletonPulse({ className = "", tone = "light" }) {
  const toneClass = tone === "dark" ? "bg-white/20" : "bg-ocean-100/80";
  return <div className={`animate-pulse rounded-md ${toneClass} ${className}`} />;
}

function HeaderMetaSkeleton() {
  return (
    <div className="mt-1">
      <SkeletonPulse tone="dark" className="h-4 w-[min(100%,28rem)] max-w-full" />
    </div>
  );
}

function PlatformKpiSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PLATFORM_KPIS.map((kpi) => (
        <div
          key={`kpi-skeleton-${kpi.key}`}
          className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5"
        >
          <SkeletonPulse tone="dark" className="h-6 w-16" />
          <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ocean-100/80">
            {kpi.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function RangeLabelSkeleton() {
  return <SkeletonPulse className="ml-1 h-3.5 w-40" />;
}

function ReportCardSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl border border-ocean-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <SkeletonPulse className="size-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <SkeletonPulse className="h-4 w-[70%]" />
          <SkeletonPulse className="h-3 w-full" />
          <SkeletonPulse className="h-3 w-[88%]" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <SkeletonPulse className="h-3.5 w-28" />
        <SkeletonPulse className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

function ReportsGridSkeleton() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      {REPORT_CARDS.map((report) => (
        <ReportCardSkeleton key={`report-skeleton-${report.id}`} />
      ))}
    </div>
  );
}

export function Reports() {
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rangePreset, setRangePreset] = useState("month");
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");
  const [exportFormat, setExportFormat] = useState("xlsx");

  const [summary, setSummary] = useState(null);
  const [lines, setLines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [exportingId, setExportingId] = useState(null);
  const [exportNotice, setExportNotice] = useState("");

  const rangeReady = rangePreset !== "custom" || Boolean(customRangeApplied);

  const { startIso, endIso } = useMemo(
    () => resolveRangeIso(rangePreset, customRangeApplied),
    [rangePreset, customRangeApplied]
  );

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      if (!rangeReady) {
        if (isMounted) {
          setSummary(null);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError("");

      try {
        const { data, error } = await supabase.functions.invoke("super-admin-reports", {
          body: {
            mode: "summary",
            categoryId: categoryId || null,
            startIso,
            endIso,
          },
        });

        if (!isMounted) return;
        if (error) throw new Error(error.message || "Unable to load reports.");
        if (!data?.success) throw new Error(data?.error || "Unable to load reports.");

        const countsById = {};
        for (const entry of data.reports || []) {
          countsById[entry.id] = entry.count;
        }

        setSummary({
          total: data.total || 0,
          rangeLabel: data.rangeLabel || "",
          scopeLabel: data.scopeLabel || "All assistance",
          platform: data.platform || null,
          countsById,
        });
        if (Array.isArray(data.lines)) {
          setLines(data.lines);
        }
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error?.message || "Unable to load reports.");
        setSummary(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadSummary();
    return () => {
      isMounted = false;
    };
  }, [rangeReady, categoryId, startIso, endIso, reloadKey]);

  const reportsView = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return REPORT_CARDS.filter((report) => {
      if (!query) return true;
      return (
        report.title.toLowerCase().includes(query) ||
        report.description.toLowerCase().includes(query)
      );
    });
  }, [catalogSearch]);

  const handlePresetChange = (nextPreset) => {
    setCustomRangeError("");
    setRangePreset(nextPreset);
    if (nextPreset !== "custom") {
      setCustomRangeApplied(null);
    }
  };

  const handleApplyCustomRange = () => {
    const from = String(customRangeDraft.from || "").trim();
    const to = String(customRangeDraft.to || "").trim();
    if (!from || !to) {
      setCustomRangeError("Select both a start and end date.");
      return;
    }
    if (from > to) {
      setCustomRangeError("Start date must be on or before end date.");
      return;
    }
    setCustomRangeError("");
    setCustomRangeApplied({ from, to });
    setRangePreset("custom");
  };

  const handleReload = () => {
    setExportNotice("");
    setReloadKey((previous) => previous + 1);
  };

  const handleExport = useCallback(
    async (report) => {
      setExportNotice("");
      setExportingId(report.id);
      try {
        const { data, error } = await supabase.functions.invoke("super-admin-reports", {
          body: {
            mode: "export",
            reportId: report.id,
            format: exportFormat,
            categoryId: categoryId || null,
            startIso,
            endIso,
          },
        });

        if (error) throw new Error(error.message || "Failed to generate the report file.");
        if (!data?.success) {
          setExportNotice(data?.error || `No records to export for "${report.title}".`);
          return;
        }

        downloadBase64File(data.base64, data.fileName, data.mimeType);
        setExportNotice(
          `Exported ${Number(data.recordCount || 0).toLocaleString("en-US")} record${
            Number(data.recordCount) === 1 ? "" : "s"
          } to ${data.fileName}.`
        );
      } catch (error) {
        setExportNotice(error?.message || "Failed to generate the report file.");
      } finally {
        setExportingId(null);
      }
    },
    [exportFormat, categoryId, startIso, endIso]
  );

  const totalInRange = summary?.total || 0;
  const showCustomPrompt = rangePreset === "custom" && !customRangeApplied;
  const showContentSkeleton = isLoading && rangeReady;

  return (
    <section className="-m-2 space-y-4 sm:-m-3 lg:-m-4">
      {/* Header */}
      <div className="overflow-hidden rounded-[26px] border border-ocean-200 bg-gradient-to-b from-ocean-700 via-ocean-800 to-ocean-900 p-5 text-white">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ocean-200">
              Super Admin
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Reports &amp; Exports</h1>
            {showContentSkeleton ? (
              <HeaderMetaSkeleton />
            ) : (
              <p className="mt-1 text-sm text-ocean-100/90">
                Platform-wide, generated securely on the server.{" "}
                {showCustomPrompt
                  ? "Select a custom date range to load reports."
                  : `${totalInRange.toLocaleString("en-US")} application${
                      totalInRange === 1 ? "" : "s"
                    } in range · ${summary?.scopeLabel || "All assistance"}`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleReload}
            disabled={isLoading || showCustomPrompt}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Reloading…" : "Reload"}
          </button>
        </div>

        {showContentSkeleton ? (
          <PlatformKpiSkeleton />
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLATFORM_KPIS.map((kpi) => (
              <div
                key={kpi.key}
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2.5"
              >
                <p className="text-lg font-semibold">
                  {Number(summary?.platform?.[kpi.key] || 0).toLocaleString("en-US")}
                </p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ocean-100/80">
                  {kpi.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Controls + cards */}
      <div className="rounded-[26px] border border-ocean-200 bg-white p-5">
        <div className="flex flex-col gap-3 border-b border-ocean-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search reports"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              disabled={showContentSkeleton}
              className="h-9 min-w-[200px] flex-1 rounded-lg border border-ocean-200 bg-white px-3 text-sm text-ocean-900 outline-none transition focus:border-ocean-400 disabled:cursor-not-allowed disabled:opacity-60"
            />

            {showContentSkeleton && lines.length === 0 ? (
              <SkeletonPulse className="h-9 w-36 rounded-lg" />
            ) : (
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                disabled={showContentSkeleton}
                className="h-9 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 outline-none focus:border-ocean-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">All assistance</option>
                {lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.label}
                  </option>
                ))}
              </select>
            )}

            <div className="ml-auto flex items-center gap-1 rounded-lg border border-ocean-200 p-0.5">
              {EXPORT_FORMATS.map((format) => {
                const isActive = exportFormat === format.value;
                return (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => setExportFormat(format.value)}
                    disabled={showContentSkeleton}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive ? "bg-ocean-700 text-white" : "text-ocean-700 hover:bg-ocean-50"
                    }`}
                    title={format.label}
                  >
                    {format.value === "xlsx" ? "Excel" : "CSV"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {RANGE_PRESETS.map((option) => {
              const isActive = rangePreset === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handlePresetChange(option.value)}
                  disabled={showContentSkeleton && option.value !== rangePreset}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isActive
                      ? "bg-ocean-700 text-white shadow-sm"
                      : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            {showContentSkeleton ? (
              <RangeLabelSkeleton />
            ) : (
              <span className="ml-1 text-[11px] font-medium text-ocean-700">
                {summary?.rangeLabel ||
                  (rangeReady ? "…" : "Select a custom range")}
              </span>
            )}
          </div>

          {rangePreset === "custom" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[11px] text-ocean-700">
                From
                <input
                  type="date"
                  value={customRangeDraft.from}
                  onChange={(event) =>
                    setCustomRangeDraft((previous) => ({ ...previous, from: event.target.value }))
                  }
                  className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none focus:border-ocean-400"
                />
              </label>
              <label className="text-[11px] text-ocean-700">
                To
                <input
                  type="date"
                  value={customRangeDraft.to}
                  onChange={(event) =>
                    setCustomRangeDraft((previous) => ({ ...previous, to: event.target.value }))
                  }
                  className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none focus:border-ocean-400"
                />
              </label>
              <button
                type="button"
                onClick={handleApplyCustomRange}
                className="rounded-lg bg-ocean-700 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-ocean-800"
              >
                Apply Range
              </button>
            </div>
          ) : null}

          {customRangeError ? (
            <p className="text-xs text-red-600">{customRangeError}</p>
          ) : null}
        </div>

        {loadError ? (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {exportNotice ? (
          <div className="mt-4 rounded-lg border border-ocean-200 bg-ocean-50 px-3 py-2 text-sm text-ocean-800">
            {exportNotice}
          </div>
        ) : null}

        {showCustomPrompt ? (
          <p className="py-10 text-center text-sm text-ocean-700">
            Choose a start and end date, then click Apply Range to build your reports.
          </p>
        ) : showContentSkeleton ? (
          <ReportsGridSkeleton />
        ) : reportsView.length === 0 ? (
          <p className="py-10 text-center text-sm text-ocean-700">
            No reports match "{catalogSearch.trim()}".
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {reportsView.map((report) => {
              const count = summary?.countsById?.[report.id] ?? 0;
              const isEmpty = count === 0;
              const isExporting = exportingId === report.id;
              return (
                <div
                  key={report.id}
                  className="flex flex-col rounded-2xl border border-ocean-200 bg-white p-4 transition hover:shadow-[0_16px_36px_-24px_rgba(var(--system-primary-rgb),0.55)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-ocean-50 text-lg">
                      {report.icon}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-ocean-950">{report.title}</h2>
                      <p className="mt-0.5 text-xs leading-relaxed text-ocean-700">
                        {report.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-ocean-700">
                      <span className="font-semibold text-ocean-900">
                        {Number(count).toLocaleString("en-US")}
                      </span>{" "}
                      {report.unit}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleExport(report)}
                      disabled={isEmpty || isExporting}
                      className="inline-flex items-center gap-2 rounded-lg bg-ocean-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-ocean-800 disabled:cursor-not-allowed disabled:opacity-40"
                      title={
                        isEmpty
                          ? "No records to export for this range"
                          : `Export as ${exportFormat.toUpperCase()}`
                      }
                    >
                      {isExporting ? "Exporting…" : "Export"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
