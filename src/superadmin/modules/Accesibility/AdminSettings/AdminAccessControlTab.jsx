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

function Segmented({ value, onChange, leftLabel, leftValue, rightLabel, rightValue }) {
  return (
    <div className="inline-flex rounded-xl border border-ocean-200 bg-ocean-50 p-1 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]">
      <button
        type="button"
        onClick={() => onChange(leftValue)}
        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
          value === leftValue ? "bg-ocean-700 text-white shadow-[0_8px_18px_-12px_rgba(8,74,118,0.9)]" : "text-ocean-700 hover:bg-white/60"
        }`}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange(rightValue)}
        className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
          value === rightValue ? "bg-ocean-700 text-white shadow-[0_8px_18px_-12px_rgba(8,74,118,0.9)]" : "text-ocean-700 hover:bg-white/60"
        }`}
      >
        {rightLabel}
      </button>
    </div>
  );
}

const modules = [
  { key: "application", label: "Allow access to Application" },
  { key: "scheduling", label: "Allow access to Scheduling" },
  { key: "caseStudy", label: "Allow access to Case Study" },
  { key: "reports", label: "Allow access to Reports" },
  { key: "activityLogs", label: "Allow access to Activity Logs" },
];

const demoAdmins = [
  { id: "admin-001", name: "Medical Assistance Admin", email: "admin1@apoyo.gov.ph" },
  { id: "admin-002", name: "Financial Assistance Admin", email: "admin2@apoyo.gov.ph" },
  { id: "admin-003", name: "Burial Assistance Admin", email: "admin3@apoyo.gov.ph" },
];

export function AdminAccessControlTab() {
  const [scopeMode, setScopeMode] = useState("all"); // 'all' | 'exceptions'
  const [selectedAdminIds, setSelectedAdminIds] = useState(() => new Set([demoAdmins[0]?.id].filter(Boolean)));
  const [enabledByModule, setEnabledByModule] = useState(() => Object.fromEntries(modules.map(({ key }) => [key, true])));

  const selectedCount = selectedAdminIds.size;
  const selectedNames = useMemo(() => {
    const map = new Map(demoAdmins.map((a) => [a.id, a.name]));
    return Array.from(selectedAdminIds).map((id) => map.get(id)).filter(Boolean).join(", ");
  }, [selectedAdminIds]);

  const toggleAdmin = (id) => {
    setSelectedAdminIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ocean-900">Scope</p>
            <p className="mt-0.5 text-xs text-ocean-700">Apply access rules to all admins, or choose specific admins (exceptions).</p>
          </div>
          <Segmented value={scopeMode} onChange={setScopeMode} leftLabel="All admins" leftValue="all" rightLabel="Exceptions" rightValue="exceptions" />
        </div>

        {scopeMode === "exceptions" ? (
          <div className="mt-4 rounded-xl border border-ocean-100 bg-gradient-to-b from-ocean-50/80 to-white/70 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ocean-600">Select admins</p>
                <p className="mt-1 text-xs text-ocean-700">Only the selected admins will receive access according to the toggles below.</p>
              </div>
              <div className="shrink-0 rounded-full border border-ocean-200 bg-white px-3 py-1 text-[11px] font-semibold text-ocean-700">
                {selectedCount} selected
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {demoAdmins.map((admin) => {
                const checked = selectedAdminIds.has(admin.id);
                return (
                  <button
                    key={admin.id}
                    type="button"
                    onClick={() => toggleAdmin(admin.id)}
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
        ) : null}
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Module access</p>
        <p className="mt-0.5 text-xs text-ocean-700">Turn access on or off per module.</p>

        <div className="mt-3 divide-y divide-ocean-100">
          {modules.map(({ key, label }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <p className="text-sm font-semibold text-ocean-900">{label}</p>
              <IosToggle
                checked={!!enabledByModule[key]}
                onChange={(value) => setEnabledByModule((prev) => ({ ...prev, [key]: value }))}
                ariaLabel={label}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

