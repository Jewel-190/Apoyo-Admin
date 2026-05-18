import { useMemo, useState } from "react";

const DATE_PRESETS = [
  { id: "last_7", label: "Last 7 days" },
  { id: "last_28", label: "Last 28 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "last_365", label: "Last 365 days" },
  { id: "lifetime", label: "Lifetime" },
  { id: "custom", label: "Custom" },
];

const DATE_YEARS = [
  { id: "year_2026", label: "2026" },
  { id: "year_2025", label: "2025" },
];

const DATE_MONTHS = [
  { id: "month_may", label: "May" },
  { id: "month_april", label: "April" },
  { id: "month_march", label: "March" },
];

const overviewMetrics = [
  { id: "total_registered", label: "Total registered users", helper: "All time" },
  { id: "total_applications", label: "Total applications", helper: "Per benefits / daily / weekly, etc." },
  { id: "total_approved", label: "Total approved", helper: "Per benefits / daily / weekly, etc." },
  { id: "total_pending", label: "Total pending", helper: "Per benefits / daily / weekly, etc." },
  { id: "total_resubmissions", label: "Total resubmissions", helper: "Per benefits / daily / weekly, etc." },
  { id: "total_action_required", label: "Total action required", helper: "Per benefits / daily / weekly, etc." },
  { id: "total_scheduled_cases", label: "Total scheduled cases", helper: "Per benefits / daily / weekly, etc." },
];

const exportOptions = [
  { id: "sheets", label: "Google Sheets (new tab)" },
  { id: "csv", label: "Comma-separated values (.csv)" },
];

const assistanceOptions = [
  { id: "medical", label: "Medical" },
  { id: "financial", label: "Financial" },
  { id: "burial", label: "Burial" },
];

const chartTypes = [
  { id: "line", label: "Line chart" },
  { id: "bar", label: "Bar chart" },
];

const granularities = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function Select({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`space-y-1 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-600">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-900 outline-none transition focus:border-ocean-400"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-ocean-600" : "bg-ocean-200"}`}
    >
      <span
        className={`pointer-events-none absolute left-1 top-1 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

function PlaceholderChart({ title, subtitle }) {
  return (
    <div className="rounded-xl border border-ocean-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-ocean-100 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ocean-900">{title}</p>
          {subtitle ? <p className="mt-0.5 truncate text-xs text-ocean-600">{subtitle}</p> : null}
        </div>
        <p className="text-xs font-semibold text-ocean-600">Placeholder</p>
      </div>
      <div className="p-4">
        <div className="grid h-52 place-items-center rounded-xl border border-dashed border-ocean-200 bg-ocean-50/60">
          <svg viewBox="0 0 520 200" className="h-full w-full max-w-[680px]" aria-hidden>
            <path d="M30 160H500" stroke="rgba(15, 23, 42, 0.18)" strokeWidth="2" />
            <path d="M30 20V160" stroke="rgba(15, 23, 42, 0.18)" strokeWidth="2" />
            <path
              d="M30 130 C 90 60, 150 150, 210 90 S 330 50, 390 120 S 460 70, 500 80"
              fill="none"
              stroke="rgba(8, 145, 178, 0.9)"
              strokeWidth="3"
            />
            <path
              d="M30 120 C 90 110, 150 70, 210 100 S 330 120, 390 65 S 460 95, 500 50"
              fill="none"
              stroke="rgba(16, 185, 129, 0.85)"
              strokeWidth="3"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function OverviewReportTab() {
  const [datePreset, setDatePreset] = useState("last_28");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [activeMetricId, setActiveMetricId] = useState(overviewMetrics[0]?.id ?? null);
  const [showChart, setShowChart] = useState(true);
  const [chartType, setChartType] = useState("line");
  const [granularity, setGranularity] = useState("daily");
  const [exportOpen, setExportOpen] = useState(false);
  const [assistances, setAssistances] = useState(() => new Set(assistanceOptions.map((a) => a.id)));

  const dateLabel = useMemo(() => {
    if (datePreset.startsWith("year_")) return DATE_YEARS.find((y) => y.id === datePreset)?.label ?? "Year";
    if (datePreset.startsWith("month_")) return DATE_MONTHS.find((m) => m.id === datePreset)?.label ?? "Month";
    if (datePreset !== "custom") return DATE_PRESETS.find((p) => p.id === datePreset)?.label ?? "Date";
    if (!customFrom && !customTo) return "Custom";
    if (customFrom && !customTo) return `From ${customFrom}`;
    if (!customFrom && customTo) return `Up to ${customTo}`;
    return `${customFrom} → ${customTo}`;
  }, [customFrom, customTo, datePreset]);

  const isCustom = datePreset === "custom";
  const activeMetric = overviewMetrics.find((m) => m.id === activeMetricId) ?? overviewMetrics[0];

  const rangeSuffix = useMemo(() => {
    if (isCustom) return "Custom";
    return dateLabel;
  }, [dateLabel, isCustom]);

  const selectedAssistancesLabel = useMemo(() => {
    const selected = assistanceOptions.filter((a) => assistances.has(a.id)).map((a) => a.label);
    if (selected.length === 0) return "None selected";
    if (selected.length === assistanceOptions.length) return "All assistances";
    return selected.join(", ");
  }, [assistances]);

  const chartTitle = useMemo(() => {
    const metricTitle = activeMetric?.label ?? "Metric";
    return metricTitle;
  }, [activeMetric?.label]);

  const closeExport = () => setExportOpen(false);
  const toggleAssistance = (id) => {
    setAssistances((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ocean-900">Overview report</h3>
          <p className="mt-1 text-sm text-ocean-700">
            Each “Total …” item below is its own tab. Select one to view filters and a dedicated chart.
          </p>
        </div>
      </div>

      <section className="grid gap-4 rounded-xl border border-ocean-200 bg-white/80 p-4 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="text-sm font-semibold text-ocean-900">Totals</p>
          <p className="mt-1 text-xs text-ocean-700">Select a total to open its report view.</p>

          <div className="mt-3 space-y-1">
            {overviewMetrics.map((item) => {
              const active = item.id === activeMetricId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveMetricId(item.id)}
                  className={`w-full rounded-xl border px-3.5 py-3 text-left transition ${
                    active
                      ? "border-ocean-500 bg-ocean-600 text-white shadow-[0_10px_22px_-15px_rgba(19,136,199,0.9)]"
                      : "border-ocean-200 bg-white text-ocean-900 hover:border-ocean-300 hover:bg-ocean-50"
                  }`}
                >
                  <p className={`text-sm font-semibold ${active ? "text-white" : "text-ocean-900"}`}>{item.label}</p>
                  <p className={`mt-0.5 text-xs ${active ? "text-white/85" : "text-ocean-700"}`}>{item.helper}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-ocean-200 bg-white p-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Selected</p>
              <p className="mt-1 truncate text-lg font-semibold text-ocean-950">{activeMetric?.label ?? "—"}</p>
              <p className="mt-1 text-xs text-ocean-700">Date: {rangeSuffix}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDatePickerOpen(true)}
                className="inline-flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-800 shadow-sm transition hover:border-ocean-300 hover:bg-ocean-50"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Date</span>
                <span className="ml-auto truncate text-sm font-semibold text-ocean-900">{dateLabel}</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen((v) => !v)}
                  className="inline-flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-800 shadow-sm transition hover:border-ocean-300 hover:bg-ocean-50"
                  aria-expanded={exportOpen}
                >
                  <span>Export</span>
                  <span className="text-ocean-400">▾</span>
                </button>
                {exportOpen ? (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-10 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-ocean-200 bg-white shadow-[0_20px_45px_-24px_rgba(10,70,111,0.55)]">
                    {exportOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          closeExport();
                        }}
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-ocean-900 transition hover:bg-ocean-50"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Chart type" value={chartType} onChange={setChartType} options={chartTypes} />
              <Select label="Granularity" value={granularity} onChange={setGranularity} options={granularities} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ocean-900">Chart</p>
                <p className="mt-0.5 text-xs text-ocean-600">Toggle placeholder chart visibility.</p>
              </div>
              <Toggle checked={showChart} onChange={setShowChart} label="Show chart" />
            </div>

            <div className="rounded-xl border border-ocean-200 bg-ocean-50/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Assistances</p>
              <p className="mt-1 text-xs text-ocean-700">Selected: {selectedAssistancesLabel}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {assistanceOptions.map((a) => {
                  const checked = assistances.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAssistance(a.id)}
                      className={`inline-flex h-9 items-center rounded-full border px-4 text-xs font-semibold transition ${
                        checked ? "border-ocean-500 bg-ocean-600 text-white" : "border-ocean-200 bg-white text-ocean-800"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {showChart ? (
            <PlaceholderChart
              title={chartTitle}
              subtitle={`Type: ${chartTypes.find((t) => t.id === chartType)?.label ?? chartType} · Granularity: ${
                granularities.find((g) => g.id === granularity)?.label ?? granularity
              }`}
            />
          ) : null}
        </div>
      </section>

      {datePickerOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-ocean-200 bg-white shadow-[0_20px_45px_-24px_rgba(10,70,111,0.55)]">
            <div className="flex items-start justify-between gap-3 border-b border-ocean-100 bg-ocean-50 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Date filter</p>
                <p className="mt-1 text-sm font-semibold text-ocean-950">Choose a range</p>
              </div>
              <button
                type="button"
                onClick={() => setDatePickerOpen(false)}
                className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-white px-3 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setDatePreset(p.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                      datePreset === p.id ? "border-ocean-500 bg-ocean-600 text-white" : "border-ocean-200 bg-white text-ocean-800 hover:bg-ocean-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {isCustom ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-semibold text-ocean-900">
                    From
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-semibold text-ocean-900 outline-none focus:border-ocean-400"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-semibold text-ocean-900">
                    To
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-11 w-full rounded-xl border border-ocean-200 bg-ocean-50/60 px-3 text-sm font-semibold text-ocean-900 outline-none focus:border-ocean-400"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

