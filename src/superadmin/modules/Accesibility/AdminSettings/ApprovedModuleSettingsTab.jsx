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

const approvedSettings = [
  {
    key: "requireApprovalNotes",
    title: "Require approval notes",
    description: "Staff must enter notes before an approval can be finalized.",
  },
  {
    key: "autoApprovalReference",
    title: "Auto-generate approval reference number",
    description: "Assign a unique reference number when an application is approved.",
  },
  {
    key: "showApprovedDate",
    title: "Show approved date",
    description: "Display the approval timestamp on records and exports.",
  },
  {
    key: "allowEditingAfterApproval",
    title: "Allow editing after approval",
    description: "Permit supervised changes to approved records when corrections are needed.",
  },
  {
    key: "allowCancellationReversal",
    title: "Allow cancellation / reversal of approval",
    description: "Allow reversing an approval under controlled workflow rules.",
  },
  {
    key: "showReleaseStatus",
    title: "Show release status",
    description: "Track whether assistance or benefits have been released to the applicant.",
  },
  {
    key: "notifyApplicantApproved",
    title: "Notify applicant when approved",
    description: "Send in-app or email notification when status becomes approved.",
  },
  {
    key: "exportApprovedList",
    title: "Export approved list",
    description: "Allow admins to download or export the list of approved applications.",
  },
];

export function ApprovedModuleSettingsTab() {
  const [flags, setFlags] = useState(() =>
    Object.fromEntries(
      approvedSettings.map(({ key }) => [
        key,
        key === "allowEditingAfterApproval" || key === "allowCancellationReversal" ? false : true,
      ])
    )
  );

  const setFlag = (key, value) => setFlags((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Approved Module Settings</h3>
      <p className="text-sm text-ocean-700">
        Control how approvals are recorded, displayed, and communicated to applicants.
      </p>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Approval workflow</p>
        <p className="mt-1 text-xs text-ocean-700">Turn each option on or off for the approved module.</p>

        <div className="mt-3 divide-y divide-ocean-100">
          {approvedSettings.map(({ key, title, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">{title}</p>
                <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
              </div>
              <IosToggle checked={!!flags[key]} onChange={(v) => setFlag(key, v)} ariaLabel={title} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

