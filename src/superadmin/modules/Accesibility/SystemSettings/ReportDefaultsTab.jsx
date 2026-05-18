import { useState } from "react";

function IosToggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 rounded-full transition-colors ${
        checked ? "bg-ocean-600" : "bg-ocean-200"
      }`}
    >
      <span
        className={`pointer-events-none absolute left-1 top-1 size-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ToggleRow({ title, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ocean-900">{title}</p>
        {description ? <p className="mt-0.5 text-xs text-ocean-700">{description}</p> : null}
      </div>
      <IosToggle checked={checked} onChange={onChange} ariaLabel={title} />
    </div>
  );
}

export function ReportDefaultsTab() {
  const [showLogo, setShowLogo] = useState(true);
  const [showOfficeName, setShowOfficeName] = useState(true);
  const [showReferenceNumber, setShowReferenceNumber] = useState(true);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Report Defaults</h3>
      <p className="text-sm text-ocean-700">
        Control what appears on generated reports so printed and exported copies are consistent.
      </p>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Visibility options</p>
        <p className="mt-1 text-xs text-ocean-700">Choose which elements are shown by default on all reports.</p>

        <div className="mt-3 divide-y divide-ocean-100">
          <ToggleRow
            title="Show logo on reports"
            description="Display the LGU or office logo at the top of each report."
            checked={showLogo}
            onChange={setShowLogo}
          />
          <ToggleRow
            title="Show office name on reports"
            description="Include the issuing office name under the report title."
            checked={showOfficeName}
            onChange={setShowOfficeName}
          />
          <ToggleRow
            title="Show reference number in reports"
            description="Print a tracking or reference number on each generated report."
            checked={showReferenceNumber}
            onChange={setShowReferenceNumber}
          />
        </div>
      </section>
    </div>
  );
}

