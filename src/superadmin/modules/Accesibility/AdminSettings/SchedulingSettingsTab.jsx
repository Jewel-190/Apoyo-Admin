/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from "react";

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

const SCHEDULE_ADMINS = [
  { id: "admin-001", name: "Medical Assistance Admin", email: "admin1@apoyo.gov.ph" },
  { id: "admin-002", name: "Financial Assistance Admin", email: "admin2@apoyo.gov.ph" },
  { id: "admin-003", name: "Burial Assistance Admin", email: "admin3@apoyo.gov.ph" },
];

const ALL_IDS = new Set(SCHEDULE_ADMINS.map((a) => a.id));

function intersectSet(set, allowedIds) {
  const next = new Set();
  for (const id of set) {
    if (allowedIds.has(id)) next.add(id);
  }
  return next;
}

function FilteredAdminPicker({ eligibleIds, selectedIds, onToggle, helper, emptyEligibleMessage }) {
  const admins = SCHEDULE_ADMINS.filter((a) => eligibleIds.has(a.id));
  const selectedNames = SCHEDULE_ADMINS.filter((a) => selectedIds.has(a.id))
    .map((a) => a.name)
    .join(", ");
  const selectedCount = admins.filter((a) => selectedIds.has(a.id)).length;

  if (eligibleIds.size === 0) {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
        {emptyEligibleMessage ?? "No admins are available here yet. Adjust the selections above."}
      </div>
    );
  }

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
        {admins.map((admin) => {
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

function PermissionCard({
  title,
  description,
  checked,
  onCheckedChange,
  toggleDisabled = false,
  scopeMode,
  onScopeChange,
  selectedIds,
  onToggleAdmin,
  eligibleIds,
  showExceptionPicker,
  extra,
  segmentHint,
  pickerHelper,
  emptyEligibleMessage,
}) {
  const segmentDisabled = toggleDisabled || !checked;
  return (
    <div className="rounded-xl border border-ocean-100 bg-ocean-50/60 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ocean-900">{title}</p>
          <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
          {extra ? <div className="mt-2">{extra}</div> : null}
        </div>
        <IosToggle checked={checked} onChange={onCheckedChange} disabled={toggleDisabled} ariaLabel={title} />
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ocean-700 sm:max-w-[55%]">
          {segmentHint ??
            "Apply to every admin, or limit to selected admins (only admins not chosen for the module above appear here)."}
        </p>
        <Segmented
          value={scopeMode}
          onChange={onScopeChange}
          leftLabel="All admins"
          leftValue="all"
          rightLabel="Exceptions"
          rightValue="exceptions"
          disabled={segmentDisabled}
        />
      </div>

      {!toggleDisabled && checked && scopeMode === "exceptions" && showExceptionPicker ? (
        <FilteredAdminPicker
          eligibleIds={eligibleIds}
          selectedIds={selectedIds}
          onToggle={onToggleAdmin}
          helper={
            pickerHelper ??
            "Choose admins from this list. It only includes admins who were not selected for Enable scheduling module (Exceptions)."
          }
          emptyEligibleMessage={emptyEligibleMessage}
        />
      ) : null}
    </div>
  );
}

export function SchedulingSettingsTab() {
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [moduleScope, setModuleScope] = useState("exceptions");
  const [moduleSelected, setModuleSelected] = useState(() => new Set(["admin-001"]));

  const [createEnabled, setCreateEnabled] = useState(true);
  const [createScope, setCreateScope] = useState("all");
  const [createSelected, setCreateSelected] = useState(() => new Set(SCHEDULE_ADMINS.map((a) => a.id)));
  const [createEffectiveDate, setCreateEffectiveDate] = useState("");

  const [editEnabled, setEditEnabled] = useState(true);
  const [editScope, setEditScope] = useState("all");
  const [editSelected, setEditSelected] = useState(() => new Set(SCHEDULE_ADMINS.map((a) => a.id)));

  const [cancelEnabled, setCancelEnabled] = useState(true);
  const [cancelScope, setCancelScope] = useState("all");
  const [cancelSelected, setCancelSelected] = useState(() => new Set(SCHEDULE_ADMINS.map((a) => a.id)));

  const [daysEnabled, setDaysEnabled] = useState(true);
  const [daysScope, setDaysScope] = useState("all");
  const [daysSelected, setDaysSelected] = useState(() => new Set(SCHEDULE_ADMINS.map((a) => a.id)));
  const [availableDaysDate, setAvailableDaysDate] = useState("");

  const [officeStart, setOfficeStart] = useState("08:00");
  const [officeEnd, setOfficeEnd] = useState("17:00");
  const [maxDaily, setMaxDaily] = useState(20);
  const [applicantReschedule, setApplicantReschedule] = useState(false);
  const [scheduleReminders, setScheduleReminders] = useState(true);

  const eligibleFromMaster = useMemo(() => {
    if (!moduleEnabled) return new Set();
    if (moduleScope === "all") return ALL_IDS;
    const complement = new Set();
    for (const id of ALL_IDS) {
      if (!moduleSelected.has(id)) complement.add(id);
    }
    return complement;
  }, [moduleEnabled, moduleScope, moduleSelected]);

  const downstreamEmptyMessage =
    moduleScope === "exceptions" && moduleSelected.size >= ALL_IDS.size
      ? "Every admin is selected for Enable scheduling module above. Deselect at least one admin there so they can appear in these exception lists."
      : "No admins are available for this exception yet. Check Enable scheduling module (Exceptions) above.";

  const pruneToEligible = useCallback((set) => intersectSet(set, eligibleFromMaster), [eligibleFromMaster]);

  const toggleInSet = useCallback((setter, id) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const syncChildrenToEligible = useCallback(() => {
    setCreateSelected((s) => pruneToEligible(s));
    setEditSelected((s) => pruneToEligible(s));
    setCancelSelected((s) => pruneToEligible(s));
    setDaysSelected((s) => pruneToEligible(s));
  }, [pruneToEligible]);

  useEffect(() => {
    syncChildrenToEligible();
  }, [eligibleFromMaster, syncChildrenToEligible]);

  const configDisabled = !moduleEnabled || (moduleScope === "exceptions" && eligibleFromMaster.size === 0);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Scheduling access</p>
        <p className="mt-0.5 text-xs text-ocean-700">
          Under <span className="font-semibold">Exceptions</span> on the module row, admins you{" "}
          <span className="font-semibold">select</span> get scheduling module access. On rows below,{" "}
          <span className="font-semibold">Exceptions</span> only lists admins you{" "}
          <span className="font-semibold">did not</span> select there. With{" "}
          <span className="font-semibold">All admins</span> on the module row, everyone appears below.
        </p>

        <div className="mt-4 space-y-4">
          <PermissionCard
            title="Enable scheduling module"
            description="Master switch for scheduling features. Turn off to disable everything below."
            checked={moduleEnabled}
            onCheckedChange={setModuleEnabled}
            scopeMode={moduleScope}
            onScopeChange={setModuleScope}
            selectedIds={moduleSelected}
            onToggleAdmin={(id) => toggleInSet(setModuleSelected, id)}
            eligibleIds={ALL_IDS}
            showExceptionPicker
            segmentHint="Apply the scheduling module to all admins, or choose specific admins who may use it."
            pickerHelper="These admins receive access to the scheduling module."
          />

          <PermissionCard
            title="Allow admins to create schedules"
            description="Control who can add new schedules. Optional effective date for policy changes."
            checked={createEnabled}
            onCheckedChange={setCreateEnabled}
            toggleDisabled={!moduleEnabled}
            scopeMode={createScope}
            onScopeChange={setCreateScope}
            selectedIds={createSelected}
            onToggleAdmin={(id) => toggleInSet(setCreateSelected, id)}
            eligibleIds={eligibleFromMaster}
            showExceptionPicker={moduleEnabled}
            emptyEligibleMessage={downstreamEmptyMessage}
            extra={
              createEnabled && moduleEnabled ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ocean-700">
                  Effective date (optional)
                  <input
                    type="date"
                    value={createEffectiveDate}
                    onChange={(e) => setCreateEffectiveDate(e.target.value)}
                    className="h-10 max-w-[12rem] rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
                  />
                </label>
              ) : null
            }
          />

          <PermissionCard
            title="Allow editing schedules"
            description="Who can change existing schedules after they are created."
            checked={editEnabled}
            onCheckedChange={setEditEnabled}
            toggleDisabled={!moduleEnabled}
            scopeMode={editScope}
            onScopeChange={setEditScope}
            selectedIds={editSelected}
            onToggleAdmin={(id) => toggleInSet(setEditSelected, id)}
            eligibleIds={eligibleFromMaster}
            showExceptionPicker={moduleEnabled}
            emptyEligibleMessage={downstreamEmptyMessage}
          />

          <PermissionCard
            title="Allow cancellation of schedules"
            description="Who can cancel or void scheduled appointments."
            checked={cancelEnabled}
            onCheckedChange={setCancelEnabled}
            toggleDisabled={!moduleEnabled}
            scopeMode={cancelScope}
            onScopeChange={setCancelScope}
            selectedIds={cancelSelected}
            onToggleAdmin={(id) => toggleInSet(setCancelSelected, id)}
            eligibleIds={eligibleFromMaster}
            showExceptionPicker={moduleEnabled}
            emptyEligibleMessage={downstreamEmptyMessage}
          />

          <PermissionCard
            title="Set available schedule days"
            description="Choose which calendar days accept bookings using the date picker."
            checked={daysEnabled}
            onCheckedChange={setDaysEnabled}
            toggleDisabled={!moduleEnabled}
            scopeMode={daysScope}
            onScopeChange={setDaysScope}
            selectedIds={daysSelected}
            onToggleAdmin={(id) => toggleInSet(setDaysSelected, id)}
            eligibleIds={eligibleFromMaster}
            showExceptionPicker={moduleEnabled}
            emptyEligibleMessage={downstreamEmptyMessage}
            extra={
              daysEnabled && moduleEnabled ? (
                <label className="flex flex-col gap-1 text-xs font-semibold text-ocean-700">
                  Date
                  <input
                    type="date"
                    value={availableDaysDate}
                    onChange={(e) => setAvailableDaysDate(e.target.value)}
                    className="h-10 min-w-[10.5rem] rounded-lg border border-ocean-200 bg-white px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
                  />
                </label>
              ) : null
            }
          />
        </div>
      </section>

      <section className={`rounded-xl border border-ocean-200 bg-white/80 p-4 ${configDisabled ? "opacity-55" : ""}`}>
        <p className="text-sm font-semibold text-ocean-900">Scheduling rules</p>
        <p className="mt-0.5 text-xs text-ocean-700">Office hours, capacity, and applicant-facing options.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
            Office start
            <input
              type="time"
              value={officeStart}
              onChange={(e) => setOfficeStart(e.target.value)}
              disabled={configDisabled}
              className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium normal-case tracking-normal text-ocean-900 outline-none focus:border-ocean-400 disabled:cursor-not-allowed"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
            Office end
            <input
              type="time"
              value={officeEnd}
              onChange={(e) => setOfficeEnd(e.target.value)}
              disabled={configDisabled}
              className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium normal-case tracking-normal text-ocean-900 outline-none focus:border-ocean-400 disabled:cursor-not-allowed"
            />
          </label>
        </div>

        <label className="mt-4 block space-y-1 text-sm font-semibold text-ocean-900">
          Maximum daily bookings
          <input
            type="number"
            min={1}
            max={999}
            value={maxDaily}
            onChange={(e) => setMaxDaily(Number(e.target.value) || 1)}
            disabled={configDisabled}
            className="h-10 w-full max-w-[12rem] rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 disabled:cursor-not-allowed"
          />
        </label>

        <div className="mt-4 flex items-start justify-between gap-4 rounded-xl border border-ocean-100 bg-ocean-50/50 px-3 py-3">
          <div>
            <p className="text-sm font-semibold text-ocean-900">Enable applicant rescheduling</p>
            <p className="mt-0.5 text-xs text-ocean-700">Let users propose a new slot from the mobile app.</p>
          </div>
          <IosToggle checked={applicantReschedule} onChange={setApplicantReschedule} disabled={configDisabled} ariaLabel="Enable applicant rescheduling" />
        </div>

        <div className="mt-3 flex items-start justify-between gap-4 rounded-xl border border-ocean-100 bg-ocean-50/50 px-3 py-3">
          <div>
            <p className="text-sm font-semibold text-ocean-900">Enable schedule reminders</p>
            <p className="mt-0.5 text-xs text-ocean-700">Send reminders before upcoming appointments.</p>
          </div>
          <IosToggle checked={scheduleReminders} onChange={setScheduleReminders} disabled={configDisabled} ariaLabel="Enable schedule reminders" />
        </div>
      </section>
    </div>
  );
}

