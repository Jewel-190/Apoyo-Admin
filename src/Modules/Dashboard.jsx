import {
  Search,
  Bell,
  ChevronDown,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  PieChart,
} from "lucide-react";
import hospitalIcon from "../assets/Hospital.png";
import treatmentIcon from "../assets/Treatment.png";
import medicalIcon from "../assets/Medical.png";
import { useAuth } from "../context/AuthContext";

const criticalFollowUps = [
  {
    id: "MAMO-2026-001",
    status: "Pending 2hrs ago",
    dotColor: "bg-red-500",
    badgeBg: "#F3E8FF",
    badgeText: "#9333EA",
  },
  {
    id: "MATP-2026-002",
    status: "Action Required 2hrs ago",
    dotColor: "bg-orange-400",
    badgeBg: "#FEF9C3",
    badgeText: "#CA8A04",
  },
  {
    id: "MATP-2026-002",
    status: "Action Required 6hrs ago",
    dotColor: "bg-orange-400",
    badgeBg: "#FEF9C3",
    badgeText: "#CA8A04",
  },
  {
    id: "MAMO-2026-003",
    status: "Pending 8hrs ago",
    dotColor: "bg-orange-400",
    badgeBg: "#F3E8FF",
    badgeText: "#9333EA",
  },
  {
    id: "MAMO-2026-002",
    status: "Pending 9hrs ago",
    dotColor: "bg-red-500",
    badgeBg: "#F3E8FF",
    badgeText: "#9333EA",
  },
];

const maxBarValue = 20;

function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function describeSlice(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export default function Dashboard() {
  const { roleConfig, theme } = useAuth();

  const primary = theme?.primary || "#008B88";
  const secondary = theme?.secondary || "#06C1EC";
  const tertiary = theme?.tertiary || "#33BFB8";

  const sourceCards = roleConfig?.requestSources || [];
  const iconPool = [hospitalIcon, treatmentIcon, medicalIcon];
  const statValues = [16, 32, 23];

  const statsCards = [
    {
      title: "Total Applications Today",
      value: 71,
      highlight: true,
      icon: null,
    },
    ...sourceCards.slice(0, 3).map((source, index) => ({
      title: `Total Applications of ${source.category} Today`,
      value: statValues[index] || 0,
      icon: iconPool[index % iconPool.length],
    })),
  ];

  const barData = [
    { label: "Pending", value: 15, color: primary },
    { label: "In Progress", value: 11, color: tertiary },
    { label: "Action Required", value: 4, color: "#7DD8F0" },
    { label: "Approved", value: 20, color: secondary },
  ];

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

  const slices = [
    { pct: 74, color: secondary },
    { pct: 6, color: tertiary },
    { pct: 20, color: primary },
  ];

  let cumulative = 0;
  const pieSlices = slices.map((s) => {
    const start = cumulative * 3.6;
    const end = (cumulative + s.pct) * 3.6;
    cumulative += s.pct;
    return { ...s, start, end };
  });

  const label74 = polarToCartesian(
    50,
    50,
    30,
    (pieSlices[0].start + pieSlices[0].end) / 2
  );
  const label20 = polarToCartesian(
    50,
    50,
    30,
    (pieSlices[2].start + pieSlices[2].end) / 2
  );

  return (
    <div className="min-h-screen">
      {/* ===== Top Bar ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        {/* Search — wider, white bg, strong shadow, no visible border */}
        <div className="relative w-full max-w-lg">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            size={17}
          />
          <input
            type="text"
            placeholder="Search"
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white text-sm text-gray-500 outline-none shadow-md border border-gray-100 focus:ring-2 transition-all duration-200 placeholder-gray-400"
            style={{ outlineColor: primary }}
          />
        </div>

        {/* Bell + chevron — pill shaped, white bg, shadow */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-md border border-gray-100 cursor-pointer hover:shadow-lg transition-all duration-200">
          <Bell size={18} className="text-gray-400" />
          <ChevronDown size={14} className="text-gray-400" />
        </div>
      </div>

      {/* ===== Main Card ===== */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between mb-6 gap-2">
          <div>
            <h1
              className="text-2xl md:text-3xl font-bold mb-1"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                background: `linear-gradient(to right, ${primary}, ${secondary})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {roleConfig?.title ? `${roleConfig.title} Dashboard` : "Dashboard"}
            </h1>
            <p className="text-gray-400 text-xs md:text-sm">
              {roleConfig?.dashboardSubtitle ||
                "Welcome to the Medical Assistance Command Center."}
            </p>
          </div>
          <p
            className="text-xs md:text-sm font-medium shrink-0"
            style={{ color: secondary }}
          >
            {dateStr} | {timeStr}
          </p>
        </div>

        {/* ===== Stat Cards ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statsCards.map((card, i) => (
            <div
              key={i}
              className="rounded-2xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer overflow-hidden relative"
              style={
                card.highlight
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
                    }
              }
            >
              {/* Gradient top bar */}
              {!card.highlight && (
                <div
                  className="absolute top-0 left-0 right-0 rounded-t-2xl"
                  style={{
                    height: "8px",
                    background: `linear-gradient(to right, ${primary}, ${secondary})`,
                  }}
                />
              )}

              {/* Icon + Title */}
              <div className="flex items-start gap-2 mb-2 mt-1">
                {card.icon && (
                  <img
                    src={card.icon}
                    alt=""
                    className="w-10 h-10 object-contain shrink-0"
                  />
                )}
                <p
                  className="text-xs font-medium leading-tight"
                  style={{
                    color: card.highlight ? "rgba(255,255,255,0.9)" : "#6B7280",
                  }}
                >
                  {card.title}
                </p>
              </div>

              {/* Value */}
              <p
                className="text-3xl md:text-4xl font-bold mt-1"
                style={{ color: card.highlight ? "white" : "#1F2937" }}
              >
                {card.value}
              </p>

              {/* Trend — bar chart icon image style like screenshot */}
              <div
                className="flex items-center gap-1.5 mt-3 text-xs font-semibold"
                style={{
                  color: card.highlight ? "rgba(255,255,255,0.85)" : secondary,
                }}
              >
                {/* Mini bar chart icon (3 bars) */}
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
          ))}
        </div>

        {/* ===== Bottom 3 Panels ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ----- Panel 1: Critical Follow-ups ----- */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-orange-400" />
              <h3 className="text-sm font-semibold text-gray-700">
                Critical Follow-ups
              </h3>
            </div>
            <div className="flex flex-col gap-3">
              {criticalFollowUps.map((item, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.dotColor}`}
                  />
                  <span className="text-xs font-semibold text-gray-700 w-28 shrink-0">
                    {item.id}
                  </span>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: item.badgeBg,
                      color: item.badgeText,
                    }}
                  >
                    {item.status}
                  </span>
                  <span className="text-[10px] text-gray-400 ml-auto cursor-pointer hover:text-teal-600 hover:underline transition-colors duration-200">
                    Review Now
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ----- Panel 2: Bar Chart ----- */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-teal-600" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Status Application Breakdown
                </h3>
              </div>
              <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-teal-400">
                <option>Today</option>
                <option>This Week</option>
                <option>This Month</option>
              </select>
            </div>

            <p className="text-[10px] text-gray-400 mb-2 ml-1">
              Number of Applications
            </p>

            <div className="flex items-end gap-3 h-44 px-1">
              {barData.map((bar, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center flex-1 h-full justify-end group"
                >
                  <div
                    className="w-full rounded-t-3xl rounded-b-xl flex items-start justify-center transition-all duration-300 group-hover:opacity-90 relative pt-2"
                    style={{
                      height: `${(bar.value / maxBarValue) * 100}%`,
                      backgroundColor: bar.color,
                      minHeight: "32px",
                    }}
                  >
                    <span className="text-[11px] font-bold text-white">
                      {bar.value}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1.5 text-center leading-tight">
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-1 px-1">
              <span className="text-[9px] text-gray-300">0</span>
              <span className="text-[9px] text-gray-300">5</span>
              <span className="text-[9px] text-gray-300">10</span>
              <span className="text-[9px] text-gray-300">15</span>
              <span className="text-[9px] text-gray-300">20</span>
            </div>
          </div>

          {/* ----- Panel 3: Pie Chart ----- */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <PieChart size={16} className="text-teal-600" />
                <h3 className="text-sm font-semibold text-gray-700">
                  Application Distribution
                </h3>
              </div>
              <select className="text-xs border border-gray-300 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-teal-400">
                <option>Today</option>
                <option>This Week</option>
                <option>This Month</option>
              </select>
            </div>

            <div className="flex items-center gap-4">
              {/* SVG Pie */}
              <div className="w-44 h-44 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  {pieSlices.map((slice, i) => (
                    <path
                      key={i}
                      d={describeSlice(50, 50, 50, slice.start, slice.end)}
                      fill={slice.color}
                    />
                  ))}

                  {/* White divider lines */}
                  {pieSlices.map((slice, i) => {
                    const pt = polarToCartesian(50, 50, 50, slice.start);
                    return (
                      <line
                        key={i}
                        x1="50"
                        y1="50"
                        x2={pt.x}
                        y2={pt.y}
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    );
                  })}

                  {/* 74% label */}
                  <text
                    x={label74.x}
                    y={label74.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="7"
                    fontWeight="bold"
                  >
                    74%
                  </text>

                  {/* 20% label */}
                  <text
                    x={label20.x}
                    y={label20.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="7"
                    fontWeight="bold"
                  >
                    20%
                  </text>
                </svg>
              </div>

              {/* Legend */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: "#06C1EC" }}
                  />
                  <p className="text-xs font-medium text-gray-700">
                    Medical Expense
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: "#33BFB8" }}
                  />
                  <p className="text-xs font-medium text-gray-700">
                    Treatment & Operations
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: "#1A5C59" }}
                  />
                  <p className="text-xs font-medium text-gray-700">
                    Medical Operations
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
