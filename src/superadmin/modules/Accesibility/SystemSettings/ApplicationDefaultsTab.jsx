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

export function ApplicationDefaultsTab() {
  const [allowMultipleApplications, setAllowMultipleApplications] = useState(false);
  const [allowMultipleSameBenefit, setAllowMultipleSameBenefit] = useState(false);
  const [cooldownEnabled, setCooldownEnabled] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState("");
  const [maxApplicationsPerUser, setMaxApplicationsPerUser] = useState(1);
  const [allowResubmissionRejected, setAllowResubmissionRejected] = useState(false);
  const [allowEditingWhilePending, setAllowEditingWhilePending] = useState(false);
  const [requireSupportingDocuments, setRequireSupportingDocuments] = useState(true);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Application Defaults</h3>
      <p className="text-sm text-ocean-700">Control how users can submit applications, limits, and required materials.</p>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Submission rules</p>
        <p className="mt-1 text-xs text-ocean-700">Platform-wide defaults for new applications in the mobile app.</p>

        <div className="mt-3 divide-y divide-ocean-100">
          <ToggleRow
            title="Allow multiple applications"
            description="Users can have more than one active application on file."
            checked={allowMultipleApplications}
            onChange={setAllowMultipleApplications}
          />
          <ToggleRow
            title="Allow multiple applications for the same benefit"
            description="Permit separate applications targeting the same benefit type when allowed above."
            checked={allowMultipleSameBenefit}
            onChange={setAllowMultipleSameBenefit}
          />

          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ocean-900">Application cooldown</p>
              <p className="mt-0.5 text-xs text-ocean-700">
                Enforce a waiting period before another application; set the date when users become eligible again.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
              <IosToggle checked={cooldownEnabled} onChange={setCooldownEnabled} ariaLabel="Application cooldown" />
              <input
                type="date"
                value={cooldownUntil}
                onChange={(e) => setCooldownUntil(e.target.value)}
                disabled={!cooldownEnabled}
                className="h-10 min-w-[10.5rem] rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Cooldown eligible date"
              />
            </div>
          </div>

          <div className="py-3">
            <label className="block text-sm font-semibold text-ocean-900">
              Maximum applications per user
              <p className="mt-0.5 text-xs font-medium text-ocean-700">
                Cap how many applications a single account may submit over the configured window.
              </p>
              <input
                type="number"
                min={1}
                max={999}
                value={maxApplicationsPerUser}
                onChange={(e) => setMaxApplicationsPerUser(Number(e.target.value) || 1)}
                className="mt-2 h-10 w-full max-w-[12rem] rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
              />
            </label>
          </div>

          <ToggleRow
            title="Allow resubmission of rejected documents"
            description="Let users file again after a decision of rejected."
            checked={allowResubmissionRejected}
            onChange={setAllowResubmissionRejected}
          />
          <ToggleRow
            title="Allow editing while pending"
            description="Applicants can change answers or attachments before a decision is issued."
            checked={allowEditingWhilePending}
            onChange={setAllowEditingWhilePending}
          />
          <ToggleRow
            title="Require supporting documents"
            description="Uploads are mandatory before submission can be completed."
            checked={requireSupportingDocuments}
            onChange={setRequireSupportingDocuments}
          />
        </div>
      </section>
    </div>
  );
}

