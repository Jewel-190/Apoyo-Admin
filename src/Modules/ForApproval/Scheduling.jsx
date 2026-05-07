import { useEffect, useMemo, useState } from "react";
import { Search, Eye, RefreshCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MiniNotifications from "../../components/MiniNotifications";
import ApprovalReviewDetails from "./ApprovalReviewDetails";
import { fetchApplicationsBySources } from "../../lib/requestData";
import { localDateAndTimeToIso, todayYmdLocal } from "../../lib/schedulingDateTime";
import { supabase } from "../../lib/supabaseClient";
import { mergeRequestRow, patchRowOverride } from "../../lib/forApprovalOverrides";
import { REQUEST_DB_STATUS } from "../../lib/requestDbStatus";
import { useAuth } from "../../context/AuthContext";

const statusBadgeStyles = {
  Draft: { backgroundColor: "#E5E7EB", color: "#374151" },
  Pending: { backgroundColor: "#F3E8FF", color: "#C084FC" },
  "In Progress": { backgroundColor: "#E0F7FA", color: "#06C1EC" },
  "Action Required": { backgroundColor: "#FEF3C7", color: "#D97706" },
  Resubmitted: { backgroundColor: "#FEF9C3", color: "#CA8A04" },
  "For Approval": { backgroundColor: "#CCFBF1", color: "#0F766E" },
  Scheduled: { backgroundColor: "#E0F2FE", color: "#0369A1" },
  "Case Study": { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  Approved: { backgroundColor: "#DCFCE7", color: "#15803D" },
};

function StatusBadge({ status }) {
  const style = statusBadgeStyles[status] || statusBadgeStyles.Pending;
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={style}>
      {status}
    </span>
  );
}

export default function Scheduling() {
  const navigate = useNavigate();
  const { roleConfig } = useAuth();
  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedKey, setSelectedKey] = useState(null);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const sourceTables = useMemo(() => roleConfig?.requestSources || [], [roleConfig]);

  const tabs = useMemo(() => ["All", ...sourceTables.map((source) => source.category)], [sourceTables]);

  const theme = roleConfig?.theme || {
    primary: "#008B88",
    secondary: "#06C1EC",
    tertiary: "#33BFB8",
  };

  const categoryDotColor = useMemo(() => {
    const palette = ["bg-red-400", "bg-teal-400", "bg-yellow-400", "bg-pink-400"];
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
        const schedulingPool = mergedLocal.filter((row) => row.status === "For Approval");

        setRows(schedulingPool);
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

  const handleConfirmSchedule = async ({ dateYmd, timeHm }) => {
    if (!selectedApplication?.sourceTable || !selectedApplication?.requestId) return;

    const iso = localDateAndTimeToIso(dateYmd, timeHm);
    if (!iso) return;

    if (String(dateYmd).trim() < todayYmdLocal()) {
      setScheduleError("Interview date cannot be in the past.");
      return;
    }

    setScheduleError("");
    setIsScheduling(true);

    try {
      // Invariant: saving an interview time sets both case_study_date and status scheduled (Case Study queue lists these).
      const { error } = await supabase
        .from(selectedApplication.sourceTable)
        .update({ case_study_date: iso, status: REQUEST_DB_STATUS.SCHEDULED })
        .eq("id", selectedApplication.requestId);

      if (error) {
        throw error;
      }

      patchRowOverride(selectedApplication.key, {
        status: "Scheduled",
        interviewDate: dateYmd,
        caseStudyInterviewEnd: iso,
        caseStudyDate: iso,
      });

      setSelectedKey(null);
      setInterviewDate("");
      setInterviewTime("");
      setReloadKey((k) => k + 1);
      navigate("/case-study");
    } catch (err) {
      setScheduleError(err?.message || "Failed to save interview schedule.");
    } finally {
      setIsScheduling(false);
    }
  };

  if (selectedApplication) {
    return (
      <ApprovalReviewDetails
        application={selectedApplication}
        interviewDate={interviewDate}
        onInterviewDateChange={(value) => {
          setScheduleError("");
          setInterviewDate(value);
        }}
        interviewTime={interviewTime}
        onInterviewTimeChange={setInterviewTime}
        scheduleError={scheduleError}
        isScheduling={isScheduling}
        onBack={() => {
          setSelectedKey(null);
          setInterviewDate("");
          setInterviewTime("");
          setScheduleError("");
        }}
        onConfirmSchedule={handleConfirmSchedule}
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
            <span
              style={{
                background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                fontFamily: "'Instrument Sans', sans-serif",
                fontWeight: 500,
              }}
            >
              Scheduling
            </span>
            <span className="text-gray-800"> for Request&apos;s Case Study</span>
          </h1>

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

        <div className="flex gap-3 mb-5 flex-wrap">
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 shadow-sm min-w-[160px]"
            style={{ backgroundColor: "#ECFEFF" }}
          >
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: theme.tertiary || theme.secondary }}
            />
            <div>
              <p className="text-[10px] text-gray-500 font-medium">Ready to schedule</p>
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
                  No requests ready for case study scheduling.
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
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="py-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKey(row.key);
                        setInterviewDate("");
                      }}
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
