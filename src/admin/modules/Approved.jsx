import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Eye, RefreshCcw, Archive as ArchiveIcon, ChevronLeft, ChevronRight } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import ReviewApplications from "./Applications/ReviewApplications";
import {
  fetchApprovedApplicationsPage,
  invalidateAdminPipelineCaches,
} from "../../shared/lib/requestData";
import { getAdminRequestStatusBadgeStyle } from "../../shared/lib/adminLineStatusStyles";
import { useAuth } from "../../shared/context/AuthContext";
import { useOpenRequestFromLocation } from "../../shared/hooks/useOpenRequestFromLocation";

const PAGE_SIZE = 50;
const PAGE_SIBLING_COUNT = 1;
const SEARCH_DEBOUNCE_MS = 350;

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

export default function Approved() {
  const { roleConfig } = useAuth();
  const [applications, setApplications] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showApprovedView, setShowApprovedView] = useState(false);
  const [selectedApprovedApplication, setSelectedApprovedApplication] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loadSeqRef = useRef(0);

  const sourceTables = useMemo(
    () => roleConfig?.requestSources || [],
    [roleConfig]
  );

  const tabs = useMemo(
    () => ["All", ...sourceTables.map((source) => source.category)],
    [sourceTables]
  );

  const theme = roleConfig?.theme || {
    primary: "#008B88",
    secondary: "#06C1EC",
  };
  const primary = theme.primary || "#008B88";
  const secondary = theme.secondary || "#06C1EC";

  const activeServiceId = useMemo(() => {
    if (activeTab === "All") {
      return null;
    }
    const match = sourceTables.find((source) => source.category === activeTab);
    return match?.serviceId ? String(match.serviceId) : null;
  }, [activeTab, sourceTables]);

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
        setIsLoading(false);
        return;
      }

      const safePage = Math.max(1, Math.floor(page) || 1);
      setIsLoading(true);
      setLoadError("");

      try {
        const result = await fetchApprovedApplicationsPage({
          sources: sourceTables,
          serviceId: activeServiceId,
          search: debouncedSearch,
          page: safePage,
          pageSize: PAGE_SIZE,
        });

        if (requestSeq !== loadSeqRef.current) {
          return;
        }

        setApplications(result.applications || []);
        setTotal(result.total || 0);
        setCurrentPage(result.page || 1);
      } catch (error) {
        if (requestSeq !== loadSeqRef.current) {
          return;
        }
        setLoadError(error?.message || "Failed to load approved applications.");
        setApplications([]);
        setTotal(0);
      } finally {
        if (requestSeq === loadSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [sourceTables, activeServiceId, debouncedSearch]
  );

  // Filter/search changes recreate loadApprovedPage → always restart at page 1.
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
      setLoadError("Missing request context for approved view.");
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

  const handleReload = () => {
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

  if (showApprovedView && selectedApprovedApplication) {
    return (
      <ReviewApplications
        application={selectedApprovedApplication}
        onBack={handleBackToApproved}
        readOnly
        openFinalApprovalOnLoad
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
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-teal-300 transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <MiniNotifications />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
          <div className="flex flex-col gap-1">
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
                Approved
              </span>
              <span className="text-gray-800"> Applications</span>
            </h1>
            <p className="text-xs text-gray-500">
              {isLoading
                ? "Loading approved applications..."
                : total > 0
                  ? `Showing ${formatCount(rangeStart)}–${formatCount(rangeEnd)} of ${formatCount(total)} approved`
                  : "0 approved applications"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            style={{ boxShadow: `0 0 0 1px ${theme.primary}22 inset` }}
            disabled={isLoading}
          >
            <RefreshCcw size={13} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Reloading..." : "Reload"}
          </button>
        </div>

        <div className="flex gap-6 border-b border-gray-200 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={`pb-2 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
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

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs font-semibold border-b border-gray-200">
                <th className="pb-3 pr-4">Application ID</th>
                <th className="pb-3 pr-4">Applicant Name</th>
                <th className="pb-3 pr-4">Service Category</th>
                <th className="pb-3 pr-4">Application Date</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    Loading approved applications...
                  </td>
                </tr>
              )}

              {!isLoading && loadError && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-red-500">
                    {loadError}
                  </td>
                </tr>
              )}

              {!isLoading && !loadError && applications.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    {debouncedSearch
                      ? "No approved applications match your search."
                      : "No approved applications found."}
                  </td>
                </tr>
              )}

              {!isLoading &&
                !loadError &&
                applications.map((row, index) => (
                  <tr
                    key={row.key}
                    className={`text-xs ${
                      index % 2 === 0 ? "bg-gray-50" : "bg-white"
                    }`}
                  >
                    <td className="py-2.5 pr-4 font-semibold text-gray-700 pl-2">
                      {row.id}
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">{row.name}</td>
                    <td className="py-2.5 pr-4 text-gray-600">{row.category}</td>
                    <td className="py-2.5 pr-4 text-gray-500">{row.date}</td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2.5">
                      <button
                        type="button"
                        onClick={() => handleViewApplication(row)}
                        className="flex items-center gap-1 font-semibold hover:underline text-xs"
                        style={{ color: theme.secondary }}
                      >
                        <Eye size={13} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

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
