import { useEffect, useMemo, useState } from "react";
import { Search, AlertTriangle, BarChart2, PieChart, Layers } from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import ReviewApplications from "./Applications/ReviewApplications";
import { supabase } from "../../shared/lib/supabaseClient";
import {
  fetchApplicationsBySources,
  formatRelativeWithTime,
} from "../../shared/lib/requestData";
import { useAuth } from "../../shared/context/AuthContext";
const FOLLOW_UP_STYLES = {
  Pending: { dotColor: "bg-red-500", badgeBg: "#F3E8FF", badgeText: "#9333EA" },
  Resubmitted: { dotColor: "bg-orange-400", badgeBg: "#FEF9C3", badgeText: "#CA8A04" },
};

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeSlice(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function PieSliceLabel({ slice }) {
  if (!(slice.pct > 0)) {
    return null;
  }
  const mid = polarToCartesian(50, 50, 30, (slice.start + slice.end) / 2);
  return (
    <text
      x={mid.x}
      y={mid.y}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="white"
      fontSize="6"
      fontWeight="bold"
    >
      {slice.pct}%
    </text>
  );
}

function DistributionPie({ slices }) {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {slices.map((slice, i) => {
        const startPoint = polarToCartesian(50, 50, 50, slice.start);
        return (
          <g key={i}>
            <path d={describeSlice(50, 50, 50, slice.start, slice.end)} fill={slice.color} />
            <line
              x1="50"
              y1="50"
              x2={startPoint.x}
              y2={startPoint.y}
              stroke="white"
              strokeWidth="1.2"
            />
            <PieSliceLabel slice={slice} />
          </g>
        );
      })}
    </svg>
  );
}

function DistributionLegendItem({ item, index, pieSlices, palette }) {
  const dotColor = pieSlices[index]?.color || palette[index % palette.length];
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} />
      <p className="text-xs font-medium text-gray-700">{item.label}</p>
      <p className="text-xs text-gray-400 ml-2">({item.value})</p>
    </div>
  );
}

function DashboardStatCard({ card, primary, secondary }) {
  const style = card.highlight
    ? {
        background: `linear-gradient(to right, ${primary}, ${secondary})`,
        padding: "16px",
      }
    : {
        background: "white",
        border: "1px solid #e5e7eb",
        borderTop: "none",
        padding: "16px",
        paddingTop: "24px",
      };

  const topBarStyle = {
    height: "8px",
    background: `linear-gradient(to right, ${primary}, ${secondary})`,
  };

  return (
    <div
      className="rounded-2xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer overflow-hidden relative"
      style={style}
    >
      {!card.highlight && (
        <div className="absolute top-0 left-0 right-0 rounded-t-2xl" style={topBarStyle} />
      )}
      <div className="flex items-start gap-2 mb-2 mt-1">
        {card.showIcon ? (
          <span className="flex shrink-0">
            <Layers
              size={36}
              strokeWidth={1.35}
              className="shrink-0 opacity-90"
              style={{ color: primary }}
              aria-hidden
            />
          </span>
        ) : null}
        <p
          className="text-xs font-medium leading-tight"
          style={{ color: card.highlight ? "rgba(255,255,255,0.9)" : "#6B7280" }}
        >
          {card.title}
        </p>
      </div>
      <p className="text-3xl md:text-4xl font-bold mt-1" style={{ color: card.highlight ? "white" : "#1F2937" }}>
        {card.value}
      </p>
      <div
        className="flex items-center gap-1.5 mt-3 text-xs font-semibold"
        style={{ color: card.highlight ? "rgba(255,255,255,0.85)" : secondary }}
      >
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
          <rect
            x="0"
            y="7"
            width="4"
            height="7"
            rx="1"
            fill={card.highlight ? "rgba(255,255,255,0.7)" : "#33BFB8"}
          />
          <rect
            x="6"
            y="4"
            width="4"
            height="10"
            rx="1"
            fill={card.highlight ? "rgba(255,255,255,0.85)" : secondary}
          />
          <rect
            x="12"
            y="0"
            width="4"
            height="14"
            rx="1"
            fill={card.highlight ? "white" : primary}
          />
        </svg>
        <span>Increased from last week</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { roleConfig, theme, adminRole } = useAuth();

  const sourceTables = useMemo(() => roleConfig?.requestSources || [], [roleConfig]);

  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [statusRange, setStatusRange] = useState("today");
  const [distributionRange, setDistributionRange] = useState("today");
  const [followUps, setFollowUps] = useState([]);
  const [loadingFollowUps, setLoadingFollowUps] = useState(true);
  const [followUpsError, setFollowUpsError] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [followUpReloadKey, setFollowUpReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchAnalytics = async () => {
      setLoadingAnalytics(true);
      setAnalyticsError("");
      try {
        const { data, error } = await supabase.functions.invoke("admin-dashboard-analytics");
        if (error) throw error;
        const payload = typeof data === "string" ? JSON.parse(data) : data;
        if (!mounted) return;
        if (!payload || !payload.success) throw new Error(payload?.error || "Failed to fetch analytics");
        setAnalytics(payload);
      } catch (err) {
        setAnalyticsError(err?.message || "Unable to load analytics");
        setAnalytics(null);
      } finally {
        if (mounted) setLoadingAnalytics(false);
      }
    };
    void fetchAnalytics();
    return () => {
      mounted = false;
    };
  }, [adminRole, sourceTables]);

  const primary = theme?.primary ?? "var(--apoyo-primary)";
  const secondary = theme?.secondary ?? "var(--apoyo-secondary)";
  const tertiary = theme?.tertiary ?? "var(--apoyo-tertiary)";

  const roleKey = adminRole || Object.keys((analytics && analytics.roles) || {})[0] || null;
  const roleMetrics = analytics?.roles?.[roleKey] || analytics?.overall || null;

  const statsCards = useMemo(() => {
    const totalToday = roleMetrics?.totals?.today ?? analytics?.overall?.totals?.today ?? 0;
    const sourceCardsData = sourceTables.slice(0, 3).map((source) => {
      const tableStats =
        roleMetrics?.tables?.[source.serviceId] ??
        analytics?.counts_by_table?.[source.serviceId] ??
        {};
      return {
        title: `Total Applications of ${source.category} Today`,
        value: tableStats?.today ?? 0,
        highlight: false,
        showIcon: true,
      };
    });
    return [
      { title: "Total Applications Today", value: totalToday, highlight: true, showIcon: false },
      ...sourceCardsData,
    ];
  }, [roleMetrics, analytics, sourceTables]);

  const barData = useMemo(() => {
    const statusesAll = roleMetrics?.statuses || analytics?.overall?.statuses || {};
    const statusesToday =
      roleMetrics?.statuses_today || analytics?.overall?.statuses_today || statusesAll;
    const statuses = statusRange === "today" ? statusesToday : statusesAll;
    return [
      { label: "Pending", value: statuses?.Pending ?? 0, color: primary },
      { label: "In Progress", value: statuses?.["In Progress"] ?? 0, color: "#60A5FA" },
      { label: "Action Required", value: statuses?.["Action Required"] ?? 0, color: "#7DD8F0" },
      { label: "For Approval", value: statuses?.["For Approval"] ?? 0, color: theme?.ring || primary },
      { label: "Scheduled", value: statuses?.Scheduled ?? 0, color: "#0EA5E9" },
      { label: "Approved", value: statuses?.Approved ?? 0, color: secondary },
    ];
  }, [roleMetrics, analytics, statusRange, primary, secondary, tertiary, theme?.ring]);

  const tableDistribution = useMemo(() => {
    const tables = roleMetrics?.tables || analytics?.counts_by_table || {};
    const sources = sourceTables.length
      ? sourceTables
      : Object.keys(tables).map((serviceId) => ({ serviceId, category: serviceId }));
    const items = sources
      .map((src) => {
        const stats =
          roleMetrics?.tables?.[src.serviceId] ??
          analytics?.counts_by_table?.[src.serviceId] ??
          {};
        const value = distributionRange === "today" ? stats.today || 0 : stats.total || 0;
        return { serviceId: src.serviceId, label: src.category, value };
      })
      .filter((i) => i.value > 0);
    const total = items.reduce((s, i) => s + i.value, 0);
    const palette = [secondary, tertiary, primary, "#F97316", "#A78BFA", "#F472B6"];
    return { items, total, palette };
  }, [roleMetrics, analytics, sourceTables, distributionRange, primary, secondary, tertiary]);

  const pieSlices = useMemo(() => {
    const items = tableDistribution.items || [];
    const total = tableDistribution.total || 0;
    if (!total || items.length === 0) return [];
    let cumulativeFloat = 0;
    return items.map((it, idx) => {
      const pctFloat = (it.value / total) * 100;
      const start = cumulativeFloat * 3.6;
      cumulativeFloat += pctFloat;
      const end = cumulativeFloat * 3.6;
      return { ...it, pct: Math.round(pctFloat), start, end, color: tableDistribution.palette[idx % tableDistribution.palette.length] };
    });
  }, [tableDistribution]);

  const barMax = useMemo(() => Math.max(...barData.map((b) => b.value), 1), [barData]);

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  useEffect(() => {
    let mounted = true;

    const loadFollowUps = async () => {
      setLoadingFollowUps(true);
      setFollowUpsError("");

      try {
        if (!sourceTables.length) {
          setFollowUps([]);
          return;
        }

        const merged = await fetchApplicationsBySources(sourceTables);

        if (!mounted) return;

        const filtered = merged
          .filter((app) => app.status === "Pending" || app.status === "Resubmitted")
          .map((app) => ({
            ...app,
            changeAt: app.updatedAt || app.submittedAt || app.createdAt || null,
          }))
          .sort((a, b) => {
            const aTime = new Date(a.changeAt || 0).getTime();
            const bTime = new Date(b.changeAt || 0).getTime();
            return aTime - bTime;
          })
          .slice(0, 8);

        setFollowUps(filtered);
      } catch (error) {
        if (!mounted) return;
        setFollowUpsError(error?.message || "Failed to load follow-ups.");
        setFollowUps([]);
      } finally {
        if (mounted) setLoadingFollowUps(false);
      }
    };

    void loadFollowUps();

    return () => {
      mounted = false;
    };
  }, [sourceTables, followUpReloadKey]);

  const handleReviewClick = (application) => {
    setSelectedApplication(application);
    setShowReview(true);
  };

  const handleBackToDashboard = () => {
    setShowReview(false);
    setSelectedApplication(null);
    setFollowUpReloadKey((previous) => previous + 1);
  };

  if (showReview && selectedApplication) {
    return (
      <ReviewApplications
        onBack={handleBackToDashboard}
        application={selectedApplication}
      />
    );
  }

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
          <input type="text" placeholder="Search" className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 transition-all duration-200 placeholder-gray-400" style={{ outlineColor: primary }} />
        </div>
        <MiniNotifications />
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row items-start justify-between mb-6 gap-2">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold mb-1"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                background: `linear-gradient(to right, ${primary}, ${secondary})`,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                WebkitTextFillColor: "transparent",
              }}
            >
              {roleConfig?.title ? `${roleConfig.title} Dashboard` : "Dashboard"}
            </h1>
            <p className="text-gray-400 text-xs md:text-sm">{roleConfig?.dashboardSubtitle || "Welcome to the Medical Assistance Command Center."}</p>
          </div>
          <p className="text-xs md:text-sm font-medium shrink-0" style={{ color: secondary }}>{dateStr} | {timeStr}</p>
        </div>

        {analyticsError && <div className="mb-4 p-3 rounded bg-red-50 border border-red-100 text-red-700">{analyticsError}</div>}

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {loadingAnalytics ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`skeleton-${i}`} className="rounded-2xl bg-white border border-gray-100 p-4 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-10 bg-gray-200 rounded w-1/2 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-1/4" />
              </div>
            ))
          ) : (
            statsCards.map((card, i) => (
              <DashboardStatCard key={i} card={card} primary={primary} secondary={secondary} />
            ))
          )}
        </div>

        {/* Bottom 3 Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-gray-700">Follow-ups</h3>
            </div>
            <div className="flex flex-col gap-3">
              {loadingFollowUps ? (
                <p className="text-xs text-gray-400">Loading follow-ups...</p>
              ) : followUpsError ? (
                <p className="text-xs text-red-500">{followUpsError}</p>
              ) : followUps.length === 0 ? (
                <p className="text-xs text-gray-400">No follow-ups right now.</p>
              ) : (
                followUps.map((item) => {
                  const style = FOLLOW_UP_STYLES[item.status] || FOLLOW_UP_STYLES.Pending;
                  const timeLabel = formatRelativeWithTime(item.changeAt);

                  return (
                    <div key={item.key} className="flex items-center gap-2 flex-wrap">
                      <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${style.dotColor}`} />
                      <span className="text-xs font-semibold text-gray-700 w-28 shrink-0">{item.id}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: style.badgeBg, color: style.badgeText }}>
                        {item.status} · {timeLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReviewClick(item)}
                        className="text-[10px] ml-auto hover:underline transition-colors duration-200 opacity-80 hover:opacity-100"
                        style={{ color: secondary }}
                      >
                        Review Now
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2"><BarChart2 size={16} style={{ color: primary }} /><h3 className="text-sm font-semibold text-gray-700">Status Application Breakdown</h3></div>
              <select
                value={statusRange}
                onChange={(e) => setStatusRange(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
                style={{ accentColor: primary }}
              >
                <option value="today">Today</option>
                <option value="total">All time</option>
              </select>
            </div>
            <p className="text-[10px] text-gray-400 mb-2 ml-1">Number of Applications</p>
            <div className="flex items-end gap-3 h-44 px-1">
              {loadingAnalytics ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={`bar-skel-${i}`} className="flex-1 h-full flex items-end"><div className="w-full bg-gray-200 rounded-t-xl" style={{ height: `${20 + i * 10}%` }} /></div>
                ))
              ) : (
                barData.map((bar, i) => (
                  <div key={i} className="flex flex-col items-center flex-1 h-full justify-end group">
                    <div className="w-full rounded-t-3xl rounded-b-xl flex items-start justify-center transition-all duration-300 group-hover:opacity-90 relative pt-2" style={{ height: `${Math.max(6, (bar.value / barMax) * 100)}%`, backgroundColor: bar.color, minHeight: "32px" }}>
                      <span className="text-[11px] font-bold text-white">{bar.value}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 mt-1.5 text-center leading-tight">{bar.label}</span>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-between mt-1 px-1"><span className="text-[9px] text-gray-300">0</span><span className="text-[9px] text-gray-300">5</span><span className="text-[9px] text-gray-300">10</span><span className="text-[9px] text-gray-300">15</span><span className="text-[9px] text-gray-300">20</span></div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart size={16} style={{ color: primary }} />
                <h3 className="text-sm font-semibold text-gray-700">Application Distribution</h3>
              </div>
              <select
                value={distributionRange}
                onChange={(e) => setDistributionRange(e.target.value)}
                className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
                style={{ accentColor: primary }}
              >
                <option value="today">Today</option>
                <option value="total">All time</option>
              </select>
            </div>
            <div className="flex items-center gap-4">
              {loadingAnalytics ? (
                <div className="flex items-center gap-6"><div className="w-44 h-44 bg-gray-100 rounded-full animate-pulse" /><div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="flex items-center gap-3"><div className="w-3 h-3 bg-gray-200 rounded-full" /><div className="h-3 bg-gray-200 rounded w-36" /></div>))}</div></div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-44 w-44 shrink-0">
                    <DistributionPie slices={pieSlices} />
                  </div>
                  <div className="flex flex-col gap-3">
                    {tableDistribution.items.length === 0 ? (
                      <p className="text-xs text-gray-500">No data for selected range</p>
                    ) : (
                      tableDistribution.items.map((it, i) => (
                        <div key={it.serviceId} className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                pieSlices[i]?.color ||
                                tableDistribution.palette[i % tableDistribution.palette.length],
                            }}
                          />
                          <p className="text-xs font-medium text-gray-700">{it.label}</p>
                          <p className="text-xs text-gray-400 ml-2">({it.value})</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
