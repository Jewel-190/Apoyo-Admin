import { useEffect, useMemo, useState } from "react";
import { Search, Eye, RefreshCcw, Archive as ArchiveIcon } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import ReviewApplications from "./Applications/ReviewApplications";
import { mergeRequestRow } from "../../shared/lib/forApprovalOverrides";
import { fetchApplicationsBySources } from "../../shared/lib/requestData";
import { useAuth } from "../../shared/context/AuthContext";

function StatusBadge({ status }) {
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 w-fit"
      style={{ backgroundColor: "#DCFCE7", color: "#15803D" }}
    >
      <ArchiveIcon size={12} />
      {status}
    </span>
  );
}

export default function Approved() {
  const { roleConfig } = useAuth();
  const [applications, setApplications] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [showApprovedView, setShowApprovedView] = useState(false);
  const [selectedApprovedApplication, setSelectedApprovedApplication] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

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

        const merged = await fetchApplicationsBySources(sourceTables);

        if (!isMounted) {
          return;
        }

        const mergedLocal = merged.map(mergeRequestRow);
        const approvedRows = mergedLocal
          .filter((row) => row.status === "Approved")
          .sort((a, b) => {
            const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          });

        setApplications(approvedRows);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setLoadError(error?.message || "Failed to load approved applications.");
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

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filtered = applications
    .filter((app) => activeTab === "All" || app.category === activeTab)
    .filter((app) => {
      if (!normalizedSearch) {
        return true;
      }

      return (
        app.id.toLowerCase().includes(normalizedSearch) ||
        app.name.toLowerCase().includes(normalizedSearch) ||
        app.category.toLowerCase().includes(normalizedSearch) ||
        app.status.toLowerCase().includes(normalizedSearch)
      );
    });

  const handleViewApplication = (application) => {
    if (!application?.serviceId || !application?.requestId) {
      setLoadError("Missing request context for approved view.");
      return;
    }

    setLoadError("");
    setSelectedApprovedApplication(application);
    setShowApprovedView(true);
  };

  const handleBackToApproved = () => {
    setShowApprovedView(false);
    setSelectedApprovedApplication(null);
    setReloadKey((previous) => previous + 1);
  };

  const handleReload = () => {
    setReloadKey((previous) => previous + 1);
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
    <div className="min-h-screen">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative w-full max-w-lg">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={17}
          />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 focus:ring-teal-300 transition-all duration-200 placeholder-gray-400"
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
              Approved
            </span>
            <span className="text-gray-800"> Applications</span>
          </h1>

          <button
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
              onClick={() => setActiveTab(tab)}
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
                <th className="pb-3 pr-4">Name</th>
                <th className="pb-3 pr-4">Category</th>
                <th className="pb-3 pr-4">Date</th>
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

              {!isLoading && !loadError && filtered.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-400">
                    No approved applications found.
                  </td>
                </tr>
              )}

              {!isLoading &&
                !loadError &&
                filtered.map((row, index) => (
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
      </div>
    </div>
  );
}
