import { useMemo, useState } from "react";

function IosToggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? "bg-ocean-600" : "bg-ocean-200"}`}
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

const dashboardAdmins = [
  { id: "admin-001", name: "Medical Assistance Admin", email: "admin1@apoyo.gov.ph" },
  { id: "admin-002", name: "Financial Assistance Admin", email: "admin2@apoyo.gov.ph" },
  { id: "admin-003", name: "Burial Assistance Admin", email: "admin3@apoyo.gov.ph" },
];

function AdminExceptionPicker({ selectedAdminIds, onToggleAdmin, selectedNames, selectedCount }) {
  return (
    <div className="mt-4 rounded-xl border border-ocean-100 bg-gradient-to-b from-ocean-50/80 to-white/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Select admins</p>
          <p className="mt-1 text-xs text-ocean-700">Only the selected admins will see this dashboard widget.</p>
        </div>
        <div className="shrink-0 rounded-full border border-ocean-200 bg-white px-3 py-1 text-[11px] font-semibold text-ocean-700">
          {selectedCount} selected
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {dashboardAdmins.map((admin) => {
          const checked = selectedAdminIds.has(admin.id);
          return (
            <button
              key={admin.id}
              type="button"
              onClick={() => onToggleAdmin(admin.id)}
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

export function DashboardSettingsTab() {
  const [showTotalApplications, setShowTotalApplications] = useState(true);
  const [showStatusBreakdown, setShowStatusBreakdown] = useState(true);
  const [showDistribution, setShowDistribution] = useState(true);

  const [statusScope, setStatusScope] = useState("all");
  const [distributionScope, setDistributionScope] = useState("all");

  const [statusSelectedAdmins, setStatusSelectedAdmins] = useState(() => new Set([dashboardAdmins[0]?.id].filter(Boolean)));
  const [distributionSelectedAdmins, setDistributionSelectedAdmins] = useState(() => new Set([dashboardAdmins[0]?.id].filter(Boolean)));

  const statusSelectedNames = useMemo(() => {
    const map = new Map(dashboardAdmins.map((a) => [a.id, a.name]));
    return Array.from(statusSelectedAdmins).map((id) => map.get(id)).filter(Boolean).join(", ");
  }, [statusSelectedAdmins]);

  const distributionSelectedNames = useMemo(() => {
    const map = new Map(dashboardAdmins.map((a) => [a.id, a.name]));
    return Array.from(distributionSelectedAdmins).map((id) => map.get(id)).filter(Boolean).join(", ");
  }, [distributionSelectedAdmins]);

  const toggleStatusAdmin = (id) => {
    setStatusSelectedAdmins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDistributionAdmin = (id) => {
    setDistributionSelectedAdmins((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Dashboard Settings</h3>
      <p className="text-sm text-ocean-700">Enable or disable dashboard widgets and control who can see them.</p>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Widgets</p>
        <p className="mt-0.5 text-xs text-ocean-700">These settings affect what admins see on their dashboard.</p>

        <div className="mt-3 space-y-4">
          <div className="rounded-xl border border-ocean-100 bg-ocean-50/60 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">Show total applications</p>
                <p className="mt-0.5 text-xs text-ocean-700">Displays the total applications cards (today) on the dashboard.</p>
              </div>
              <IosToggle checked={showTotalApplications} onChange={setShowTotalApplications} ariaLabel="Show total applications" />
            </div>
          </div>

          <div className="rounded-xl border border-ocean-100 bg-ocean-50/60 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">Show status application breakdown</p>
                <p className="mt-0.5 text-xs text-ocean-700">Displays the status summary (pending, approved, rejected, etc.).</p>
              </div>
              <IosToggle checked={showStatusBreakdown} onChange={setShowStatusBreakdown} ariaLabel="Show status application breakdown" />
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Segmented value={statusScope} onChange={setStatusScope} leftLabel="All admins" leftValue="all" rightLabel="Exceptions" rightValue="exceptions" disabled={!showStatusBreakdown} />
            </div>

            {showStatusBreakdown && statusScope === "exceptions" ? (
              <AdminExceptionPicker selectedAdminIds={statusSelectedAdmins} onToggleAdmin={toggleStatusAdmin} selectedNames={statusSelectedNames} selectedCount={statusSelectedAdmins.size} />
            ) : null}
          </div>

          <div className="rounded-xl border border-ocean-100 bg-ocean-50/60 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">Show application distribution</p>
                <p className="mt-0.5 text-xs text-ocean-700">Displays the distribution widget (by assistance type / category).</p>
              </div>
              <IosToggle checked={showDistribution} onChange={setShowDistribution} ariaLabel="Show application distribution" />
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Segmented value={distributionScope} onChange={setDistributionScope} leftLabel="All admins" leftValue="all" rightLabel="Exceptions" rightValue="exceptions" disabled={!showDistribution} />
            </div>

            {showDistribution && distributionScope === "exceptions" ? (
              <AdminExceptionPicker selectedAdminIds={distributionSelectedAdmins} onToggleAdmin={toggleDistributionAdmin} selectedNames={distributionSelectedNames} selectedCount={distributionSelectedAdmins.size} />
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

