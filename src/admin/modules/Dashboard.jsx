import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  PieChart,
  Layers,
  Activity,
} from "lucide-react";
import MiniNotifications from "../components/MiniNotifications";
import {
  fetchAdminDashboardAnalytics,
  formatRelativeWithTime,
} from "../../shared/lib/requestData";
import {
  buildOpenRequestLocationState,
  resolveAdminModulePathForStatus,
} from "../../shared/lib/adminRequestNavigation";
import { useAuth } from "../../shared/context/AuthContext";
import {
  getAdminFollowUpRowStyle,
  getAdminRequestStatusChartColor,
} from "../../shared/lib/adminLineStatusStyles";

const PERIOD_OPTIONS = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all_time", label: "All Time" },
];

const MONITOR_PRESET_OPTIONS = [
  ...PERIOD_OPTIONS,
  { value: "custom", label: "Custom Range" },
];

const MONITOR_STATUS_COLUMNS = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
];

function formatUtcDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function buildDefaultCustomMonitorRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(to.getUTCDate() - 29);
  return {
    from: formatUtcDateInput(from),
    to: formatUtcDateInput(to),
  };
}

const STATUS_ORDER = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
];

// High-contrast, non-theme palette dedicated for service distribution readability.
const DISTRIBUTION_COLORS = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#D55E00",
  "#CC79A7",
  "#56B4E9",
  "#3B82F6",
  "#7C3AED",
  "#059669",
  "#F97316",
  "#DC2626",
  "#4B5563",
];

function buildEmptyStatuses() {
  return {
    Pending: 0,
    "In Progress": 0,
    "Action Required": 0,
    Resubmitted: 0,
    "For Approval": 0,
    Scheduled: 0,
    Approved: 0,
  };
}

function buildEmptyPeriodMetrics() {
  return {
    applications: 0,
    services_with_activity: 0,
    statuses: buildEmptyStatuses(),
    distribution: [],
  };
}

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

function DashboardStatCard({
  title,
  value,
  subtitle,
  primary,
  secondary,
  highlight = false,
}) {
  const style = highlight
    ? {
        background: `linear-gradient(to right, ${primary}, ${secondary})`,
        color: "white",
      }
    : {
        background: "white",
        border: "1px solid #E5E7EB",
      };

  return (
    <div
      className="rounded-2xl p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-xs font-semibold uppercase tracking-[0.11em]"
          style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#6B7280" }}
        >
          {title}
        </p>
        <Layers
          size={18}
          strokeWidth={1.7}
          className="shrink-0"
          style={{ color: highlight ? "rgba(255,255,255,0.85)" : primary }}
          aria-hidden
        />
      </div>
      <p
        className="mt-2 text-3xl md:text-4xl font-bold leading-none"
        style={{ color: highlight ? "white" : "#111827" }}
      >
        {value}
      </p>
      <p
        className="mt-2 text-[11px] font-medium"
        style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#6B7280" }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function PeriodSelect({ value, onChange, accentColor }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus-visible:ring-2 focus-visible:ring-offset-0 bg-white"
      style={{ accentColor }}
    >
      {PERIOD_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function DistributionPie({ slices }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-label="Application distribution chart">
      {slices.map((slice, index) => {
        const startPoint = polarToCartesian(50, 50, 50, slice.start);
        return (
          <g key={`${slice.service_id}-${index}`}>
            <path d={describeSlice(50, 50, 50, slice.start, slice.end)} fill={slice.color} />
            <line
              x1="50"
              y1="50"
              x2={startPoint.x}
              y2={startPoint.y}
              stroke="white"
              strokeWidth="1.2"
            />
          </g>
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { roleConfig, theme, user } = useAuth();

  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");
  const [statusRange, setStatusRange] = useState("month");
  const [distributionRange, setDistributionRange] = useState("month");
  const [monitorPreset, setMonitorPreset] = useState("month");
  const [customMonitorRange, setCustomMonitorRange] = useState(buildDefaultCustomMonitorRange);
  const [customMonitorApplied, setCustomMonitorApplied] = useState(null);
  const [loadingCustomMonitor, setLoadingCustomMonitor] = useState(false);
  const [customMonitorError, setCustomMonitorError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDashboardData = async () => {
      if (!user?.id) {
        if (!mounted) return;
        setLoadingAnalytics(false);
        setAnalytics(null);
        return;
      }

      setLoadingAnalytics(true);
      setAnalyticsError("");

      try {
        const data = await fetchAdminDashboardAnalytics({
          forceRefresh: false,
          cacheScopeKey: `${user.id}:${roleConfig?.catalogCategoryId || "all"}`,
        });

        if (!mounted) return;
        setAnalytics(data);
      } catch (error) {
        if (!mounted) return;
        const message = error?.message || "Unable to load dashboard analytics.";
        setAnalyticsError(message);
        setAnalytics(null);
      } finally {
        if (mounted) {
          setLoadingAnalytics(false);
        }
      }
    };

    void loadDashboardData();
    return () => {
      mounted = false;
    };
  }, [user?.id, roleConfig?.catalogCategoryId]);

  const primary = theme?.primary ?? "var(--apoyo-primary)";
  const secondary = theme?.secondary ?? "var(--apoyo-secondary)";

  const dayMetrics = analytics?.periods?.day ?? buildEmptyPeriodMetrics();
  const weekMetrics = analytics?.periods?.week ?? buildEmptyPeriodMetrics();
  const monthMetrics = analytics?.periods?.month ?? buildEmptyPeriodMetrics();
  const allTimeMetrics = analytics?.periods?.all_time ?? buildEmptyPeriodMetrics();

  const statusPeriodMetrics =
    analytics?.periods?.[statusRange] ?? buildEmptyPeriodMetrics();
  const distributionPeriodMetrics =
    analytics?.periods?.[distributionRange] ?? buildEmptyPeriodMetrics();
  const followUps = analytics?.follow_ups ?? [];

  const statsCards = useMemo(
    () => [
      {
        title: "Applications Today",
        value: dayMetrics.applications,
        subtitle: `${dayMetrics.services_with_activity} services active`,
        highlight: true,
      },
      {
        title: "Applications This Week",
        value: weekMetrics.applications,
        subtitle: `${weekMetrics.services_with_activity} services active`,
      },
      {
        title: "Applications This Month",
        value: monthMetrics.applications,
        subtitle: `${monthMetrics.services_with_activity} services active`,
      },
      {
        title: "Applications All Time",
        value: allTimeMetrics.applications,
        subtitle: `${allTimeMetrics.services_with_activity} services active`,
      },
    ],
    [dayMetrics, weekMetrics, monthMetrics, allTimeMetrics]
  );

  const barData = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        label: status,
        value: statusPeriodMetrics.statuses?.[status] ?? 0,
        color: getAdminRequestStatusChartColor(status),
      })),
    [statusPeriodMetrics]
  );

  const barMax = useMemo(
    () => Math.max(...barData.map((bar) => bar.value), 1),
    [barData]
  );

  const tableDistributionItems = distributionPeriodMetrics.distribution ?? [];
  const distributionTotal = tableDistributionItems.reduce(
    (sum, item) => sum + (item.value || 0),
    0
  );

  const pieSlices = useMemo(() => {
    if (!distributionTotal || tableDistributionItems.length === 0) {
      return [];
    }

    let cumulativeFloat = 0;
    return tableDistributionItems.map((item, index) => {
      const pctFloat = (item.value / distributionTotal) * 100;
      const start = cumulativeFloat * 3.6;
      cumulativeFloat += pctFloat;
      const end = cumulativeFloat * 3.6;
      return {
        ...item,
        pct: Math.round(pctFloat),
        start,
        end,
        color: DISTRIBUTION_COLORS[index % DISTRIBUTION_COLORS.length],
      };
    });
  }, [tableDistributionItems, distributionTotal]);

  const activeServiceMonitor = useMemo(() => {
    if (monitorPreset === "custom") {
      return customMonitorApplied ?? analytics?.service_monitor?.custom ?? null;
    }
    return analytics?.service_monitor?.presets?.[monitorPreset] ?? null;
  }, [analytics, customMonitorApplied, monitorPreset]);

  const handleMonitorPresetChange = (nextPreset) => {
    setMonitorPreset(nextPreset);
    setCustomMonitorError("");
  };

  const handleApplyCustomMonitorRange = async () => {
    if (!user?.id) {
      return;
    }

    const from = String(customMonitorRange.from || "").trim();
    const to = String(customMonitorRange.to || "").trim();
    if (!from || !to) {
      setCustomMonitorError("Select both a start and end date.");
      return;
    }

    if (from > to) {
      setCustomMonitorError("Start date must be on or before end date.");
      return;
    }

    setLoadingCustomMonitor(true);
    setCustomMonitorError("");

    try {
      const data = await fetchAdminDashboardAnalytics({
        serviceMonitor: { from, to },
        cacheScopeKey: `${user.id}:${roleConfig?.catalogCategoryId || "all"}`,
      });

      const snapshot = data?.service_monitor?.custom ?? null;
      if (!snapshot) {
        setCustomMonitorError("Unable to build statistics for the selected date range.");
        return;
      }

      setCustomMonitorApplied(snapshot);
      setMonitorPreset("custom");
    } catch (error) {
      setCustomMonitorError(error?.message || "Unable to load custom range statistics.");
    } finally {
      setLoadingCustomMonitor(false);
    }
  };

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const handleReviewClick = (item) => {
    const requestId = item?.requestId || item?.request_id || null;
    if (!requestId) {
      return;
    }

    navigate(resolveAdminModulePathForStatus(item.status), {
      state: buildOpenRequestLocationState(requestId),
    });
  };

  return (
    <div className="w-full h-full min-h-full bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
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
            <p className="text-gray-400 text-xs md:text-sm">
              {roleConfig?.dashboardSubtitle ||
                "Operational monitoring for assistance application flow."}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <p className="text-xs md:text-sm font-medium" style={{ color: secondary }}>
              {dateStr} | {timeStr}
            </p>
            <MiniNotifications />
          </div>
        </div>

        {analyticsError ? (
          <div className="mb-4 p-3 rounded bg-red-50 border border-red-100 text-red-700">
            {analyticsError}
          </div>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {loadingAnalytics
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`stats-skeleton-${index}`}
                  className="rounded-2xl bg-white border border-gray-100 p-4 animate-pulse"
                >
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                  <div className="h-10 bg-gray-200 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                </div>
              ))
            : statsCards.map((card) => (
                <DashboardStatCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  subtitle={card.subtitle}
                  highlight={card.highlight}
                  primary={primary}
                  secondary={secondary}
                />
              ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-gray-700">Follow-ups</h3>
            </div>

            <div className="flex flex-col gap-3">
              {loadingAnalytics ? (
                <p className="text-sm text-gray-400">Loading follow-ups...</p>
              ) : followUps.length === 0 ? (
                <p className="text-sm text-gray-400">No follow-ups right now.</p>
              ) : (
                followUps.map((item) => {
                  const style = getAdminFollowUpRowStyle(item.status);
                  const timeLabel = formatRelativeWithTime(item.changeAt);
                  return (
                    <div key={item.key} className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: style.dotColor }}
                      />
                      <span
                        className="shrink-0 max-w-[12rem] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-sm font-semibold text-gray-700"
                        title={item.id}
                      >
                        {item.id}
                      </span>
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
                        style={{
                          backgroundColor: style.badgeBg,
                          color: style.badgeText,
                        }}
                        title={`${item.status} | ${timeLabel}`}
                      >
                        {item.status} | {timeLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReviewClick(item)}
                        className="text-xs ml-auto hover:underline transition-colors duration-200 opacity-80 hover:opacity-100 shrink-0"
                        style={{ color: secondary }}
                      >
                        Review Now
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} style={{ color: primary }} />
                <h3 className="text-sm font-semibold text-gray-700">
                  Status Application Breakdown
                </h3>
              </div>
              <PeriodSelect
                value={statusRange}
                onChange={setStatusRange}
                accentColor={primary}
              />
            </div>
            <p className="text-[10px] text-gray-400 mb-2 ml-1">Number of applications</p>

            <div className="flex items-end gap-3 h-44 px-1">
              {loadingAnalytics
                ? Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`bar-skeleton-${index}`}
                      className="flex-1 h-full flex items-end"
                    >
                      <div
                        className="w-full bg-gray-200 rounded-t-xl"
                        style={{ height: `${18 + index * 9}%` }}
                      />
                    </div>
                  ))
                : barData.map((bar) => (
                    <div
                      key={bar.label}
                      className="flex flex-col items-center flex-1 h-full justify-end group"
                    >
                      <div
                        className="w-full rounded-t-2xl rounded-b-lg flex items-start justify-center transition-all duration-300 group-hover:opacity-90 relative pt-2"
                        style={{
                          height: `${Math.max(6, (bar.value / barMax) * 100)}%`,
                          backgroundColor: bar.color,
                          minHeight: "34px",
                        }}
                      >
                        <span className="text-[11px] font-bold text-white">{bar.value}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 mt-1.5 text-center leading-tight whitespace-nowrap">
                        {bar.label}
                      </span>
                    </div>
                  ))}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart size={16} style={{ color: primary }} />
                <h3 className="text-sm font-semibold text-gray-700">Application Distribution</h3>
              </div>
              <PeriodSelect
                value={distributionRange}
                onChange={setDistributionRange}
                accentColor={primary}
              />
            </div>

            {loadingAnalytics ? (
              <div className="flex items-center gap-4">
                <div className="w-36 h-36 bg-gray-100 rounded-full animate-pulse shrink-0" />
                <div className="flex-1 space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`dist-skeleton-${index}`} className="h-3 rounded bg-gray-200" />
                  ))}
                </div>
              </div>
            ) : tableDistributionItems.length === 0 ? (
              <p className="text-xs text-gray-500">No data for selected range.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-36 w-36 shrink-0">
                  <DistributionPie slices={pieSlices} />
                </div>
                <div className="flex flex-col gap-2 min-w-0">
                  {pieSlices.map((slice) => (
                    <div key={slice.service_id} className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: slice.color }}
                      />
                      <p className="text-xs font-medium text-gray-700 truncate" title={slice.label}>
                        {slice.label}
                      </p>
                      <p className="text-xs text-gray-500 shrink-0">
                        {slice.value} ({slice.pct}%)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="mt-4 bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: primary }} />
                <h3 className="text-sm font-semibold text-gray-700">Service Activity Monitor</h3>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Per-service application volume and status mix for the selected reporting window.
              </p>
              {activeServiceMonitor?.range?.label ? (
                <p className="mt-1 text-[11px] font-medium text-gray-500">
                  Viewing: {activeServiceMonitor.range.label}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex flex-wrap gap-1.5">
                {MONITOR_PRESET_OPTIONS.map((option) => {
                  const isActive = monitorPreset === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleMonitorPresetChange(option.value)}
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

              {monitorPreset === "custom" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[11px] text-gray-500">
                    From
                    <input
                      type="date"
                      value={customMonitorRange.from}
                      onChange={(event) =>
                        setCustomMonitorRange((previous) => ({
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
                      value={customMonitorRange.to}
                      onChange={(event) =>
                        setCustomMonitorRange((previous) => ({
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
                    onClick={handleApplyCustomMonitorRange}
                    disabled={loadingCustomMonitor}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: primary }}
                  >
                    {loadingCustomMonitor ? "Applying..." : "Apply Range"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {customMonitorError ? (
            <div className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {customMonitorError}
            </div>
          ) : null}

          {monitorPreset === "custom" && !activeServiceMonitor && !loadingAnalytics && !loadingCustomMonitor ? (
            <p className="mb-3 text-xs text-gray-500">
              Choose a date range and click Apply Range to load custom service statistics.
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-2 pr-3 font-semibold sticky left-0 bg-white">Service</th>
                  <th className="py-2 px-2 font-semibold text-right">Applications</th>
                  {MONITOR_STATUS_COLUMNS.map((status) => (
                    <th key={status} className="py-2 px-2 font-semibold text-right whitespace-nowrap">
                      {status}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingAnalytics || loadingCustomMonitor ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`monitor-skeleton-${index}`} className="border-b border-gray-50">
                      <td className="py-2 pr-3 sticky left-0 bg-white">
                        <div className="h-3 w-44 bg-gray-200 rounded animate-pulse" />
                      </td>
                      {Array.from({ length: MONITOR_STATUS_COLUMNS.length + 1 }).map((__, cellIndex) => (
                        <td key={`monitor-skeleton-cell-${index}-${cellIndex}`} className="py-2 px-2">
                          <div className="ml-auto h-3 w-8 bg-gray-200 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !activeServiceMonitor?.rows?.length ? (
                  <tr>
                    <td
                      colSpan={MONITOR_STATUS_COLUMNS.length + 2}
                      className="py-4 text-gray-500"
                    >
                      No service activity for the selected reporting window.
                    </td>
                  </tr>
                ) : (
                  activeServiceMonitor.rows.map((row) => (
                    <tr key={row.service_id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="py-2 pr-3 font-medium text-gray-700 sticky left-0 bg-white">
                        {row.label}
                      </td>
                      <td className="py-2 px-2 text-right font-semibold text-gray-800">
                        {row.applications}
                      </td>
                      {MONITOR_STATUS_COLUMNS.map((status) => {
                        const count = row.statuses?.[status] ?? 0;
                        return (
                          <td key={`${row.service_id}-${status}`} className="py-2 px-2 text-right">
                            <span
                              className={`inline-flex min-w-[1.5rem] justify-end ${
                                count > 0 ? "font-medium text-gray-800" : "text-gray-300"
                              }`}
                            >
                              {count}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
    </div>
  );
}
