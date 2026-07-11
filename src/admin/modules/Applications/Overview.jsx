import { useEffect, useMemo, useState } from "react";
import { Search, Eye, RefreshCcw } from "lucide-react";
import MiniNotifications from "../../components/MiniNotifications";
import ReviewApplications from "./ReviewApplications";
import { supabase } from "../../../shared/lib/supabaseClient";
import { fetchApplicationsBySources, invalidateAdminPipelineCaches } from "../../../shared/lib/requestData";
import {
  matchesPipelineApplicationSearch,
  PIPELINE_SEARCH_PLACEHOLDER,
} from "../../../shared/lib/pipelineSearch";
import AdminStatusBadge from "../../components/AdminStatusBadge";
import {
  buildLineAdminStatusBadgeStyles,
  getAdminStatusFilterChipStyle,
  lineAdminInsetHairline,
} from "../../../shared/lib/adminLineStatusStyles";
import { useAuth } from "../../../shared/context/AuthContext";
import { formatAssistanceLineTitle } from "../../../shared/lib/assistanceCategoryDisplay";
import { canAutoTransitionToInProgress } from "../../../shared/domain/status";
import { useOpenRequestFromLocation } from "../../../shared/hooks/useOpenRequestFromLocation";

export default function Overview() {
  const { roleConfig, allowedServiceIds } = useAuth();
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [reloadKey, setReloadKey] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);

  const sourceTables = useMemo(
    () => roleConfig?.requestSources || [],
    [roleConfig]
  );

  const tabs = useMemo(
    () => ["All", ...sourceTables.map((source) => source.category)],
    [sourceTables]
  );

  const categoryTitle = useMemo(() => {
    const titleByCategory = {
      All: roleConfig?.title
        ? formatAssistanceLineTitle(roleConfig.title.replace(/ Admin$/i, ""))
        : "Medical Assistance",
    };

    for (const source of sourceTables) {
      titleByCategory[source.category] = source.category;
    }

    return titleByCategory;
  }, [roleConfig, sourceTables]);

  const theme = roleConfig?.theme ?? {
    primary: "var(--apoyo-primary)",
    secondary: "var(--apoyo-secondary)",
    tertiary: "var(--apoyo-tertiary)",
    ring: "var(--apoyo-ring)",
  };
  const statusBadgeStyles = useMemo(
    () => buildLineAdminStatusBadgeStyles(roleConfig?.theme),
    [roleConfig?.theme]
  );

  useEffect(() => {
    let isMounted = true;

    const loadApplications = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        if (!sourceTables.length) {
          setApplications([]);
          return;
        }

        const merged = await fetchApplicationsBySources(sourceTables, {
          forceRefresh: reloadKey > 0,
        });

        if (!isMounted) {
          return;
        }

        const filteredRows = merged
          .filter(
            (row) =>
              row.status !== "Draft" &&
              row.status !== "Action Required" &&
              row.status !== "Resubmitted" &&
              row.status !== "For Approval" &&
              row.status !== "Scheduled" &&
              row.status !== "Approved"
          )
          .sort((a, b) => {
            const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          });

        setApplications(filteredRows);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError(error?.message || "Failed to load applications.");
        setApplications([]);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadApplications();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, sourceTables]);

  const scopedApplications = applications.filter((app) => {
    const matchesCategory = activeTab === "All" || app.category === activeTab;
    return matchesCategory && matchesPipelineApplicationSearch(app, searchTerm);
  });

  const filtered = scopedApplications.filter((app) => {
    const matchesStatus = statusFilter === "All" || app.status === statusFilter;
    return matchesStatus;
  });

  const total = scopedApplications.length;
  const pending = scopedApplications.filter((a) => a.status === "Pending").length;
  const inProgress = scopedApplications.filter((a) => a.status === "In Progress").length;

  const buildSummaryChipStyle = (statusLabel, isActive) => {
    const solid = getAdminStatusFilterChipStyle(statusLabel, true);
    return {
      backgroundColor: solid.backgroundColor,
      color: solid.color,
      boxShadow: isActive
        ? `0 0 0 2px color-mix(in srgb, ${solid.backgroundColor} 55%, transparent)`
        : undefined,
      opacity: isActive ? 1 : 0.92,
    };
  };

  const handleReload = () => {
    invalidateAdminPipelineCaches();
    setReloadKey((previous) => previous + 1);
  };

  const handleReviewClick = async (application) => {
    if (!application?.requestId || !application?.serviceId) {
      setSelectedApplication(application);
      setShowReview(true);
      return;
    }

    if (!canAutoTransitionToInProgress(application.status)) {
      setSelectedApplication(application);
      setShowReview(true);
      return;
    }

    const inProgressApplication = { ...application, status: "In Progress" };

    setApplications((previous) =>
      previous.map((row) =>
        row.key === application.key ? inProgressApplication : row
      )
    );

    setSelectedApplication(inProgressApplication);
    setShowReview(true);

    let updateQuery = supabase
      .from("assistance_requests")
      .update({ status: "in progress" })
      .eq("id", application.requestId);
    if (allowedServiceIds.length > 0) {
      updateQuery = updateQuery.in("service_id", allowedServiceIds);
    }
    const { error } = await updateQuery;

    if (error) {
      setLoadError(
        error.message || "Failed to update application status to In Progress."
      );
      setApplications((previous) =>
        previous.map((row) => (row.key === application.key ? application : row))
      );
      setSelectedApplication((previous) =>
        previous?.key === application.key ? application : previous
      );
    } else {
      invalidateAdminPipelineCaches();
    }
  };

  useOpenRequestFromLocation({
    applications,
    isLoading,
    onOpen: handleReviewClick,
  });

  const handleBackToOverview = () => {
    setShowReview(false);
    setSelectedApplication(null);
    setSearchTerm("");
    setActiveTab("All");
    setStatusFilter("All");
    invalidateAdminPipelineCaches();
    setReloadKey((previous) => previous + 1);
  };

  if (showReview && selectedApplication) {
    return (
      <ReviewApplications
        onBack={handleBackToOverview}
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
            placeholder={PIPELINE_SEARCH_PLACEHOLDER}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <MiniNotifications />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
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
              {categoryTitle[activeTab]}
            </span>
            <span className="text-gray-800"> Applications</span>
          </h1>

          <button
            onClick={handleReload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            style={{ boxShadow: lineAdminInsetHairline(theme.primary) }}
            disabled={isLoading}
          >
            <RefreshCcw size={13} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Reloading..." : "Reload"}
          </button>
        </div>

        <div className="flex gap-3 mb-5 flex-wrap">
          <div
            onClick={() => setStatusFilter("All")}
            className="flex items-center px-4 py-2.5 rounded-xl shadow-sm min-w-[120px] cursor-pointer transition-all duration-200 hover:shadow-md"
            style={buildSummaryChipStyle("All", statusFilter === "All")}
          >
            <div>
              <p className="text-[10px] font-semibold opacity-85">
                Total Application
              </p>
              <p className="text-lg font-bold leading-none mt-0.5">{total}</p>
            </div>
          </div>
          <div
            onClick={() => setStatusFilter("Pending")}
            className="flex items-center px-4 py-2.5 rounded-xl shadow-sm min-w-[120px] cursor-pointer transition-all duration-200 hover:shadow-md"
            style={buildSummaryChipStyle("Pending", statusFilter === "Pending")}
          >
            <div>
              <p className="text-[10px] font-semibold opacity-85">
                Total Pending
              </p>
              <p className="text-lg font-bold leading-none mt-0.5">{pending}</p>
            </div>
          </div>
          <div
            onClick={() => setStatusFilter("In Progress")}
            className="flex items-center px-4 py-2.5 rounded-xl shadow-sm min-w-[120px] cursor-pointer transition-all duration-200 hover:shadow-md"
            style={buildSummaryChipStyle("In Progress", statusFilter === "In Progress")}
          >
            <div>
              <p className="text-[10px] font-semibold opacity-85">
                Total In Progress
              </p>
              <p className="text-lg font-bold leading-none mt-0.5">{inProgress}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-6 border-b border-gray-200 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
                activeTab === tab
                  ? "text-gray-800"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
              style={{
                borderColor: activeTab === tab ? theme.primary : "transparent",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 text-xs font-semibold">
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
                <td colSpan="6" className="py-10 text-center text-gray-400">
                  Loading applications...
                </td>
              </tr>
            )}

            {!isLoading && loadError && (
              <tr>
                <td colSpan="6" className="py-10 text-center text-red-500">
                  {loadError}
                </td>
              </tr>
            )}

            {!isLoading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan="6" className="py-10 text-center text-gray-400">
                  No applications found.
                </td>
              </tr>
            )}

            {!isLoading &&
              !loadError &&
              filtered.map((row, index) => (
                <tr
                  key={row.key}
                  className={`text-xs ${index % 2 === 0 ? "bg-gray-50" : "bg-white"}`}
                >
                  <td className="py-2.5 pr-4 font-semibold text-gray-700 pl-2">
                    {row.id}
                  </td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.name}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.category}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{row.date}</td>
                  <td className="py-2.5 pr-4">
                    <AdminStatusBadge status={row.status} stylesByStatus={statusBadgeStyles} />
                  </td>
                  <td className="py-2.5">
                    <button
                      onClick={() => handleReviewClick(row)}
                      className="flex items-center gap-1 font-semibold hover:underline text-xs"
                      style={{ color: theme.secondary }}
                    >
                      <Eye size={13} />
                      Review Application
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
