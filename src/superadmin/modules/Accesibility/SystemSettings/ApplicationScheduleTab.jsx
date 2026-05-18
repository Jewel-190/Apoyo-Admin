import { useState } from "react";

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

export function ApplicationScheduleTab() {
  const [allowYearRound, setAllowYearRound] = useState(false);
  const [modifyGrace, setModifyGrace] = useState(false);
  const [graceDays, setGraceDays] = useState(7);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Application Schedule</h3>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Scheduling rules</p>
        <p className="mt-1 text-xs text-ocean-700">
          Configure when users can submit applications and how long changes are allowed around deadlines.
        </p>

        <div className="mt-3 space-y-3 divide-y divide-ocean-100">
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ocean-900">Allow year-round applications</p>
              <p className="mt-0.5 text-xs text-ocean-700">
                Keep application intake open all year instead of specific campaign dates.
              </p>
            </div>
            <IosToggle checked={allowYearRound} onChange={setAllowYearRound} ariaLabel="Allow year-round applications" />
          </div>

          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ocean-900">Modify grace period</p>
              <p className="mt-0.5 text-xs text-ocean-700">
                Allow applicants to edit or submit shortly after the official deadline, within a set number of days.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <IosToggle checked={modifyGrace} onChange={setModifyGrace} ariaLabel="Modify grace period" />
              <div className="inline-flex items-center gap-2 rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 py-1.5">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={graceDays}
                  onChange={(event) => setGraceDays(Number(event.target.value) || 1)}
                  disabled={!modifyGrace}
                  className="h-8 w-16 rounded-md border border-ocean-200 bg-white px-2 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Grace period in days"
                />
                <span className="text-xs font-medium text-ocean-700">days</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

