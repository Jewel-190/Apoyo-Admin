import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, RefreshCcw, Archive as ArchiveIcon, ChevronLeft, ChevronRight } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import ApplicationsListTable from "../components/ApplicationsListTable";
import ReviewApplications from "./Applications/ReviewApplications";
import {
  fetchArchiveApplicationsPage,
  invalidateAdminPipelineCaches,
} from "../../shared/lib/requestData";
import { getAdminRequestStatusBadgeStyle, lineAdminInsetHairline } from "../../shared/lib/adminLineStatusStyles";
import { useAuth } from "../../shared/context/AuthContext";
import { collectApplicationQuerySources } from "../../shared/lib/lineServiceScope";
import { DEFAULT_ADMIN_THEME } from "../../shared/config/roleConfig";
import { useOpenRequestFromLocation } from "../../shared/hooks/useOpenRequestFromLocation";
import {
  TIME_PRESET_OPTIONS,
  buildDefaultCustomRange,
  resolveTimeRangePreset,
} from "../../shared/lib/timeRangePresets";

const PAGE_SIZE = 50;
const PAGE_SIBLING_COUNT = 1;
const SEARCH_DEBOUNCE_MS = 350;
const DEFAULT_TIME_PRESET = "all_time";
const ARCHIVE_STATUS_FILTERS = [
  { value: "all", label: "All", statuses: ["approved", "declined"] },
  { value: "approved", label: "Approved", statuses: ["approved"] },
  { value: "declined", label: "Declined", statuses: ["declined"] },
];

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

function StatusBadge({ status }) {
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit"
      style={getAdminRequestStatusBadgeStyle(status)}
    >
      <ArchiveIcon size={12} />
      {status}
    </span>
  );
}

export default function Archive() {
  const { roleConfig } = useAuth();
  const [applications, setApplications] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [timePreset, setTimePreset] = useState(DEFAULT_TIME_PRESET);
  const [customRangeDraft, setCustomRangeDraft] = useState(buildDefaultCustomRange);
  const [customRangeApplied, setCustomRangeApplied] = useState(null);
  const [customRangeError, setCustomRangeError] = useState("");
  const [activeRangeLabel, setActiveRangeLabel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showApprovedView, setShowApprovedView] = useState(false);
  const [selectedApprovedApplication, setSelectedApprovedApplication] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSeqRef = useRef(0);

  const sourceTables = useMemo(
    () => collectApplicationQuerySources(roleConfig),
    [roleConfig]
  );

  const tabs = useMemo(
    () => ["All", ...sourceTables.map((source) => source.category)],
    [sourceTables]
  );

  const theme = roleConfig?.theme || DEFAULT_ADMIN_THEME;
  const primary = theme.primary || DEFAULT_ADMIN_THEME.primary;
  const secondary = theme.secondary || DEFAULT_ADMIN_THEME.secondary;

  const activeServiceId = useMemo(() => {
    if (activeTab === "All") {
      return null;
    }
    const match = sourceTables.find((source) => source.category === activeTab);
    return match?.serviceId ? String(match.serviceId) : null;
  }, [activeTab, sourceTables]);

  const canFetchArchive =
    timePreset !== "custom" || Boolean(customRangeApplied);
  const selectedStatusFilter =
    ARCHIVE_STATUS_FILTERS.find((option) => option.value === statusFilter) ||
    ARCHIVE_STATUS_FILTERS[0];

  const resolvedTimeRange = useMemo(() => {
    if (!canFetchArchive) {
      return null;
    }
    try {
      return resolveTimeRangePreset(
        timePreset,
        customRangeApplied?.from ?? null,
        customRangeApplied?.to ?? null
      );
    } catch {
      return null;
    }
  }, [canFetchArchive, timePreset, customRangeApplied]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadApprovedPage = useCallback(
    async (page = 1) => {
      const requestSeq = ++loadSeqRef.current;

      if (!sourceTables.length) {
        if (requestSeq !== loadSeqRef.current) {
          return;
        }
        setApplications([]);
        setTotal(0);
        setCurrentPage(1);
        setActiveRangeLabel("");
        setIsLoading(false);
        return;
      }

      if (!resolvedTimeRange) {
        if (requestSeq !== loadSeqRef.current) {
          return;
        }
        setApplications([]);
        setTotal(0);
        setCurrentPage(1);
        setActiveRangeLabel("");
        setIsLoading(false);
        return;
      }

      const safePage = Math.max(1, Math.floor(page) || 1);
      setIsLoading(true);
      setLoadError("");

      try {
        const result = await fetchArchiveApplicationsPage({
          sources: sourceTables,
          serviceId: activeServiceId,
          search: debouncedSearch,
          page: safePage,
          pageSize: PAGE_SIZE,
          timeRange: resolvedTimeRange,
          statuses: selectedStatusFilter.statuses,
        });

        if (requestSeq !== loadSeqRef.current) {
          return;
        }

        setApplications(result.applications || []);
        setTotal(result.total || 0);
        setCurrentPage(result.page || 1);
        setActiveRangeLabel(result.range?.label || resolvedTimeRange.label || "");
      } catch (error) {
        if (requestSeq !== loadSeqRef.current) {
          return;
        }
        setLoadError(error?.message || "Failed to load archived applications.");
        setApplications([]);
        setTotal(0);
        setActiveRangeLabel("");
      } finally {
        if (requestSeq === loadSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [sourceTables, activeServiceId, debouncedSearch, resolvedTimeRange, selectedStatusFilter]
  );

  // Filter/search/range changes recreate loadApprovedPage → always restart at page 1.
  useEffect(() => {
    void loadApprovedPage(1);
  }, [loadApprovedPage, reloadKey]);

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const pageItems = useMemo(
    () => buildPageItems(currentPage, total > 0 ? totalPages : 0),
    [currentPage, total, totalPages]
  );
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total || 0);

  const handleViewApplication = (application) => {
    if (!application?.serviceId || !application?.requestId) {
      setLoadError("Missing request context for archive view.");
      return;
    }

    setLoadError("");
    setSelectedApprovedApplication(application);
    setShowApprovedView(true);
  };

  useOpenRequestFromLocation({
    applications,
    isLoading,
    onOpen: handleViewApplication,
  });

  const handleBackToApproved = () => {
    setShowApprovedView(false);
    setSelectedApprovedApplication(null);
    invalidateAdminPipelineCaches();
    setReloadKey((previous) => previous + 1);
  };

  const handlePresetChange = (nextPreset) => {
    setTimePreset(nextPreset);
    setCustomRangeError("");
    setCurrentPage(1);
    if (nextPreset !== "custom") {
      setCustomRangeApplied(null);
    } else {
      setActiveRangeLabel("");
      setApplications([]);
      setTotal(0);
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

    try {
      resolveTimeRangePreset("custom", from, to);
    } catch (error) {
      setCustomRangeError(error?.message || "Invalid custom date range.");
      return;
    }

    setCustomRangeError("");
    setCurrentPage(1);
    setCustomRangeApplied({ from, to });
    setTimePreset("custom");
  };

  const handleReload = () => {
    if (!canFetchArchive) {
      return;
    }
    invalidateAdminPipelineCaches();
    void loadApprovedPage(currentPage);
  };

  const handlePageChange = (page) => {
    if (isLoading || page < 1 || page > totalPages || page === currentPage) {
      return;
    }
    void loadApprovedPage(page);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  if (showApprovedView && selectedApprovedApplication) {
    const isApproved = selectedApprovedApplication.status === "Approved";
    return (
      <ReviewApplications
        application={selectedApprovedApplication}
        onBack={handleBackToApproved}
        readOnly
        openFinalApprovalOnLoad={isApproved}
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
            placeholder="Search name, application ID, or date"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-[color:var(--apoyo-ring)] transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <MiniNotifications />
      </div>

      <div className="min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="mb-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1
                className="text-2xl"
                style={{
                  fontFamily: "'Instrument Sans', sans-serif",
                  fontWeight: 500,
                }}
              >
                <span className="text-gray-800">All </span>
                <span
                  style={{
                    background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Archive
                </span>
                <span className="text-gray-800"> Applications</span>
              </h1>
              <p className="text-xs text-gray-500">
                {isLoading
                  ? "Loading archived applications..."
                  : canFetchArchive
                    ? total > 0
                      ? `Showing ${formatCount(rangeStart)}–${formatCount(rangeEnd)} of ${formatCount(total)} archived`
                      : "0 archived applications in range"
                    : "Select a custom date range to load archived applications"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleReload}
              className="inline-flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              style={{ boxShadow: lineAdminInsetHairline(theme.primary) }}
              disabled={isLoading || !canFetchArchive}
            >
              <RefreshCcw size={13} className={isLoading ? "animate-spin" : ""} />
              {isLoading ? "Reloading..." : "Reload"}
            </button>
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

            <div className="flex flex-wrap gap-1.5 pt-1">
              {ARCHIVE_STATUS_FILTERS.map((option) => {
                const isActive = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleStatusFilterChange(option.value)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                      isActive
                        ? "text-white shadow-sm"
                        : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    style={
                      isActive
                        ? {
                            backgroundColor:
                              option.value === "declined"
                                ? "#F8D0D0"
                                : option.value === "approved"
                                  ? "#C8F1C8"
                                  : primary,
                            color:
                              option.value === "declined"
                                ? "#7A2E2E"
                                : option.value === "approved"
                                  ? "#2B2B2B"
                                  : "#FFFFFF",
                          }
                        : undefined
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-6 overflow-x-auto border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={`-mb-px shrink-0 pb-2 text-sm font-medium transition-all duration-200 border-b-2 ${
                activeTab === tab
                  ? "text-gray-800"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
              style={{ borderColor: activeTab === tab ? theme.primary : "transparent" }}
            >
              {tab}
            </button>
          ))}
        </div>

        <ApplicationsListTable
          rows={applications}
          isLoading={isLoading}
          loadError={loadError}
          emptyMessage={
            !canFetchArchive
              ? "Select a custom date range to load archived applications."
              : debouncedSearch
                ? "No archived applications match your search in this range."
                : "No archived applications found in this range."
          }
          loadingMessage="Loading archived applications..."
          actionLabel="View"
          actionColor={theme.secondary}
          onAction={handleViewApplication}
          renderStatus={(status) => <StatusBadge status={status} />}
        />

        {!isLoading && total > 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-xs text-gray-500">
              Page {formatCount(currentPage)} of {formatCount(totalPages)}
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
