import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  Layers,
  PieChart,
  RefreshCcw,
  Users,
  Shield,
  Grid3x3,
} from "lucide-react";
import { useAuth } from "../../shared/context/AuthContext";
import { DEFAULT_ADMIN_THEME } from "../../shared/config/roleConfig";
import { getAdminRequestStatusChartColor } from "../../shared/lib/adminLineStatusStyles";
import { supabase } from "../../shared/lib/supabaseClient";

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

const STATUS_ORDER = [
  "Pending",
  "In Progress",
  "Action Required",
  "Resubmitted",
  "For Approval",
  "Scheduled",
  "Approved",
];

const PIPELINE_ITEMS = [
  { key: "Pending", label: "Pending intake" },
  { key: "In Progress", label: "In progress" },
  { key: "Action Required", label: "Action required" },
  { key: "Resubmitted", label: "Resubmitted" },
  { key: "For Approval", label: "For approval" },
  { key: "Scheduled", label: "Scheduled" },
  { key: "Approved", label: "Approved" },
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

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date) {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  dayStart.setUTCDate(dayStart.getUTCDate() - diff);
  return dayStart;
}

function startOfUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

function formatUtcDateLabel(date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function buildApplicationVolumeRangeLabels(referenceDate = new Date()) {
  const todayEnd = endOfUtcDay(referenceDate);
  const todayStart = startOfUtcDay(referenceDate);
  const weekStart = startOfUtcWeek(referenceDate);
  const monthStart = startOfUtcMonth(referenceDate);

  return {
    day: `Today · ${formatUtcDateLabel(todayStart)}`,
    week: `This Week · ${formatUtcDateLabel(weekStart)} – ${formatUtcDateLabel(todayEnd)}`,
    month: `This Month · ${formatUtcDateLabel(monthStart)} – ${formatUtcDateLabel(todayEnd)}`,
    all_time: "All Time · entire platform history",
  };
}

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
    categories_with_activity: 0,
    approved: 0,
    approval_rate_pct: 0,
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

async function fetchSuperAdminDashboardAnalytics({ categoryMonitor = null } = {}) {
  const body = categoryMonitor ? { category_monitor: categoryMonitor } : undefined;

  const { data, error } = await supabase.functions.invoke(
    "super-admin-dashboard-analytics",
    body ? { body } : undefined
  );

  if (error) {
    throw new Error(error.message || "Unable to load dashboard analytics.");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Unable to load dashboard analytics.");
  }

  return data;
}

function DashboardStatCard({
  title,
  value,
  subtitle,
  dateRange,
  primary,
  secondary,
  highlight = false,
  icon: Icon = Layers,
}) {
  const style = highlight
    ? {
        background: `linear-gradient(to right, ${primary}, ${secondary})`,
        color: "white",
      }
    : {
        background: "white",
        border: "1px solid rgba(12, 72, 120, 0.14)",
      };

  return (
    <div
      className="rounded-2xl p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-xs font-semibold uppercase tracking-[0.11em]"
          style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#4B6B82" }}
        >
          {title}
        </p>
        <Icon
          size={18}
          strokeWidth={1.7}
          className="shrink-0"
          style={{ color: highlight ? "rgba(255,255,255,0.85)" : primary }}
          aria-hidden
        />
      </div>
      {dateRange ? (
        <p
          className="mt-1 text-[10px] font-medium leading-snug"
          style={{ color: highlight ? "rgba(255,255,255,0.75)" : "#6B8CA8" }}
        >
          {dateRange}
        </p>
      ) : null}
      <p
        className="mt-2 text-3xl md:text-4xl font-bold leading-none"
        style={{ color: highlight ? "white" : primary }}
      >
        {value}
      </p>
      <p
        className="mt-2 text-[11px] font-medium"
        style={{ color: highlight ? "rgba(255,255,255,0.85)" : "#6B8CA8" }}
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
      className="max-w-full shrink-0 text-xs rounded-lg border border-ocean-200 bg-white px-2 py-1 text-ocean-800 outline-none focus-visible:ring-2 focus-visible:ring-offset-0"
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
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-label="Assistance distribution chart">
      {slices.map((slice, index) => {
        const startPoint = polarToCartesian(50, 50, 50, slice.start);
        return (
          <g key={`${slice.category_id}-${index}`}>
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

export function DashboardPage() {
  const { user, roleConfig } = useAuth();

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
  const [reloadKey, setReloadKey] = useState(0);

  const primary = DEFAULT_ADMIN_THEME.primary;
  const secondary = DEFAULT_ADMIN_THEME.secondary;

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
        const data = await fetchSuperAdminDashboardAnalytics();
        if (!mounted) return;
        setAnalytics(data);
      } catch (error) {
        if (!mounted) return;
        setAnalyticsError(error?.message || "Unable to load dashboard analytics.");
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
  }, [user?.id, reloadKey]);

  const dayMetrics = analytics?.periods?.day ?? buildEmptyPeriodMetrics();
  const weekMetrics = analytics?.periods?.week ?? buildEmptyPeriodMetrics();
  const monthMetrics = analytics?.periods?.month ?? buildEmptyPeriodMetrics();
  const allTimeMetrics = analytics?.periods?.all_time ?? buildEmptyPeriodMetrics();
  const platform = analytics?.platform ?? {
    registered_applicants: 0,
    line_admins: 0,
    active_assistance_lines: 0,
    active_services: 0,
  };
  const pipeline = analytics?.pipeline ?? buildEmptyStatuses();
  const backlogCategories = analytics?.backlog_categories ?? [];

  const statusPeriodMetrics =
    analytics?.periods?.[statusRange] ?? buildEmptyPeriodMetrics();
  const distributionPeriodMetrics =
    analytics?.periods?.[distributionRange] ?? buildEmptyPeriodMetrics();

  const applicationVolumeRanges = useMemo(() => {
    const presets = analytics?.category_monitor?.presets;
    const fallback = buildApplicationVolumeRangeLabels(
      analytics?.timestamp ? new Date(analytics.timestamp) : new Date()
    );

    if (!presets) {
      return fallback;
    }

    return {
      day: presets.day?.range?.label || fallback.day,
      week: presets.week?.range?.label || fallback.week,
      month: presets.month?.range?.label || fallback.month,
      all_time:
        presets.all_time?.range?.label &&
        String(presets.all_time.range.label).includes("·")
          ? presets.all_time.range.label
          : fallback.all_time,
    };
  }, [analytics]);

  const applicationStatsCards = useMemo(
    () => [
      {
        title: "Applications Today",
        value: dayMetrics.applications,
        dateRange: applicationVolumeRanges.day,
        subtitle: `${dayMetrics.categories_with_activity} active assistance`,
        highlight: true,
      },
      {
        title: "Applications This Week",
        value: weekMetrics.applications,
        dateRange: applicationVolumeRanges.week,
        subtitle: `${weekMetrics.categories_with_activity} active assistance`,
      },
      {
        title: "Applications This Month",
        value: monthMetrics.applications,
        dateRange: applicationVolumeRanges.month,
        subtitle: `${monthMetrics.approval_rate_pct}% approval rate`,
      },
      {
        title: "Applications All Time",
        value: allTimeMetrics.applications,
        dateRange: applicationVolumeRanges.all_time,
        subtitle: `${allTimeMetrics.approval_rate_pct}% approval rate`,
      },
    ],
    [dayMetrics, weekMetrics, monthMetrics, allTimeMetrics, applicationVolumeRanges]
  );

  const platformStatsCards = useMemo(
    () => [
      {
        title: "Registered Applicants",
        value: platform.registered_applicants,
        subtitle: "Citizen accounts on the platform",
        icon: Users,
      },
      {
        title: "Assistance Admins",
        value: platform.line_admins,
        subtitle: "Assistance administrators",
        icon: Shield,
      },
      {
        title: "Active Assistance",
        value: platform.active_assistance_lines,
        subtitle: "Published assistance categories",
        icon: Grid3x3,
      },
      {
        title: "Active Services",
        value: platform.active_services,
        subtitle: "Live benefit programs in catalog",
        icon: Layers,
      },
    ],
    [platform]
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

  const categoryColorById = useMemo(() => {
    const map = new Map();
    for (const category of analytics?.categories || []) {
      if (category?.category_id && category?.color) {
        map.set(String(category.category_id), category.color);
      }
    }
    return map;
  }, [analytics?.categories]);

  const pieSlices = useMemo(() => {
    if (!distributionTotal || tableDistributionItems.length === 0) {
      return [];
    }

    let cumulativeFloat = 0;
    return tableDistributionItems.map((item) => {
      const pctFloat = (item.value / distributionTotal) * 100;
      const start = cumulativeFloat * 3.6;
      cumulativeFloat += pctFloat;
      const end = cumulativeFloat * 3.6;
      return {
        ...item,
        pct: Math.round(pctFloat),
        start,
        end,
        color:
          item.color ||
          categoryColorById.get(String(item.category_id)) ||
          "#6B7280",
      };
    });
  }, [tableDistributionItems, distributionTotal, categoryColorById]);

  const activeCategoryMonitor = useMemo(() => {
    if (monitorPreset === "custom") {
      return customMonitorApplied ?? analytics?.category_monitor?.custom ?? null;
    }
    return analytics?.category_monitor?.presets?.[monitorPreset] ?? null;
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
      const data = await fetchSuperAdminDashboardAnalytics({
        categoryMonitor: { from, to },
      });

      const snapshot = data?.category_monitor?.custom ?? null;
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

  const handleReload = () => {
    setCustomMonitorApplied(null);
    setReloadKey((previous) => previous + 1);
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

  const lastUpdated = analytics?.timestamp
    ? new Date(analytics.timestamp).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  return (
    <div className="w-full min-w-0 overflow-x-hidden space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
            {roleConfig?.dashboardTitle || "Super Admin Dashboard"}
          </h1>
          <p className="text-sm text-ocean-600/90">
            Platform-wide oversight of assistance applications, catalog health, and pipeline load.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastUpdated ? (
            <p className="hidden text-xs font-medium text-ocean-600 sm:block">
              Updated {lastUpdated}
            </p>
          ) : null}
          <p className="text-xs md:text-sm font-medium text-ocean-700">
            {dateStr} | {timeStr}
          </p>
          <button
            type="button"
            onClick={handleReload}
            disabled={loadingAnalytics}
            className="inline-flex items-center gap-2 rounded-xl border border-ocean-200 bg-white px-3 py-2 text-xs font-semibold text-ocean-700 hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw size={14} className={loadingAnalytics ? "animate-spin" : ""} />
            Reload
          </button>
        </div>
      </div>

      {analyticsError ? (
        <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {analyticsError}
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ocean-900">Application Volume</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loadingAnalytics
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`app-stats-skeleton-${index}`}
                  className="rounded-2xl border border-ocean-100 bg-white p-4 animate-pulse"
                >
                  <div className="h-4 bg-ocean-100 rounded w-3/4 mb-3" />
                  <div className="h-10 bg-ocean-100 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-ocean-100 rounded w-2/3" />
          </div>
              ))
            : applicationStatsCards.map((card) => (
                <DashboardStatCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  dateRange={card.dateRange}
                  subtitle={card.subtitle}
                  highlight={card.highlight}
                  primary={primary}
                  secondary={secondary}
                />
              ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ocean-900">Platform Snapshot</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loadingAnalytics
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`platform-stats-skeleton-${index}`}
                  className="rounded-2xl border border-ocean-100 bg-white p-4 animate-pulse"
                >
                  <div className="h-4 bg-ocean-100 rounded w-3/4 mb-3" />
                  <div className="h-10 bg-ocean-100 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-ocean-100 rounded w-2/3" />
        </div>
              ))
            : platformStatsCards.map((card) => (
                <DashboardStatCard
              key={card.title}
                  title={card.title}
                  value={card.value}
                  subtitle={card.subtitle}
                  primary={primary}
                  secondary={secondary}
                  icon={card.icon}
                />
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3 min-w-0">
        <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-ocean-200/80 bg-white p-4 hover:shadow-md transition-shadow duration-300">
          <div className="flex items-center gap-2 mb-4 min-w-0">
            <AlertTriangle size={18} className="text-orange-400 shrink-0" />
            <h3 className="text-sm font-semibold text-ocean-900 truncate">Pipeline Backlog</h3>
          </div>
          <p className="mb-3 text-[11px] text-ocean-600">
            Current open workload across all assistance.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {loadingAnalytics
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`pipeline-skeleton-${index}`}
                    className="h-14 rounded-xl bg-ocean-50 animate-pulse"
                  />
                ))
              : PIPELINE_ITEMS.map((item) => {
                  const count = pipeline[item.key] ?? 0;
                  const color = getAdminRequestStatusChartColor(item.key);
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-2 rounded-xl border border-ocean-100 bg-ocean-50/70 px-3 py-2.5 min-w-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate text-xs font-medium text-ocean-800">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-ocean-950 shrink-0 tabular-nums">
                        {count}
                      </span>
                    </div>
                  );
                })}
          </div>
        </section>

        <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-ocean-200/80 bg-white p-4 hover:shadow-md transition-shadow duration-300 lg:col-span-2">
          <div className="flex shrink-0 flex-col gap-2 mb-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <BarChart2 size={16} className="shrink-0" style={{ color: primary }} />
              <h3 className="text-sm font-semibold text-ocean-900 truncate">
                Application Status Breakdown
              </h3>
            </div>
            <PeriodSelect
              value={statusRange}
              onChange={setStatusRange}
              accentColor={primary}
            />
          </div>
          <p className="mb-2 ml-1 shrink-0 text-[10px] text-ocean-500">Applications by status</p>

          <div className="flex min-h-36 min-w-0 flex-1 flex-col justify-end overflow-x-auto pb-1">
            <div
              className="grid h-full min-h-36 w-full min-w-max items-end gap-x-1.5 px-0.5 sm:gap-x-2"
              style={{
                gridTemplateColumns: `repeat(${
                  loadingAnalytics ? 6 : Math.max(barData.length, 1)
                }, minmax(2.75rem, 1fr))`,
              }}
            >
              {loadingAnalytics
                ? Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={`bar-skeleton-${index}`}
                      className="flex h-full min-h-36 min-w-0 flex-col gap-1.5"
                    >
                      <div className="relative min-h-0 w-full flex-1">
                        <div
                          className="absolute inset-x-0 bottom-0 rounded-t-xl bg-ocean-100"
                          style={{ height: `${18 + index * 9}%` }}
                        />
                      </div>
                      <div className="h-6 shrink-0 rounded bg-ocean-50" />
                    </div>
                  ))
                : barData.map((bar) => (
                    <div
                      key={bar.label}
                      className="group flex h-full min-h-36 min-w-0 flex-col gap-1.5"
                      title={`${bar.label}: ${bar.value}`}
                    >
                      <div className="relative min-h-0 w-full flex-1">
                        <div
                          className="absolute inset-x-0 bottom-0 flex items-start justify-center rounded-t-2xl pt-2 transition-all duration-300 group-hover:opacity-90"
                          style={{
                            height: `${Math.max(8, (bar.value / barMax) * 100)}%`,
                            minHeight: "34px",
                            backgroundColor: bar.color,
                          }}
                        >
                          <span className="text-[11px] font-bold text-white">{bar.value}</span>
                        </div>
                      </div>
                      <p className="line-clamp-2 shrink-0 pb-1 text-center text-[10px] leading-tight text-ocean-600">
                        {bar.label}
                      </p>
                    </div>
                  ))}
            </div>
          </div>
        </section>
      </div>

      <section className="min-w-0 overflow-hidden rounded-xl border border-ocean-200/80 bg-white p-4 hover:shadow-md transition-shadow duration-300">
        <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <PieChart size={16} className="shrink-0" style={{ color: primary }} />
            <h3 className="text-sm font-semibold text-ocean-900 truncate">
              Applications by Assistance
            </h3>
          </div>
          <PeriodSelect
            value={distributionRange}
            onChange={setDistributionRange}
            accentColor={primary}
          />
        </div>

        {loadingAnalytics ? (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="w-36 h-36 bg-ocean-100 rounded-full animate-pulse shrink-0" />
            <div className="w-full flex-1 space-y-3 min-w-0">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`dist-skeleton-${index}`} className="h-3 rounded bg-ocean-100" />
              ))}
            </div>
          </div>
        ) : tableDistributionItems.length === 0 ? (
          <p className="text-xs text-ocean-600">No application activity for the selected range.</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="h-36 w-36 shrink-0">
              <DistributionPie slices={pieSlices} />
            </div>
            <div className="flex w-full flex-col gap-2 min-w-0">
              {pieSlices.map((slice) => (
                <div key={slice.category_id} className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: slice.color }}
                  />
                  <p className="text-xs font-medium text-ocean-800 truncate min-w-0 flex-1" title={slice.label}>
                    {slice.label}
                  </p>
                  <p className="text-xs text-ocean-600 shrink-0 tabular-nums">
                    {slice.value} ({slice.pct}%)
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-ocean-200/80 bg-white p-4 hover:shadow-md transition-shadow duration-300">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-500" />
          <h3 className="text-sm font-semibold text-ocean-900">Highest Backlog Assistance</h3>
        </div>
        <p className="mb-4 text-xs text-ocean-600">
          Assistance with the most open cases requiring admin attention.
        </p>

        {loadingAnalytics ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`backlog-skeleton-${index}`} className="h-10 rounded-lg bg-ocean-50 animate-pulse" />
            ))}
          </div>
        ) : backlogCategories.length === 0 ? (
          <p className="text-sm text-ocean-600">No open backlog across assistance.</p>
        ) : (
          <div className="min-w-0">
            <div className="space-y-2 md:hidden">
              {backlogCategories.map((row) => (
                <div
                  key={row.category_id}
                  className="rounded-xl border border-ocean-100 bg-ocean-50/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-ocean-900">{row.label}</p>
                    <p className="shrink-0 text-xs font-semibold tabular-nums text-ocean-900">
                      {row.backlog_count} total
                    </p>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {[
                      ["Pending", row.pending],
                      ["Action Required", row.action_required],
                      ["Resubmitted", row.resubmitted],
                      ["For Approval", row.for_approval],
                    ].map(([label, count]) => (
                      <div key={`${row.category_id}-${label}`} className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-ocean-600">{label}</span>
                        <span className="tabular-nums text-[11px] font-medium text-ocean-800">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden min-w-0 overflow-x-auto md:block">
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="border-b border-ocean-100 text-left text-ocean-500">
                    <th className="sticky left-0 bg-white py-2 pr-3 font-semibold">Assistance</th>
                    <th className="px-2 py-2 text-right font-semibold">Total Backlog</th>
                    <th className="px-2 py-2 text-right font-semibold">Pending</th>
                    <th className="px-2 py-2 text-right font-semibold">Action Required</th>
                    <th className="px-2 py-2 text-right font-semibold">Resubmitted</th>
                    <th className="px-2 py-2 text-right font-semibold">For Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {backlogCategories.map((row) => (
                    <tr key={row.category_id} className="border-b border-ocean-50 hover:bg-ocean-50/50">
                      <td className="sticky left-0 bg-white py-2 pr-3 font-medium text-ocean-800">
                        {row.label}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-ocean-900">
                        {row.backlog_count}
                      </td>
                      <td className="px-2 py-2 text-right text-ocean-700">{row.pending}</td>
                      <td className="px-2 py-2 text-right text-ocean-700">{row.action_required}</td>
                      <td className="px-2 py-2 text-right text-ocean-700">{row.resubmitted}</td>
                      <td className="px-2 py-2 text-right text-ocean-700">{row.for_approval}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="min-w-0 overflow-hidden rounded-xl border border-ocean-200/80 bg-white p-4 hover:shadow-md transition-shadow duration-300">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity size={16} style={{ color: primary }} />
              <h3 className="text-sm font-semibold text-ocean-900">
                Assistance Activity Monitor
              </h3>
            </div>
            <p className="mt-1 text-xs text-ocean-600">
              Per-assistance application volume and status mix for the selected reporting window.
            </p>
            {activeCategoryMonitor?.range?.label ? (
              <p className="mt-1 text-[11px] font-medium text-ocean-500">
                Viewing: {activeCategoryMonitor.range.label}
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
                        : "border border-ocean-200 bg-white text-ocean-700 hover:bg-ocean-50"
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
                <label className="text-[11px] text-ocean-600">
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
                    className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none focus-visible:ring-2"
                    style={{ accentColor: primary }}
                  />
                </label>
                <label className="text-[11px] text-ocean-600">
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
                    className="mt-1 block rounded-lg border border-ocean-200 px-2 py-1.5 text-xs text-ocean-800 outline-none focus-visible:ring-2"
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

        {monitorPreset === "custom" &&
        !activeCategoryMonitor &&
        !loadingAnalytics &&
        !loadingCustomMonitor ? (
          <p className="mb-3 text-xs text-ocean-600">
            Choose a date range and click Apply Range to load custom assistance statistics.
          </p>
        ) : null}

        <div className="min-w-0">
          <div className="space-y-3 md:hidden">
            {loadingAnalytics || loadingCustomMonitor ? (
              Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`monitor-card-skeleton-${index}`}
                  className="h-28 animate-pulse rounded-xl border border-ocean-100 bg-ocean-50"
                />
              ))
            ) : !activeCategoryMonitor?.rows?.length ? (
              <p className="py-2 text-xs text-ocean-600">
                No assistance activity for the selected reporting window.
              </p>
            ) : (
              activeCategoryMonitor.rows.map((row) => (
                <div
                  key={row.category_id}
                  className="rounded-xl border border-ocean-100 bg-ocean-50/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold text-ocean-900">{row.label}</p>
                    <p className="shrink-0 text-xs font-semibold tabular-nums text-ocean-800">
                      {row.applications} apps
                    </p>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {MONITOR_STATUS_COLUMNS.map((status) => {
                      const count = row.statuses?.[status] ?? 0;
                      return (
                        <div key={`${row.category_id}-${status}`} className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-ocean-600">{status}</span>
                          <span
                            className={`tabular-nums text-[11px] ${
                              count > 0 ? "font-medium text-ocean-900" : "text-ocean-300"
                            }`}
                          >
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden min-w-0 overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b border-ocean-100 text-left text-ocean-500">
                  <th className="sticky left-0 bg-white py-2 pr-3 font-semibold">Assistance</th>
                  <th className="px-2 py-2 text-right font-semibold">Applications</th>
                  {MONITOR_STATUS_COLUMNS.map((status) => (
                    <th key={status} className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                      {status}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadingAnalytics || loadingCustomMonitor ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`monitor-skeleton-${index}`} className="border-b border-ocean-50">
                      <td className="sticky left-0 bg-white py-2 pr-3">
                        <div className="h-3 w-44 animate-pulse rounded bg-ocean-100" />
                      </td>
                      {Array.from({ length: MONITOR_STATUS_COLUMNS.length + 1 }).map((__, cellIndex) => (
                        <td key={`monitor-skeleton-cell-${index}-${cellIndex}`} className="px-2 py-2">
                          <div className="ml-auto h-3 w-8 animate-pulse rounded bg-ocean-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !activeCategoryMonitor?.rows?.length ? (
                  <tr>
                    <td
                      colSpan={MONITOR_STATUS_COLUMNS.length + 2}
                      className="py-4 text-ocean-600"
                    >
                      No assistance activity for the selected reporting window.
                    </td>
                  </tr>
                ) : (
                  activeCategoryMonitor.rows.map((row) => (
                    <tr
                      key={row.category_id}
                      className="border-b border-ocean-50 hover:bg-ocean-50/60"
                    >
                      <td className="sticky left-0 bg-white py-2 pr-3 font-medium text-ocean-800">
                        {row.label}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-ocean-900">
                        {row.applications}
                      </td>
                      {MONITOR_STATUS_COLUMNS.map((status) => {
                        const count = row.statuses?.[status] ?? 0;
                        return (
                          <td key={`${row.category_id}-${status}`} className="px-2 py-2 text-right">
                            <span
                              className={`inline-flex min-w-[1.5rem] justify-end ${
                                count > 0 ? "font-medium text-ocean-900" : "text-ocean-300"
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
        </div>
      </section>
    </div>
  );
}
