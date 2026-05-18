import { useState } from "react";

function IosToggle({ checked, onChange, ariaLabel, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => (disabled ? null : onChange(!checked))}
      className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition-colors ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      } ${checked ? "bg-ocean-600" : "bg-ocean-200"}`}
    >
      <span
        className={`pointer-events-none absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function Segmented({ value, onChange, leftLabel, leftValue, rightLabel, rightValue, disabled = false }) {
  return (
    <div
      className={`inline-flex rounded-xl border border-ocean-200 bg-ocean-50 p-1 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] ${
        disabled ? "opacity-55" : ""
      }`}
      aria-disabled={disabled}
    >
      <button
        type="button"
        onClick={() => (disabled ? null : onChange(leftValue))}
        disabled={disabled}
        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
          value === leftValue ? "bg-ocean-700 text-white shadow-[0_8px_18px_-12px_rgba(8,74,118,0.9)]" : "text-ocean-700 hover:bg-white/60"
        }`}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => (disabled ? null : onChange(rightValue))}
        disabled={disabled}
        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
          value === rightValue ? "bg-ocean-700 text-white shadow-[0_8px_18px_-12px_rgba(8,74,118,0.9)]" : "text-ocean-700 hover:bg-white/60"
        }`}
      >
        {rightLabel}
      </button>
    </div>
  );
}

const SCHEDULE_REPORT_ADMINS = [
  { id: "admin-001", name: "Medical Assistance Admin", email: "admin1@apoyo.gov.ph" },
  { id: "admin-002", name: "Financial Assistance Admin", email: "admin2@apoyo.gov.ph" },
  { id: "admin-003", name: "Burial Assistance Admin", email: "admin3@apoyo.gov.ph" },
];

function ScheduledReportAdminPicker({ selectedIds, onToggle }) {
  const selectedNames = SCHEDULE_REPORT_ADMINS.filter((a) => selectedIds.has(a.id))
    .map((a) => a.name)
    .join(", ");
  const selectedCount = SCHEDULE_REPORT_ADMINS.filter((a) => selectedIds.has(a.id)).length;

  return (
    <div className="mt-4 rounded-xl border border-ocean-100 bg-gradient-to-b from-ocean-50/80 to-white/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Select admins</p>
          <p className="mt-1 text-xs text-ocean-700">Only selected admins receive scheduled report notifications for this cadence.</p>
        </div>
        <div className="shrink-0 rounded-full border border-ocean-200 bg-white px-3 py-1 text-[11px] font-semibold text-ocean-700">
          {selectedCount} selected
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {SCHEDULE_REPORT_ADMINS.map((admin) => {
          const checked = selectedIds.has(admin.id);
          return (
            <button
              key={admin.id}
              type="button"
              onClick={() => onToggle(admin.id)}
              className={`group flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
                checked
                  ? "border-ocean-300 bg-white shadow-[0_10px_26px_-22px_rgba(10,70,111,0.7)]"
                  : "border-ocean-100 bg-white/70 hover:border-ocean-200 hover:bg-white"
              }`}
              aria-pressed={checked}
            >
              <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-xl border border-ocean-200 bg-ocean-50 text-ocean-700">
                <svg
                  className={`size-4 transition ${checked ? "text-ocean-700" : "text-ocean-400 group-hover:text-ocean-600"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 12l2 2 4-4" />
                  <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ocean-900">{admin.name}</span>
                <span className="block truncate text-xs text-ocean-600">{admin.email}</span>
              </span>
            </button>
          );
        })}
      </div>
      {selectedNames ? (
        <div className="mt-3 text-xs text-ocean-700">
          <span className="font-semibold">Selected</span>: {selectedNames}.
        </div>
      ) : null}
    </div>
  );
}

function FormatCheckbox({ label, checked, onChange, disabled }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
        disabled ? "cursor-not-allowed border-ocean-100 opacity-50" : "border-ocean-200 bg-white hover:border-ocean-300"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="size-4 rounded border-ocean-300 text-ocean-600 focus:ring-ocean-500"
      />
      <span className="text-ocean-900">{label}</span>
    </label>
  );
}

export function ReportsSettingsTab() {
  const [allowViewing, setAllowViewing] = useState(true);
  const [allowExport, setAllowExport] = useState(true);
  const [formats, setFormats] = useState({ pdf: true, excel: true, csv: false });

  const [dateRangeStart, setDateRangeStart] = useState("2020-01-01");
  const [dateRangeEnd, setDateRangeEnd] = useState("2025-01-01");

  const [showCharts, setShowCharts] = useState(true);
  const [maskSensitive, setMaskSensitive] = useState(true);

  const [scheduledReports, setScheduledReports] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState("daily"); // daily | weekly | monthly
  const [scheduledScope, setScheduledScope] = useState("all");
  const [scheduledAdminIds, setScheduledAdminIds] = useState(() => new Set([SCHEDULE_REPORT_ADMINS[0]?.id].filter(Boolean)));

  const [allowPrinting, setAllowPrinting] = useState(true);

  const formatDisabled = !allowExport;

  const toggleScheduledAdmin = (id) => {
    setScheduledAdminIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const frequencyDisabled = !scheduledReports || (scheduledScope === "exceptions" && scheduledAdminIds.size === 0);

  const frequencies = [
    { id: "daily", label: "Per day" },
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Reports Settings</h3>
      <p className="text-sm text-ocean-700">
        Configure who can view, export, and print reports, plus defaults for schedules and sensitive data.
      </p>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Access</p>
        <div className="mt-3 divide-y divide-ocean-100">
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Allow report viewing</p>
              <p className="mt-0.5 text-xs text-ocean-700">Let admins open reports in the system.</p>
            </div>
            <IosToggle checked={allowViewing} onChange={setAllowViewing} ariaLabel="Allow report viewing" />
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Allow report export</p>
              <p className="mt-0.5 text-xs text-ocean-700">Allow downloads using the formats selected below.</p>
            </div>
            <IosToggle checked={allowExport} onChange={setAllowExport} ariaLabel="Allow report export" />
          </div>
          <div className="py-3">
            <p className="text-sm font-semibold text-ocean-900">Allowed export formats</p>
            <p className="mt-0.5 text-xs text-ocean-700">PDF, Excel, and CSV availability.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <FormatCheckbox label="PDF" checked={formats.pdf} onChange={(v) => setFormats((p) => ({ ...p, pdf: v }))} disabled={formatDisabled} />
              <FormatCheckbox label="Excel" checked={formats.excel} onChange={(v) => setFormats((p) => ({ ...p, excel: v }))} disabled={formatDisabled} />
              <FormatCheckbox label="CSV" checked={formats.csv} onChange={(v) => setFormats((p) => ({ ...p, csv: v }))} disabled={formatDisabled} />
            </div>
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Allow report printing</p>
              <p className="mt-0.5 text-xs text-ocean-700">Show print actions where reports are displayed.</p>
            </div>
            <IosToggle checked={allowPrinting} onChange={setAllowPrinting} ariaLabel="Allow report printing" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Defaults</p>
        <p className="mt-1 text-xs text-ocean-700">Default date span when admins open a report.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
            From
            <input type="date" value={dateRangeStart} onChange={(e) => setDateRangeStart(e.target.value)} className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium normal-case tracking-normal text-ocean-900 outline-none focus:border-ocean-400" />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
            Up to
            <input type="date" value={dateRangeEnd} onChange={(e) => setDateRangeEnd(e.target.value)} className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium normal-case tracking-normal text-ocean-900 outline-none focus:border-ocean-400" />
          </label>
        </div>

        <div className="mt-4 divide-y divide-ocean-100">
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Show charts in reports</p>
              <p className="mt-0.5 text-xs text-ocean-700">Include charts when the template supports them.</p>
            </div>
            <IosToggle checked={showCharts} onChange={setShowCharts} ariaLabel="Show charts in reports" />
          </div>
          <div className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ocean-900">Mask sensitive information in reports</p>
              <p className="mt-0.5 text-xs text-ocean-700">Hide or obscure identifiers where masking rules apply.</p>
            </div>
            <IosToggle checked={maskSensitive} onChange={setMaskSensitive} ariaLabel="Mask sensitive information" />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ocean-900">Allow scheduled reports</p>
            <p className="mt-0.5 text-xs text-ocean-700">Automated generation — choose cadence below.</p>
          </div>
          <IosToggle checked={scheduledReports} onChange={setScheduledReports} ariaLabel="Allow scheduled reports" />
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ocean-700 sm:max-w-[55%]">Send scheduled notifications to all admins, or only to selected admins.</p>
          <Segmented value={scheduledScope} onChange={setScheduledScope} leftLabel="All admins" leftValue="all" rightLabel="Exceptions" rightValue="exceptions" disabled={!scheduledReports} />
        </div>

        {scheduledReports && scheduledScope === "exceptions" ? (
          <ScheduledReportAdminPicker selectedIds={scheduledAdminIds} onToggle={toggleScheduledAdmin} />
        ) : null}

        <div className={`mt-4 ${frequencyDisabled ? "pointer-events-none opacity-50" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ocean-600">Frequency</p>
          <div className="mt-2 inline-flex flex-wrap gap-1 rounded-xl border border-ocean-200 bg-ocean-50 p-1">
            {frequencies.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setScheduleFrequency(id)}
                disabled={frequencyDisabled}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  scheduleFrequency === id ? "bg-ocean-700 text-white shadow-[0_8px_18px_-12px_rgba(8,74,118,0.9)]" : "text-ocean-700 hover:bg-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scheduledReports && scheduledScope === "exceptions" && scheduledAdminIds.size === 0 ? (
            <p className="mt-2 text-[11px] font-medium text-amber-800">Select at least one admin to enable frequency and notifications.</p>
          ) : null}
        </div>
      </section>

      <div className="flex justify-end">
        <button type="button" className="inline-flex h-10 items-center rounded-xl bg-ocean-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-ocean-800">
          Apply changes
        </button>
      </div>
    </div>
  );
}

