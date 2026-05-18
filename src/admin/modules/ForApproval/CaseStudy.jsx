import { useEffect, useMemo, useState } from "react";
import { Search, Eye, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MiniNotifications from "../../components/MiniNotifications";
import ApprovalReviewDetails from "./ApprovalReviewDetails";
import { fetchApplicationsBySources } from "../../../shared/lib/requestData";
import { mergeRequestRow, patchRowOverride } from "../../../shared/lib/forApprovalOverrides";
import { REQUEST_DB_STATUS } from "../../../shared/lib/requestDbStatus";
import { supabase } from "../../../shared/lib/supabaseClient";
import { useAuth } from "../../../shared/context/AuthContext";
import {
  buildLineAdminStatusBadgeStyles,
  lineAdminInsetHairline,
} from "../../../shared/lib/adminLineStatusStyles";

function StatusBadge({ status, stylesByStatus }) {
  const style = stylesByStatus[status] || stylesByStatus.Pending;
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={style}>
      {status}
    </span>
  );
}

/**
 * Rows handled in this module after an interview is booked:
 * - Primary: DB status `scheduled` (set from Scheduling).
 * - Legacy: display status `Case Study` from older sessionStorage overrides until they expire or reload.
 */
function isCaseStudyQueueRow(row) {
  return row.status === "Scheduled" || row.status === "Case Study";
}

export default function CaseStudy() {
  const navigate = useNavigate();
  const { roleConfig, allowedServiceIds } = useAuth();
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedKey, setSelectedKey] = useState(null);
  const [approveError, setApproveError] = useState("");
  const [isApproving, setIsApproving] = useState(false);

  const sourceTables = useMemo(() => roleConfig?.requestSources || [], [roleConfig]);

  const tabs = useMemo(() => ["All", ...sourceTables.map((source) => source.category)], [sourceTables]);

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

  const categoryDotColor = useMemo(() => {
    const palette = [
      "bg-red-400",
      "bg-[var(--apoyo-secondary)]",
      "bg-yellow-400",
      "bg-pink-400",
    ];
    const map = {};
    sourceTables.forEach((source, index) => {
      map[source.category] = palette[index % palette.length];
    });
    return map;
  }, [sourceTables]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        if (!sourceTables.length) {
          if (isMounted) setRows([]);
          return;
        }

        const merged = await fetchApplicationsBySources(sourceTables);
        if (!isMounted) return;

        const mergedLocal = merged.map(mergeRequestRow);
        const caseStudyRows = mergedLocal.filter(isCaseStudyQueueRow)
          .sort((a, b) => {
            const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
            const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
            return bTime - aTime;
          });

        setRows(caseStudyRows);
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error?.message || "Failed to load applications.");
        setRows([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, sourceTables]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filtered = rows
    .filter((app) => activeTab === "All" || app.category === activeTab)
    .filter((app) => {
      if (!normalizedSearch) return true;
      return (
        String(app.id).toLowerCase().includes(normalizedSearch) ||
        String(app.name).toLowerCase().includes(normalizedSearch) ||
        String(app.category).toLowerCase().includes(normalizedSearch) ||
        String(app.status).toLowerCase().includes(normalizedSearch)
      );
    });

  const selectedApplication = useMemo(
    () => (selectedKey ? rows.find((r) => r.key === selectedKey) : null),
    [rows, selectedKey]
  );

  const handleReload = () => {
    setReloadKey((k) => k + 1);
  };

  const handleApproveDisbursement = async () => {
    if (!selectedApplication?.serviceId || !selectedApplication?.requestId) return;

    setApproveError("");
    setIsApproving(true);

    try {
      let updateQuery = supabase
        .from("assistance_requests")
        .update({ status: REQUEST_DB_STATUS.APPROVED })
        .eq("id", selectedApplication.requestId);
      if (allowedServiceIds.length > 0) {
        updateQuery = updateQuery.in("service_id", allowedServiceIds);
      }
      const { error } = await updateQuery;

      if (error) {
        throw error;
      }

      patchRowOverride(selectedApplication.key, { status: "Approved" });
      setSelectedKey(null);
      setReloadKey((k) => k + 1);
      navigate("/admin/approved");
    } catch (err) {
      setApproveError(err?.message || "Failed to approve for disbursement.");
    } finally {
      setIsApproving(false);
    }
  };

  if (selectedApplication) {
    return (
      <ApprovalReviewDetails
        variant="disbursement"
        application={selectedApplication}
        backLabel="Back to case study"
        onBack={() => {
          setApproveError("");
          setSelectedKey(null);
        }}
        onApproveDisbursement={handleApproveDisbursement}
        approveError={approveError}
        isApproving={isApproving}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 transition-all duration-200 placeholder-gray-400"
          />
        </div>
        <MiniNotifications />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <h1
            className="text-2xl"
            style={{ fontFamily: "'Instrument Sans', sans-serif", fontWeight: 500 }}
          >
            <span className="text-gray-800">Requests for </span>
            <span
              style={{
                background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: 500,
              }}
            >
              Case Study
            </span>
          </h1>

          <button
            type="button"
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
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 shadow-sm min-w-[160px]"
            style={{ backgroundColor: "#EFF6FF" }}
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: theme.tertiary || theme.secondary }}
            />
            <div>
              <p className="text-[10px] text-gray-500 font-medium">In case study</p>
              <p className="text-lg font-bold text-gray-800">{rows.length}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-6 border-b border-gray-200 mb-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
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

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 text-xs font-semibold">
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
                <td colSpan={6} className="py-10 text-center text-gray-400">
                  Loading applications...
                </td>
              </tr>
            )}

            {!isLoading && loadError && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-red-500">
                  {loadError}
                </td>
              </tr>
            )}

            {!isLoading && !loadError && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-gray-400">
                  No requests in case study. Schedule interviews from Scheduling first.
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
                  <td className="py-2.5 pr-4 font-semibold text-gray-700 pl-2">{row.id}</td>
                  <td className="py-2.5 pr-4 text-gray-600">{row.name}</td>
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          categoryDotColor[row.category] || "bg-slate-400"
                        }`}
                      />
                      <span className="text-gray-600">{row.category}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 text-gray-500">{row.date}</td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={row.status} stylesByStatus={statusBadgeStyles} />
                  </td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedKey(row.key)}
                      className="flex items-center gap-1 font-semibold hover:underline text-xs"
                      style={{ color: theme.secondary }}
                    >
                      <Eye size={13} />
                      Review Details
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
