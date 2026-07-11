import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, RefreshCcw, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import ReviewApplications from "./Applications/ReviewApplications";
import { useAuth } from "../../shared/context/AuthContext";
import { getAdminActivityLogBorderColor } from "../../shared/lib/adminLineStatusStyles";
import { supabase } from "../../shared/lib/supabaseClient";
import {
  buildDisplayName,
  formatDate,
  invalidateAdminPipelineCaches,
  normalizeStatus,
} from "../../shared/lib/requestData";

const PAGE_SIZE = 50;
const PAGE_SIBLING_COUNT = 1;

/** Compact page list that stays usable with thousands of pages: 1 … 4 5 6 … 1200 */
function buildPageItems(currentPage, totalPages, siblingCount = PAGE_SIBLING_COUNT) {
  if (totalPages <= 0) {
    return [];
  }
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const left = Math.max(2, currentPage - siblingCount);
  const right = Math.min(totalPages - 1, currentPage + siblingCount);
  const items = [1];

  if (left > 2) {
    items.push("ellipsis-left");
  }

  for (let page = left; page <= right; page += 1) {
    items.push(page);
  }

  if (right < totalPages - 1) {
    items.push("ellipsis-right");
  }

  items.push(totalPages);
  return items;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

const TIME_PRESET_OPTIONS = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

function formatUtcDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function buildDefaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(to.getUTCDate() - 29);
  return {
    from: formatUtcDateInput(from),
    to: formatUtcDateInput(to),
  };
}

function toValidDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLogDate(dateValue) {
  const date = toValidDate(dateValue);
  if (!date) {
    return "—";
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLogTime(dateValue) {
  const date = toValidDate(dateValue);
  if (!date) {
    return "—";
  }
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function matchesSearch(log, searchTerm) {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    log.applicant_name,
    log.service_category,
    log.request_code,
    log.action_label,
    log.admin_email,
    log.new_status,
    log.old_status,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(query);
}

function buildApplicationRecord({ row, sourceMeta, userName }) {
  const submittedAt = row.submitted_at || null;
  const createdAt = row.created_at || null;

  return {
    key: `${sourceMeta?.serviceId || row.service_id || "unknown"}-${row.id}`,
    id: row.request_code || row.id,
    requestId: row.id,
    requestCode: row.request_code || row.id,
    userId: row.user_id || null,
    name: userName,
    category: sourceMeta?.category || "Request",
    date: formatDate(submittedAt || createdAt),
    submittedAt,
    createdAt,
    status: normalizeStatus(row.status),
    serviceId: row.service_id || sourceMeta?.serviceId || null,
  };
}

async function fetchAdminActivityLogs({
  offset = 0,
  limit = PAGE_SIZE,
  preset = "day",
  from = null,
  to = null,
} = {}) {
  const body = { offset, limit, preset };
  if (preset === "custom") {
    body.from = from;
    body.to = to;
  }

  const { data, error } = await supabase.functions.invoke("admin-activity-logs", {
    body,
  });

  if (error) {
    throw new Error(error.message || "Unable to load activity logs.");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Unable to load activity logs.");
  }

  return data;
}

async function fetchApplicationForActivityLog(requestId, allowedServiceIds) {
  if (!requestId) {
    throw new Error("Missing request id.");
  }

  let reqQuery = supabase
    .from("assistance_requests")
    .select("id, request_code, user_id, created_at, submitted_at, status, service_id")
    .eq("id", requestId);

  if (allowedServiceIds.length > 0) {
    reqQuery = reqQuery.in("service_id", allowedServiceIds);
  }

  const { data: requestRow, error: reqErr } = await reqQuery.maybeSingle();

  if (reqErr) {
    throw reqErr;
  }

  if (!requestRow) {
    throw new Error("Request record was not found or is outside your line.");
  }

  const { data: svcRow } = await supabase
    .from("assistance_services")
    .select("id, display_name")
    .eq("id", requestRow.service_id)
    .maybeSingle();

  const sourceMeta = {
    serviceId: requestRow.service_id,
    category: svcRow?.display_name || "Request",
  };

  let applicantName = "Unknown Applicant";
  if (requestRow.user_id) {
    const { data: userRow } = await supabase
      .from("users")
      .select("first_name, middle_name, last_name, suffix")
      .eq("id", requestRow.user_id)
      .maybeSingle();

    applicantName = buildDisplayName(userRow);
  }

  return buildApplicationRecord({
    row: requestRow,
    sourceMeta,
    userName: applicantName,
  });
}

const TABLE_COLUMNS = [
  { key: "datetime", label: "Date & Time", span: "md:col-span-2" },
  { key: "service", label: "Service", span: "md:col-span-2" },
  { key: "applicant", label: "Applicant Name", span: "md:col-span-2" },
  { key: "processed", label: "Processed by", span: "md:col-span-2" },
  { key: "applicantId", label: "Applicant ID", span: "md:col-span-2" },
  { key: "action", label: "Action", span: "md:col-span-2 md:text-right" },
];

export default function ActivityLogs() {
  const { theme, user, roleConfig, allowedServiceIds } = useAuth();
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [timePreset, setTimePreset] = useState("day");
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");
  const [activeRangeLabel, setActiveRangeLabel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    offset: 0,
    total: 0,
    has_more: false,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [openingRequestId, setOpeningRequestId] = useState(null);

  const primary = theme?.primary ?? "#0D9488";
  const secondary = theme?.secondary ?? "#14B8A6";
  const cacheScopeKey = `${user?.id || "anon"}:${roleConfig?.catalogCategoryId || "all"}`;

  const canFetchLogs =
    Boolean(user?.id) && (timePreset !== "custom" || Boolean(customRangeApplied));

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / PAGE_SIZE));
  const pageItems = useMemo(
    () => buildPageItems(currentPage, pagination.total > 0 ? totalPages : 0),
    [currentPage, pagination.total, totalPages]
  );

  const rangeStart =
    pagination.total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, pagination.total || 0);

  const loadLogs = useCallback(
    async (page = 1) => {
      if (!user?.id) {
        setLogs([]);
        setCurrentPage(1);
        setPagination({ offset: 0, total: 0, has_more: false });
        setIsLoading(false);
        return;
      }

      if (timePreset === "custom" && !customRangeApplied) {
        setLogs([]);
        setCurrentPage(1);
        setPagination({ offset: 0, total: 0, has_more: false });
        setIsLoading(false);
        return;
      }

      const safePage = Math.max(1, Math.floor(page) || 1);
      const offset = (safePage - 1) * PAGE_SIZE;

      setIsLoading(true);
      setLoadError("");

      try {
        let requestPage = safePage;
        let requestOffset = offset;
        let data = await fetchAdminActivityLogs({
          offset: requestOffset,
          limit: PAGE_SIZE,
          preset: timePreset,
          from: customRangeApplied?.from ?? null,
          to: customRangeApplied?.to ?? null,
        });

        const total = data.pagination?.total ?? 0;
        const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);

        // Filters/reload can shrink the set; snap to the last valid page.
        if (total > 0 && requestPage > maxPage) {
          requestPage = maxPage;
          requestOffset = (requestPage - 1) * PAGE_SIZE;
          data = await fetchAdminActivityLogs({
            offset: requestOffset,
            limit: PAGE_SIZE,
            preset: timePreset,
            from: customRangeApplied?.from ?? null,
            to: customRangeApplied?.to ?? null,
          });
        }

        setLogs(data.logs || []);
        setCurrentPage(total === 0 ? 1 : requestPage);
        setPagination({
          offset: data.pagination?.offset ?? requestOffset,
          total: data.pagination?.total ?? total,
          has_more: Boolean(data.pagination?.has_more),
        });
        setActiveRangeLabel(data.range?.label || "");
      } catch (error) {
        setLoadError(error?.message || "Unable to load activity logs.");
        setLogs([]);
        setPagination({ offset: 0, total: 0, has_more: false });
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id, timePreset, customRangeApplied]
  );

  useEffect(() => {
    if (!canFetchLogs) {
      setIsLoading(false);
      return;
    }
    void loadLogs(1);
  }, [loadLogs, reloadKey, cacheScopeKey, canFetchLogs]);

  const filteredLogs = useMemo(
    () => logs.filter((log) => matchesSearch(log, searchTerm)),
    [logs, searchTerm]
  );

  const handlePresetChange = (nextPreset) => {
    setTimePreset(nextPreset);
    setCustomRangeError("");
    setCurrentPage(1);
    if (nextPreset !== "custom") {
      setCustomRangeApplied(null);
    } else {
      setActiveRangeLabel("");
      setLogs([]);
      setPagination({ offset: 0, total: 0, has_more: false });
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
    setCurrentPage(1);
    setCustomRangeApplied({ from, to });
    setTimePreset("custom");
  };

  const handleReload = () => {
    void loadLogs(currentPage);
  };

  const handlePageChange = (page) => {
    if (isLoading || page < 1 || page > totalPages || page === currentPage) {
      return;
    }
    void loadLogs(page);
  };

  const handleViewRequest = async (log) => {
    if (!log?.request_id || openingRequestId) {
      return;
    }

    setOpeningRequestId(log.request_id);
    setLoadError("");

    try {
      const application = await fetchApplicationForActivityLog(
        log.request_id,
        allowedServiceIds
      );
      setSelectedApplication(application);
      setShowReview(true);
    } catch (error) {
      setLoadError(error?.message || "Unable to open request.");
    } finally {
      setOpeningRequestId(null);
    }
  };

  const handleBackFromReview = () => {
    setShowReview(false);
    setSelectedApplication(null);
    invalidateAdminPipelineCaches();
    setReloadKey((previous) => previous + 1);
  };

  if (showReview && selectedApplication) {
    return (
      <ReviewApplications
        onBack={handleBackFromReview}
        application={selectedApplication}
      />
    );
  }

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
            placeholder="Search this page: applicant, service, ID, action, or admin"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-teal-300 transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleReload}
            disabled={isLoading || !canFetchLogs}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw size={14} className={isLoading ? "animate-spin" : ""} />
            Reload
          </button>
          <MiniNotifications />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h1
              className="text-2xl"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: 500,
                color: theme?.primary || "#1F2937",
              }}
            >
              Activity Logs
            </h1>
            <p className="text-xs text-gray-500">
              {isLoading
                ? "Loading request movements..."
                : canFetchLogs
                  ? pagination.total > 0
                    ? `Showing ${formatCount(rangeStart)}–${formatCount(rangeEnd)} of ${formatCount(pagination.total)} movements`
                    : "0 movements in range"
                  : "Select a custom date range to load logs"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESET_OPTIONS.map((option) => {
                const isActive = timePreset === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handlePresetChange(option.value)}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      isActive
                        ? "text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    style={
                      isActive
                        ? {
                            backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})`,
                          }
                        : undefined
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            {activeRangeLabel ? (
              <p className="text-[11px] font-medium text-gray-500">
                Viewing: {activeRangeLabel}
              </p>
            ) : null}

            {timePreset === "custom" ? (
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
                  disabled={isLoading}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${primary}, ${secondary})`,
                  }}
                >
                  Apply Range
                </button>
              </div>
            ) : null}

            {customRangeError ? (
              <p className="text-xs text-red-600">{customRangeError}</p>
            ) : null}
          </div>
        </div>

        {loadError ? (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`activity-log-skeleton-${index}`}
                className="h-10 rounded-lg bg-gray-100 animate-pulse"
              />
            ))}
          </div>
        ) : !canFetchLogs ? (
          <p className="text-sm text-gray-500">
            Choose a start and end date, then click Apply Range to load activity logs.
          </p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-sm text-gray-500">
            {searchTerm
              ? "No activity logs match your search."
              : "No request movements recorded for the selected time range."}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="hidden md:grid md:grid-cols-12 gap-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 border-b border-gray-100">
              {TABLE_COLUMNS.map((column) => (
                <div key={column.key} className={column.span}>
                  {column.label}
                </div>
              ))}
            </div>

            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border-y border-r border-gray-100 border-l-[3px] bg-white hover:bg-gray-50/80 transition-colors duration-150"
                style={{
                  borderLeftColor: getAdminActivityLogBorderColor(
                    log.action_label,
                    log.new_status
                  ),
                }}
              >
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 items-start md:items-center min-w-0">
                  <div className="md:col-span-2 min-w-0">
                    <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                      Date & Time
                    </p>
                    <p className="text-sm text-gray-700">{formatLogDate(log.changed_at)}</p>
                    <p className="text-xs text-gray-400">{formatLogTime(log.changed_at)}</p>
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                      Service
                    </p>
                    <p className="text-sm text-gray-600 truncate" title={log.service_category}>
                      {log.service_category}
                    </p>
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                      Applicant Name
                    </p>
                    <p className="text-sm font-medium text-gray-800 truncate" title={log.applicant_name}>
                      {log.applicant_name}
                    </p>
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                      Processed by
                    </p>
                    <p className="text-sm font-mono text-gray-600 truncate" title={log.admin_email || "Applicant"}>
                      {log.admin_email || "Applicant"}
                    </p>
                  </div>

                  <div className="md:col-span-2 min-w-0">
                    <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                      Applicant ID
                    </p>
                    <p className="text-sm font-mono text-gray-700 truncate">
                      {log.request_code || log.request_id}
                    </p>
                  </div>

                  <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-1.5 min-w-0">
                    <div className="md:text-right min-w-0">
                      <p className="md:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                        Action
                      </p>
                      <span className="text-sm text-gray-600 font-medium truncate block">
                        {log.action_label}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleViewRequest(log)}
                      disabled={openingRequestId === log.request_id}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-white hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                      title="View request"
                      aria-label={`View request ${log.request_code || log.request_id}`}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && canFetchLogs && pagination.total > 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-gray-500">
              Page {formatCount(currentPage)} of {formatCount(totalPages)}
              {searchTerm.trim() ? " · search filters this page only" : ""}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={isLoading || currentPage <= 1}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>

              {pageItems.map((item) => {
                if (typeof item === "string") {
                  return (
                    <span
                      key={item}
                      className="inline-flex h-8 min-w-8 items-center justify-center px-1 text-sm text-gray-400"
                      aria-hidden="true"
                    >
                      …
                    </span>
                  );
                }

                const isActive = item === currentPage;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => handlePageChange(item)}
                    disabled={isLoading}
                    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      isActive
                        ? "text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    style={
                      isActive
                        ? {
                            background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                          }
                        : undefined
                    }
                    aria-label={`Page ${item}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {formatCount(item)}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={isLoading || currentPage >= totalPages}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
