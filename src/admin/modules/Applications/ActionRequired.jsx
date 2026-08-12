import { useEffect, useMemo, useState } from "react";
import { Search, AlertCircle, RefreshCcw } from "lucide-react";
import MiniNotifications from "../../components/MiniNotifications";
import ApplicationsListTable from "../../components/ApplicationsListTable";
import ReviewApplications from "./ReviewApplications";
import { fetchApplicationsBySources, invalidateAdminPipelineCaches } from "../../../shared/lib/requestData";
import {
  matchesPipelineApplicationSearch,
  PIPELINE_SEARCH_PLACEHOLDER,
} from "../../../shared/lib/pipelineSearch";
import {
  getAdminRequestStatusBadgeStyle,
  getAdminRequestStatusChartColor,
  lineAdminInsetHairline,
} from "../../../shared/lib/adminLineStatusStyles";
import { useAuth } from "../../../shared/context/AuthContext";
import { useOpenRequestFromLocation } from "../../../shared/hooks/useOpenRequestFromLocation";

function StatusBadge({ status }) {
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit"
      style={getAdminRequestStatusBadgeStyle(status)}
    >
      <AlertCircle size={12} />
      {status}
    </span>
  );
}

export default function ActionRequired() {
  const { roleConfig } = useAuth();
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [showReview, setShowReview] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const sourceTables = useMemo(
    () => roleConfig?.requestSources || [],
    [roleConfig]
  );

  const tabs = useMemo(
    () => ["All", ...sourceTables.map((source) => source.category)],
    [sourceTables]
  );

  const theme = roleConfig?.theme ?? {
    primary: "var(--apoyo-primary)",
    secondary: "var(--apoyo-secondary)",
    tertiary: "var(--apoyo-tertiary)",
    ring: "var(--apoyo-ring)",
  };

  useEffect(() => {
    let isMounted = true;

    const loadApplications = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const merged = await fetchApplicationsBySources(sourceTables, {
          forceRefresh: reloadKey > 0,
        });

        if (!isMounted) {
          return;
        }

        setApplications(
          merged.filter((row) => row.status === "Action Required")
        );
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

  const filtered = applications
    .filter((app) => activeTab === "All" || app.category === activeTab)
    .filter((app) => matchesPipelineApplicationSearch(app, searchTerm));

  const handleReviewClick = (application) => {
    setSelectedApplication(application);
    setShowReview(true);
  };

  useOpenRequestFromLocation({
    applications,
    isLoading,
    onOpen: handleReviewClick,
  });

  const handleReload = () => {
    invalidateAdminPipelineCaches();
    setReloadKey((previous) => previous + 1);
  };

  const handleBackToActionRequired = () => {
    setShowReview(false);
    setSelectedApplication(null);
    setSearchTerm("");
    setActiveTab("All");
    invalidateAdminPipelineCaches();
    setReloadKey((previous) => previous + 1);
  };

  if (showReview && selectedApplication) {
    return (
      <ReviewApplications
        onBack={handleBackToActionRequired}
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

      <div className="min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-6">
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
              Action Required
            </span>
            <span className="text-gray-800"> Requests</span>
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
            className="flex items-center px-4 py-2.5 rounded-xl shadow-sm min-w-[160px]"
            style={{
              backgroundColor: getAdminRequestStatusChartColor("Action Required"),
              color: getAdminRequestStatusBadgeStyle("Action Required").color,
            }}
          >
            <div>
              <p className="text-[10px] font-semibold opacity-85">Total Action Required</p>
              <p className="text-lg font-bold leading-none mt-0.5">{applications.length}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-6 border-b border-gray-200 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="pb-2 text-sm font-medium transition-all duration-200 border-b-2 -mb-px"
              style={{
                borderColor: activeTab === tab ? theme.primary : "transparent",
                color: activeTab === tab ? "#1F2937" : "#9CA3AF",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <ApplicationsListTable
          rows={filtered}
          isLoading={isLoading}
          loadError={loadError}
          emptyMessage="No action-required requests found."
          actionLabel="Review Application"
          actionColor={theme.secondary}
          onAction={handleReviewClick}
          renderStatus={(status) => <StatusBadge status={status} />}
        />
      </div>
    </div>
  );
}
