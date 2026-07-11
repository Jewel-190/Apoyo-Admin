import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Download,
  RefreshCcw,
  ClipboardList,
  BadgeCheck,
  ListTodo,
  PieChart,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import { useAuth } from "../../shared/context/AuthContext";
import { supabase } from "../../shared/lib/supabaseClient";
import { formatAssistanceLineTitle } from "../../shared/lib/assistanceCategoryDisplay";

const RANGE_PRESETS = [
  { value: "day", label: "Today" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "This Month" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

const EXPORT_FORMATS = [
  { value: "xlsx", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { value: "csv", label: "CSV (.csv)", icon: FileText },
];

/**
 * Display metadata only. All data access, scoping, filtering, aggregation, and
 * file generation happen in the `admin-reports` edge function.
 */
const REPORT_CARDS = [
  {
    id: "master",
    title: "Applications Master List",
    description:
      "Every request in your assistance with applicant, current status, and key dates.",
    icon: ClipboardList,
    aggregate: false,
  },
  {
    id: "approved",
    title: "Approved Beneficiaries",
    description:
      "Applicants approved for assistance — ideal for disbursement records and audits.",
    icon: BadgeCheck,
    aggregate: false,
  },
  {
    id: "backlog",
    title: "Open Workload (Backlog)",
    description:
      "Requests still moving through the pipeline that need action, with days open.",
    icon: ListTodo,
    aggregate: false,
  },
  {
    id: "status_summary",
    title: "Status Summary",
    description:
      "Aggregated request counts per status, broken down by each service category.",
    icon: PieChart,
    aggregate: true,
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

/**
 * Resolves the active [start, end) window in the admin's local time, then
 * hands absolute ISO instants to the backend. Keeping this on the client
 * preserves the exact "Today / This Week / ..." semantics the admin expects
 * regardless of where the edge function runs.
 */
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

function SkeletonPulse({ className = "" }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/80 ${className}`} />;
}

function HeaderMetaSkeleton() {
  return (
    <div className="mt-1 space-y-1.5">
      <SkeletonPulse className="h-3.5 w-56 max-w-full" />
    </div>
  );
}

function RangeLabelSkeleton() {
  return <SkeletonPulse className="h-3.5 w-44" />;
}

function ReportCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 p-5">
      <div className="flex items-start gap-3">
        <SkeletonPulse className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <SkeletonPulse className="h-4 w-[65%]" />
          <SkeletonPulse className="h-3 w-full" />
          <SkeletonPulse className="h-3 w-[90%]" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <SkeletonPulse className="h-3.5 w-28" />
        <SkeletonPulse className="h-8 w-24 rounded-lg" />
      </div>
    </div>
  );
}

function ReportsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {REPORT_CARDS.map((report) => (
        <ReportCardSkeleton key={`report-skeleton-${report.id}`} />
      ))}
    </div>
  );
}

export default function Reports() {
  const { roleConfig, theme: authTheme } = useAuth();

  const [catalogSearch, setCatalogSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [rangePreset, setRangePreset] = useState("month");
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");
  const [exportFormat, setExportFormat] = useState("xlsx");

  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [exportingId, setExportingId] = useState(null);
  const [exportNotice, setExportNotice] = useState("");

  const theme = roleConfig?.theme || authTheme || {
    primary: "#0D9488",
    secondary: "#14B8A6",
  };
  const primary = theme.primary || "#0D9488";
  const secondary = theme.secondary || "#14B8A6";

  const sourceTables = useMemo(
    () => roleConfig?.requestSources || [],
    [roleConfig]
  );

  const fallbackLineTitle = useMemo(() => {
    if (roleConfig?.title) {
      return formatAssistanceLineTitle(roleConfig.title.replace(/ Admin$/i, ""));
    }
    return "Assistance";
  }, [roleConfig]);

  const categoryOptions = useMemo(
    () => ["All", ...sourceTables.map((source) => source.category)],
    [sourceTables]
  );

  const activeServiceId = useMemo(() => {
    if (category === "All") return null;
    const match = sourceTables.find((source) => source.category === category);
    return match?.serviceId ? String(match.serviceId) : null;
  }, [category, sourceTables]);

  const rangeReady = rangePreset !== "custom" || Boolean(customRangeApplied);
  const hasSources = sourceTables.length > 0;

  const { startIso, endIso } = useMemo(
    () => resolveRangeIso(rangePreset, customRangeApplied),
    [rangePreset, customRangeApplied]
  );

  useEffect(() => {
    let isMounted = true;

    const loadSummary = async () => {
      if (!hasSources || !rangeReady) {
        if (isMounted) {
          setSummary(null);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setLoadError("");

      try {
        const { data, error } = await supabase.functions.invoke("admin-reports", {
          body: { mode: "summary", serviceId: activeServiceId, startIso, endIso },
        });

        if (!isMounted) return;

        if (error) {
          throw new Error(error.message || "Unable to load reports.");
        }
        if (!data?.success) {
          throw new Error(data?.error || "Unable to load reports.");
        }

        const countsById = {};
        for (const entry of data.reports || []) {
          countsById[entry.id] = entry.count;
        }

        setSummary({
          total: data.total || 0,
          rangeLabel: data.rangeLabel || "",
          lineTitle: data.lineTitle || fallbackLineTitle,
          serviceLabel: data.serviceLabel || "All services",
          countsById,
        });
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
  }, [
    hasSources,
    rangeReady,
    activeServiceId,
    startIso,
    endIso,
    reloadKey,
    fallbackLineTitle,
  ]);

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

  const lineTitle = summary?.lineTitle || fallbackLineTitle;

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
        const { data, error } = await supabase.functions.invoke("admin-reports", {
          body: {
            mode: "export",
            reportId: report.id,
            format: exportFormat,
            serviceId: activeServiceId,
            startIso,
            endIso,
          },
        });

        if (error) {
          throw new Error(error.message || "Failed to generate the report file.");
        }
        if (!data?.success) {
          setExportNotice(
            data?.error || `No records to export for "${report.title}" in this range.`
          );
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
    [exportFormat, activeServiceId, startIso, endIso]
  );

  const totalInRange = summary?.total || 0;
  const showCustomPrompt = rangePreset === "custom" && !customRangeApplied;
  const showContentSkeleton = isLoading && rangeReady && hasSources;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative w-full max-w-lg">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={17}
          />
          <input
            type="text"
            placeholder="Search reports"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            disabled={showContentSkeleton}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-teal-300 transition-all duration-200 placeholder-gray-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <MiniNotifications />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1
              className="text-2xl"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  background: `linear-gradient(to right, ${primary}, ${secondary})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Reports
              </span>
              <span className="text-gray-800"> &amp; Exports</span>
            </h1>
            {showContentSkeleton ? (
              <HeaderMetaSkeleton />
            ) : (
              <p className="text-xs text-gray-500">
                {lineTitle} ·{" "}
                {showCustomPrompt
                  ? "Select a custom date range to load reports."
                  : `${totalInRange.toLocaleString("en-US")} record${
                      totalInRange === 1 ? "" : "s"
                    } in range`}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleReload}
            disabled={isLoading || !hasSources || showCustomPrompt}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ boxShadow: `0 0 0 1px ${primary}22 inset` }}
          >
            <RefreshCcw size={13} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Reloading..." : "Reload"}
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-5 mb-5">
          <div className="flex flex-wrap items-center gap-2">
            {categoryOptions.length > 2 ? (
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={showContentSkeleton}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 outline-none focus:ring-2 focus:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "All" ? "All services" : option}
                  </option>
                ))}
              </select>
            ) : null}

            <div className="flex flex-wrap gap-1.5">
              {RANGE_PRESETS.map((option) => {
                const isActive = rangePreset === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePresetChange(option.value)}
                    disabled={showContentSkeleton && option.value !== rangePreset}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive
                        ? "text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    style={
                      isActive
                        ? { backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})` }
                        : undefined
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-1.5 rounded-lg border border-gray-200 p-0.5">
              {EXPORT_FORMATS.map((format) => {
                const isActive = exportFormat === format.value;
                const Icon = format.icon;
                return (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => setExportFormat(format.value)}
                    disabled={showContentSkeleton}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive ? "text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                    style={
                      isActive
                        ? { backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})` }
                        : undefined
                    }
                    title={format.label}
                  >
                    <Icon size={13} />
                    {format.value === "xlsx" ? "Excel" : "CSV"}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showContentSkeleton ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-gray-500">Range:</span>
                <RangeLabelSkeleton />
              </div>
            ) : (
              <p className="text-[11px] font-medium text-gray-500">
                Range: {summary?.rangeLabel || (rangeReady ? "…" : "Select a custom range")}
              </p>
            )}
            {rangePreset === "custom" ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-gray-500">
                  From
                  <input
                    type="date"
                    value={customRangeDraft.from}
                    onChange={(event) =>
                      setCustomRangeDraft((previous) => ({
                        ...previous,
                        from: event.target.value,
                      }))
                    }
                    className="mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus-visible:ring-2"
                    style={{ accentColor: primary }}
                  />
                </label>
                <label className="text-[11px] text-gray-500">
                  To
                  <input
                    type="date"
                    value={customRangeDraft.to}
                    onChange={(event) =>
                      setCustomRangeDraft((previous) => ({
                        ...previous,
                        to: event.target.value,
                      }))
                    }
                    className="mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus-visible:ring-2"
                    style={{ accentColor: primary }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyCustomRange}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white"
                  style={{ backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})` }}
                >
                  Apply Range
                </button>
              </div>
            ) : null}
          </div>

          {customRangeError ? (
            <p className="text-xs text-red-600">{customRangeError}</p>
          ) : null}
        </div>

        {loadError ? (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {exportNotice ? (
          <div
            className="mb-4 rounded-lg border px-3 py-2 text-sm"
            style={{
              borderColor: `${primary}33`,
              backgroundColor: `${primary}0D`,
              color: "#374151",
            }}
          >
            {exportNotice}
          </div>
        ) : null}

        {!hasSources && !isLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No assistance is assigned to your account, so there is nothing to report yet.
          </p>
        ) : showCustomPrompt ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Choose a start and end date, then click Apply Range to build your reports.
          </p>
        ) : showContentSkeleton ? (
          <ReportsGridSkeleton />
        ) : reportsView.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No reports match "{catalogSearch.trim()}".
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reportsView.map((report) => {
              const Icon = report.icon;
              const count = summary?.countsById?.[report.id] ?? 0;
              const isEmpty = count === 0;
              const isExporting = exportingId === report.id;
              return (
                <div
                  key={report.id}
                  className="flex flex-col rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: `${primary}14`,
                        color: primary,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-800">
                        {report.title}
                      </h2>
                      <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                        {report.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-500">
                      {report.aggregate ? (
                        <>
                          <span className="font-semibold text-gray-700">
                            {count.toLocaleString("en-US")}
                          </span>{" "}
                          record{count === 1 ? "" : "s"} summarized
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-gray-700">
                            {count.toLocaleString("en-US")}
                          </span>{" "}
                          row{count === 1 ? "" : "s"} in range
                        </>
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleExport(report)}
                      disabled={isEmpty || isExporting}
                      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      style={{
                        backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})`,
                      }}
                      title={
                        isEmpty
                          ? "No records to export in the selected range"
                          : `Export as ${exportFormat.toUpperCase()}`
                      }
                    >
                      <Download size={13} />
                      {isExporting ? "Exporting..." : "Export"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
