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

const moduleAdmins = [
  { id: "admin-001", name: "Medical Assistance Admin", email: "admin1@apoyo.gov.ph" },
  { id: "admin-002", name: "Financial Assistance Admin", email: "admin2@apoyo.gov.ph" },
  { id: "admin-003", name: "Burial Assistance Admin", email: "admin3@apoyo.gov.ph" },
];

function AdminExceptionPicker({ selectedAdminIds, onToggleAdmin, selectedNames, selectedCount, helper }) {
  return (
    <div className="mt-4 rounded-xl border border-ocean-100 bg-gradient-to-b from-ocean-50/80 to-white/70 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Select admins</p>
          <p className="mt-1 text-xs text-ocean-700">{helper}</p>
        </div>
        <div className="shrink-0 rounded-full border border-ocean-200 bg-white px-3 py-1 text-[11px] font-semibold text-ocean-700">
          {selectedCount} selected
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {moduleAdmins.map((admin) => {
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

const tabs = [
  { id: "overview", label: "Overview", description: "High-level counts and summaries for incoming applications." },
  { id: "action-required", label: "Action required", description: "Applications that need urgent review or follow-up from admins." },
  { id: "resubmission", label: "Resubmission", description: "Applications returned for corrections or awaiting re-upload." },
];

function emptyTabState(enabled = true, scopeMode = "all") {
  return {
    enabled,
    scopeMode,
    selectedIds: new Set(moduleAdmins[0]?.id ? [moduleAdmins[0].id] : []),
  };
}

export function ApplicationModuleSettingsTab() {
  const [activeTab, setActiveTab] = useState("overview");
  const [byTab, setByTab] = useState(() => ({
    overview: emptyTabState(),
    "action-required": emptyTabState(),
    resubmission: emptyTabState(),
  }));

  const tab = tabs.find((t) => t.id === activeTab) ?? tabs[0];
  const cfg = byTab[activeTab];

  const selectedNames = useMemo(() => {
    const map = new Map(moduleAdmins.map((a) => [a.id, a.name]));
    return Array.from(cfg.selectedIds).map((id) => map.get(id)).filter(Boolean).join(", ");
  }, [cfg.selectedIds]);

  const updateTab = (patch) => {
    setByTab((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], ...patch } }));
  };

  const toggleAdmin = (id) => {
    setByTab((prev) => {
      const cur = prev[activeTab];
      const next = new Set(cur.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, [activeTab]: { ...cur, selectedIds: next } };
    });
  };

  const enableLabel = `Enable ${tab.label.toLowerCase()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-2xl border border-ocean-200 bg-ocean-50/80 p-1" role="tablist" aria-label="Application module views">
        {tabs.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(t.id)}
              className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition sm:flex-none sm:px-4 ${
                isActive
                  ? "bg-white text-ocean-900 shadow-[0_8px_24px_-18px_rgba(10,70,111,0.55)] ring-1 ring-ocean-200/80"
                  : "text-ocean-700 hover:bg-white/60 hover:text-ocean-900"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-2xl border border-ocean-200 bg-white/90 shadow-[0_12px_40px_-28px_rgba(10,70,111,0.45)]">
        <div className="border-b border-ocean-100 bg-gradient-to-r from-ocean-50/90 to-white px-4 py-3 sm:px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Application module</p>
          <h4 className="mt-0.5 text-base font-semibold text-ocean-950">{tab.label}</h4>
          <p className="mt-1 text-xs text-ocean-700">{tab.description}</p>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ocean-900">{enableLabel}</p>
              <p className="mt-0.5 text-xs text-ocean-700">When off, this view is hidden and access rules cannot be changed.</p>
            </div>
            <IosToggle checked={cfg.enabled} onChange={(v) => updateTab({ enabled: v })} ariaLabel={enableLabel} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ocean-700 sm:max-w-[55%]">Choose whether all admins can use this view, or only selected admins.</p>
            <Segmented
              value={cfg.scopeMode}
              onChange={(v) => updateTab({ scopeMode: v })}
              leftLabel="All admins"
              leftValue="all"
              rightLabel="Exceptions"
              rightValue="exceptions"
              disabled={!cfg.enabled}
            />
          </div>

          {cfg.enabled && cfg.scopeMode === "exceptions" ? (
            <AdminExceptionPicker
              selectedAdminIds={cfg.selectedIds}
              onToggleAdmin={toggleAdmin}
              selectedNames={selectedNames}
              selectedCount={cfg.selectedIds.size}
              helper="Only these admins will see and work in this application module tab."
            />
          ) : null}

          <div className="rounded-xl border border-dashed border-ocean-200/90 bg-ocean-50/40 px-4 py-8 text-center">
            <p className="text-sm font-medium text-ocean-800">Content area</p>
            <p className="mt-1 text-xs text-ocean-600">
              {cfg.enabled ? "Module-specific settings and lists can be added here next." : "Turn on to configure access and show this section in the app."}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

