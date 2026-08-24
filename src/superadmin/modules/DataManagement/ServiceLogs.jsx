import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, RefreshCcw, Search, X } from "lucide-react";
import {
  TIME_PRESET_OPTIONS,
  buildDefaultCustomRange,
  fetchServiceLogDetail,
  fetchServiceLogsPage,
  formatServiceLogDate,
} from "../../../shared/lib/superAdminServiceLogsApi";
import { useSuperadminHeaderTitle } from "../../SuperadminLayout";
import AdminStatusBadge from "../../../admin/components/AdminStatusBadge";
import ReviewApplications from "../../../admin/modules/Applications/ReviewApplications";
import ApprovalReviewDetails from "../../../admin/modules/ForApproval/ApprovalReviewDetails";
import { REQUEST_STATUS_LABELS, normalizeStatus } from "../../../shared/domain/status";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
const ASSISTANCE_CHIP_LIMIT = 8;
const SERVICE_CHIP_LIMIT = 10;

const STATUS_CHIP_OPTIONS = [
  { value: "", label: "All" },
  ...Object.entries(REQUEST_STATUS_LABELS)
    .filter(([value]) => value !== "draft")
    .map(([value, label]) => ({ value, label })),
];

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function displayText(value, fallback = "—") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (value.name != null) return displayText(value.name, fallback);
    if (value.label != null) return displayText(value.label, fallback);
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return String(value);
}

function buildApplicationFromLog(log, user) {
  const requestId = log?.id;
  const serviceId = log?.serviceId || null;
  const status = normalizeStatus(log?.statusRaw || log?.status);
  return {
    key: `${serviceId || "unknown"}-${requestId}`,
    id: log?.requestCode || requestId,
    requestId,
    requestCode: log?.requestCode || requestId,
    userId: user?.id || log?.userId || null,
    name: displayText(user?.fullName || log?.applicantName, "Applicant"),
    category: displayText(log?.serviceName, "Request"),
    date: formatServiceLogDate(log?.submittedAt || log?.createdAt),
    submittedAt: log?.submittedAt || null,
    createdAt: log?.createdAt || null,
    updatedAt: log?.updatedAt || null,
    status,
    serviceId,
    caseStudyDate: log?.caseStudyDate ?? null,
  };
}

function shouldUseApprovalReviewDetails(status) {
  const label = normalizeStatus(status);
  return label === "For Approval" || label === "Scheduled" || label === "Case Study";
}

function approvalReviewVariantForStatus(status) {
  const label = normalizeStatus(status);
  if (label === "Scheduled" || label === "Case Study") return "disbursement";
  return "schedule";
}

function FacetChip({ active, label, count, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title || label}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-ocean-600 text-white shadow-sm"
          : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
      }`}
    >
      <span className="truncate">{label}</span>
      {count != null ? (
        <span className={active ? "opacity-80" : "text-ocean-500"}>{formatCount(count)}</span>
      ) : null}
    </button>
  );
}

function RemovableChip({ label, onRemove }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-ocean-200 bg-ocean-50 px-2.5 py-1 text-[11px] font-semibold text-ocean-800">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-ocean-600 transition hover:bg-ocean-100 hover:text-ocean-900"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ServiceLogsListView() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [rangeLabel, setRangeLabel] = useState("All Time");
  const [facets, setFacets] = useState({ statuses: {}, assistance: [], services: [] });
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssistance, setFilterAssistance] = useState(null);
  const [filterService, setFilterService] = useState(null);
  const [timePreset, setTimePreset] = useState("all_time");
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");
  const [showAllAssistance, setShowAllAssistance] = useState(false);
  const [showAllServices, setShowAllServices] = useState(false);

  const canFetch = timePreset !== "custom" || Boolean(customRangeApplied);
  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));

  useSuperadminHeaderTitle("Data Management · Service Logs");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setCurrentPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadPage = useCallback(
    async (page = 1, { withFacets = true } = {}) => {
      if (!canFetch) {
        setLogs([]);
        setTotal(0);
        setIsLoading(false);
        setRangeLabel("");
        return;
      }

      setIsLoading(true);
      setLoadError("");
      try {
        const result = await fetchServiceLogsPage({
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch,
          status: filterStatus,
          assistanceName: filterAssistance?.assistanceName || "",
          categoryId: filterAssistance?.categoryId || "",
          serviceName: filterService?.serviceName || "",
          serviceId: filterService?.serviceId || "",
          preset: timePreset,
          from: customRangeApplied?.from ?? null,
          to: customRangeApplied?.to ?? null,
          includeFacets: withFacets,
        });
        setLogs(result.logs || []);
        setTotal(result.total || 0);
        setCurrentPage(result.page || 1);
        setRangeLabel(result.range?.label || "");
        if (result.facets) {
          setFacets(result.facets);
        }
      } catch (error) {
        setLoadError(error?.message || "Failed to load service logs.");
        setLogs([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [
      canFetch,
      debouncedSearch,
      filterStatus,
      filterAssistance,
      filterService,
      timePreset,
      customRangeApplied,
    ]
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const statusAllCount = useMemo(
    () => Object.values(facets.statuses || {}).reduce((sum, count) => sum + Number(count || 0), 0),
    [facets.statuses]
  );

  const assistanceChips = useMemo(() => {
    const items = Array.isArray(facets.assistance) ? facets.assistance : [];
    if (!filterAssistance) return items;
    const selectedKey = filterAssistance.key;
    if (items.some((item) => item.key === selectedKey)) return items;
    return [filterAssistance, ...items];
  }, [facets.assistance, filterAssistance]);

  const serviceChips = useMemo(() => {
    const items = Array.isArray(facets.services) ? facets.services : [];
    if (!filterService) return items;
    const selectedKey = filterService.key;
    if (items.some((item) => item.key === selectedKey)) return items;
    return [filterService, ...items];
  }, [facets.services, filterService]);

  const visibleAssistance = showAllAssistance
    ? assistanceChips
    : assistanceChips.slice(0, ASSISTANCE_CHIP_LIMIT);
  const visibleServices = showAllServices
    ? serviceChips
    : serviceChips.slice(0, SERVICE_CHIP_LIMIT);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (debouncedSearch) {
      chips.push({
        id: "search",
        label: `Search: ${debouncedSearch}`,
        onRemove: () => {
          setSearchInput("");
          setDebouncedSearch("");
        },
      });
    }
    if (filterStatus) {
      chips.push({
        id: "status",
        label: `Status: ${REQUEST_STATUS_LABELS[filterStatus] || filterStatus}`,
        onRemove: () => setFilterStatus(""),
      });
    }
    if (filterAssistance) {
      chips.push({
        id: "assistance",
        label: `Assistance: ${filterAssistance.label}`,
        onRemove: () => {
          setFilterAssistance(null);
          setFilterService(null);
        },
      });
    }
    if (filterService) {
      chips.push({
        id: "service",
        label: `Service: ${filterService.label}`,
        onRemove: () => setFilterService(null),
      });
    }
    if (timePreset !== "all_time") {
      const presetLabel =
        TIME_PRESET_OPTIONS.find((option) => option.value === timePreset)?.label || rangeLabel;
      chips.push({
        id: "time",
        label: `Date: ${rangeLabel || presetLabel}`,
        onRemove: () => {
          setTimePreset("all_time");
          setCustomRangeApplied(null);
          setCustomRangeError("");
        },
      });
    }
    return chips;
  }, [
    debouncedSearch,
    filterStatus,
    filterAssistance,
    filterService,
    timePreset,
    rangeLabel,
  ]);

  const handlePresetChange = (nextPreset) => {
    setTimePreset(nextPreset);
    setCustomRangeError("");
    setCurrentPage(1);
    if (nextPreset !== "custom") {
      setCustomRangeApplied(null);
    } else {
      setLogs([]);
      setTotal(0);
      setRangeLabel("");
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
    setTimePreset("custom");
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setFilterStatus("");
    setFilterAssistance(null);
    setFilterService(null);
    setTimePreset("all_time");
    setCustomRangeApplied(null);
    setCustomRangeError("");
    setShowAllAssistance(false);
    setShowAllServices(false);
    setCurrentPage(1);
  };

  const handlePageChange = (nextPage) => {
    const page = Math.min(totalPages, Math.max(1, nextPage));
    if (page === currentPage) return;
    void loadPage(page, { withFacets: false });
  };

  const handleAssistanceSelect = (item) => {
    setCurrentPage(1);
    setShowAllServices(false);
    if (!item) {
      setFilterAssistance(null);
      return;
    }
    const isSame = filterAssistance?.key === item.key;
    setFilterAssistance(isSame ? null : item);
    if (!isSame) setFilterService(null);
  };

  const handleServiceSelect = (item) => {
    setCurrentPage(1);
    if (!item) {
      setFilterService(null);
      return;
    }
    setFilterService(filterService?.key === item.key ? null : item);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-ocean-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-700">
              Service Logs
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-ocean-950">
              Assistance request history
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-ocean-700">
              Centralized, read-only log of every service request. Assistance and service names
              stay as they were when the request was filed, even if the catalog later changes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-sm font-semibold text-ocean-700">
              {isLoading ? "…" : `${formatCount(total)} records`}
            </span>
            <button
              type="button"
              onClick={() => void loadPage(currentPage)}
              disabled={isLoading || !canFetch}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {loadError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {loadError}
          </p>
        ) : null}

        <div className="mt-4 space-y-3 rounded-xl border border-ocean-200 bg-ocean-50/50 p-3">
          <div className="relative max-w-xl">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ocean-700" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Request ID, applicant name, or email…"
              className="h-9 w-full rounded-lg border border-ocean-200 bg-white pl-8 pr-2 text-xs font-semibold text-ocean-800 outline-none placeholder:text-ocean-500"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Date
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TIME_PRESET_OPTIONS.map((option) => (
                <FacetChip
                  key={option.value}
                  active={timePreset === option.value}
                  label={option.label}
                  onClick={() => handlePresetChange(option.value)}
                />
              ))}
            </div>
            {rangeLabel ? (
              <p className="text-[11px] font-medium text-ocean-700">
                Viewing: {rangeLabel}
                {timePreset !== "all_time"
                  ? " · filters by the date the request was opened"
                  : ""}
              </p>
            ) : null}
            {timePreset === "custom" ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[11px] text-ocean-700">
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
                    className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none"
                  />
                </label>
                <label className="text-[11px] text-ocean-700">
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
                    className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyCustomRange}
                  className="rounded-lg bg-ocean-600 px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Apply Range
                </button>
              </div>
            ) : null}
            {customRangeError ? (
              <p className="text-xs text-rose-600">{customRangeError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Status
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_CHIP_OPTIONS.map((option) => {
                const count =
                  option.value === ""
                    ? statusAllCount
                    : facets.statuses?.[option.label] ?? 0;
                return (
                  <FacetChip
                    key={option.value || "all-status"}
                    active={filterStatus === option.value}
                    label={option.label}
                    count={count}
                    onClick={() => {
                      setCurrentPage(1);
                      setFilterStatus((previous) =>
                        previous === option.value ? "" : option.value
                      );
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Assistance
            </p>
            <div className="flex flex-wrap gap-1.5">
              <FacetChip
                active={!filterAssistance}
                label="All"
                count={assistanceChips.reduce((sum, item) => sum + Number(item.count || 0), 0)}
                onClick={() => handleAssistanceSelect(null)}
              />
              {visibleAssistance.map((item) => (
                <FacetChip
                  key={item.key}
                  active={filterAssistance?.key === item.key}
                  label={item.label}
                  count={item.count}
                  onClick={() => handleAssistanceSelect(item)}
                />
              ))}
              {assistanceChips.length > ASSISTANCE_CHIP_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setShowAllAssistance((previous) => !previous)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-ocean-700 underline-offset-2 hover:underline"
                >
                  {showAllAssistance
                    ? "Show less"
                    : `+${assistanceChips.length - ASSISTANCE_CHIP_LIMIT} more`}
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
              Service
            </p>
            <div className="flex flex-wrap gap-1.5">
              <FacetChip
                active={!filterService}
                label="All"
                count={serviceChips.reduce((sum, item) => sum + Number(item.count || 0), 0)}
                onClick={() => handleServiceSelect(null)}
              />
              {visibleServices.map((item) => (
                <FacetChip
                  key={item.key}
                  active={filterService?.key === item.key}
                  label={item.label}
                  count={item.count}
                  title={item.assistanceName ? `${item.label} · ${item.assistanceName}` : item.label}
                  onClick={() => handleServiceSelect(item)}
                />
              ))}
              {serviceChips.length > SERVICE_CHIP_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setShowAllServices((previous) => !previous)}
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-ocean-700 underline-offset-2 hover:underline"
                >
                  {showAllServices
                    ? "Show less"
                    : `+${serviceChips.length - SERVICE_CHIP_LIMIT} more`}
                </button>
              ) : null}
            </div>
          </div>

          {activeFilters.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-ocean-200 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ocean-700">
                Active
              </span>
              {activeFilters.map((chip) => (
                <RemovableChip key={chip.id} label={chip.label} onRemove={chip.onRemove} />
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 text-[11px] font-semibold text-ocean-700 underline-offset-2 hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ocean-200">
          <table className="min-w-full divide-y divide-ocean-200">
            <thead className="bg-ocean-50/80">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Request ID
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Applicant
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Assistance
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Service
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Submitted
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Case study
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-ocean-900">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ocean-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-ocean-700">
                    Loading service logs…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-ocean-700">
                    No service requests match the current filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-ocean-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ocean-900">
                      {displayText(log.requestCode)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {log.userId ? (
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/superadmin/data-management/users/${log.userId}`)
                          }
                          className="text-left font-semibold text-ocean-800 underline-offset-2 hover:underline"
                        >
                          {displayText(log.applicantName)}
                        </button>
                      ) : (
                        displayText(log.applicantName)
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(log.assistanceName)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {displayText(log.serviceName)}
                    </td>
                    <td className="px-4 py-3">
                      <AdminStatusBadge status={log.statusRaw || log.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {formatServiceLogDate(log.submittedAt || log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-ocean-700">
                      {formatServiceLogDate(log.caseStudyDate)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/superadmin/data-management/service-logs/${log.id}`)
                        }
                        disabled={!log.id || !log.serviceId}
                        className="inline-flex items-center rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && total > 0 ? (
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-ocean-700">
              Page {formatCount(currentPage)} of {formatCount(totalPages)}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoading}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ocean-200 bg-white text-ocean-700 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ServiceLogDetailView({ requestId }) {
  const navigate = useNavigate();
  const [loadState, setLoadState] = useState({
    requestId,
    status: "loading",
    detail: null,
    error: "",
  });

  const isLoading = loadState.requestId !== requestId || loadState.status === "loading";
  const loadError = loadState.requestId === requestId ? loadState.error : "";
  const detail = loadState.requestId === requestId ? loadState.detail : null;
  const log = detail?.log || null;
  const user = detail?.user || null;

  const headerTitle = log
    ? `Data Management · Service Logs · ${displayText(log.requestCode, "Request")}`
    : "Data Management · Service Logs";
  useSuperadminHeaderTitle(headerTitle);

  const goBack = useCallback(() => {
    navigate("/superadmin/data-management/service-logs");
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    fetchServiceLogDetail(requestId)
      .then((result) => {
        if (cancelled) return;
        const isDraft =
          normalizeStatus(result?.log?.statusRaw || result?.log?.status) === "Draft";
        setLoadState({
          requestId,
          status: isDraft ? "error" : "ok",
          detail: isDraft ? null : result,
          error: isDraft ? "Service log not found." : "",
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadState({
          requestId,
          status: "error",
          detail: null,
          error: error?.message || "Failed to load service log.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-ocean-200 bg-white p-6 text-sm text-ocean-700">
        Loading request…
      </div>
    );
  }

  if (loadError || !log) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-white p-6">
        <p className="text-sm font-semibold text-rose-700">
          {loadError || "Service log not found."}
        </p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 inline-flex items-center rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700"
        >
          Back to service logs
        </button>
      </div>
    );
  }

  const application = buildApplicationFromLog(log, user);
  const status = application.status;

  if (!application.serviceId) {
    return (
      <div className="rounded-2xl border border-ocean-200 bg-white p-6">
        <p className="text-sm text-ocean-700">
          This request cannot be opened because it has no linked service.
        </p>
        <button
          type="button"
          onClick={goBack}
          className="mt-4 inline-flex items-center rounded-lg border border-ocean-200 bg-white px-3 py-1.5 text-xs font-semibold text-ocean-700"
        >
          Back to service logs
        </button>
      </div>
    );
  }

  if (shouldUseApprovalReviewDetails(status)) {
    return (
      <ApprovalReviewDetails
        application={application}
        variant={approvalReviewVariantForStatus(status)}
        readOnly
        backLabel="Back to service logs"
        onBack={goBack}
      />
    );
  }

  return (
    <ReviewApplications
      application={application}
      onBack={goBack}
      readOnly
      openFinalApprovalOnLoad={status === "Approved"}
    />
  );
}

export function ServiceLogs() {
  const { requestId } = useParams();
  if (requestId) {
    return <ServiceLogDetailView requestId={requestId} />;
  }
  return <ServiceLogsListView />;
}

export default ServiceLogs;
