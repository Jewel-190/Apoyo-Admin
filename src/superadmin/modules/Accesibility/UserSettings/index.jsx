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
        disabled ? "cursor-not-allowed opacity-45" : ""
      } ${checked ? "bg-ocean-600" : "bg-ocean-200"}`}
    >
      <span
        className={`pointer-events-none absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function AccountManagementTab() {
  const accountManagementOptions = [
    {
      key: "deactivate",
      title: "Deactivate account",
      description: "Let users temporarily deactivate their account from the app.",
    },
    {
      key: "requestDeletion",
      title: "Request account deletion",
      description: "Allow users to submit a request to permanently delete their account.",
    },
    {
      key: "downloadInfo",
      title: "Download account information",
      description: "Enable self-service download of account details and activity summaries.",
    },
  ];

  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(accountManagementOptions.map(({ key }) => [key, true]))
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Account management</p>
        <p className="mt-1 text-xs text-ocean-700">
          Choose which self-service account actions users can use in the mobile app.
        </p>

        <div className="mt-3 divide-y divide-ocean-100">
          {accountManagementOptions.map(({ key, title, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">{title}</p>
                <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
              </div>
              <IosToggle
                checked={!!enabled[key]}
                onChange={(v) => setEnabled((prev) => ({ ...prev, [key]: v }))}
                ariaLabel={title}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AccountSecurityTab() {
  const editableProfileItems = [
    { key: "photo", title: "Profile photo", description: "Users may update their profile picture." },
    { key: "contact", title: "Contact number", description: "Mobile or phone number shown on the account." },
    { key: "email", title: "Email address", description: "Primary email used for login and notifications." },
    { key: "address", title: "Home address", description: "Residential address on file." },
  ];

  const securityActions = [
    { key: "changePassword", title: "Change password", description: "Self-service password update in the app." },
    { key: "recentLogins", title: "View recent login activity", description: "Show recent sessions and devices." },
    { key: "logoutAll", title: "Logout from all devices", description: "Allow signing out everywhere from settings." },
  ];

  const identityFields = [
    { key: "fullName", label: "Full name" },
    { key: "birthdate", label: "Birthdate" },
    { key: "voterId", label: "Voter ID" },
    { key: "barangay", label: "Barangay" },
  ];

  const [profileEditable, setProfileEditable] = useState(() =>
    Object.fromEntries(editableProfileItems.map(({ key }) => [key, true]))
  );
  const [securityAllowed, setSecurityAllowed] = useState(() =>
    Object.fromEntries(securityActions.map(({ key }) => [key, true]))
  );
  const [identityLocked, setIdentityLocked] = useState(() =>
    Object.fromEntries(identityFields.map(({ key }) => [key, true]))
  );
  const [pendingUnlockKey, setPendingUnlockKey] = useState(null);

  const pendingField = identityFields.find((f) => f.key === pendingUnlockKey);

  const confirmUnlock = () => {
    if (!pendingUnlockKey) return;
    setIdentityLocked((prev) => ({ ...prev, [pendingUnlockKey]: false }));
    setPendingUnlockKey(null);
  };

  return (
    <div className="relative space-y-4">
      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Profile fields users can edit</p>
        <p className="mt-1 text-xs text-ocean-700">
          Turn each option on to allow users to update these fields from their profile.
        </p>
        <div className="mt-2 divide-y divide-ocean-100">
          {editableProfileItems.map(({ key, title, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">{title}</p>
                <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
              </div>
              <IosToggle
                checked={!!profileEditable[key]}
                onChange={(v) => setProfileEditable((prev) => ({ ...prev, [key]: v }))}
                ariaLabel={`Allow editing ${title}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Security actions</p>
        <p className="mt-1 text-xs text-ocean-700">Allow or restrict these features for signed-in users.</p>
        <div className="mt-2 divide-y divide-ocean-100">
          {securityActions.map(({ key, title, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">{title}</p>
                <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
              </div>
              <IosToggle
                checked={!!securityAllowed[key]}
                onChange={(v) => setSecurityAllowed((prev) => ({ ...prev, [key]: v }))}
                ariaLabel={`Allow ${title}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Verified identity fields</p>
        <p className="mt-1 text-xs text-ocean-700">
          Keep verified data locked in the app; unlock only when a supervised correction is needed.
        </p>
        <ul className="mt-3 space-y-2">
          {identityFields.map(({ key, label }) => {
            const locked = identityLocked[key];
            return (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg border border-ocean-100 bg-ocean-50/50 px-3 py-2.5"
              >
                <span className="text-sm font-medium text-ocean-900">{label}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {locked ? (
                    <button
                      type="button"
                      onClick={() => setPendingUnlockKey(key)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ocean-200 bg-white px-2.5 py-1 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-50"
                      aria-label={`Unlock ${label}`}
                    >
                      <svg className="size-3.5 text-ocean-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Locked
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIdentityLocked((prev) => ({ ...prev, [key]: true }))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                      aria-label={`Lock ${label}`}
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M12 15v2M9 11V7a3 3 0 0 1 6 0v4" />
                      </svg>
                      Unlocked — Lock
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {pendingUnlockKey ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-unlock-title"
            className="w-full max-w-md rounded-2xl border border-ocean-200 bg-white p-5 shadow-xl"
          >
            <h4 id="user-unlock-title" className="text-lg font-semibold text-ocean-950">
              Unlock verified field?
            </h4>
            <p className="mt-2 text-sm text-ocean-700">
              You are about to unlock{" "}
              <span className="font-semibold text-ocean-900">{pendingField?.label}</span>. Editing verified identity data can cause mismatches with official records or voter verification.
            </p>
            <p className="mt-2 text-sm text-ocean-700">Only proceed if you intend a supervised correction.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingUnlockKey(null)}
                className="inline-flex h-10 items-center rounded-lg border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmUnlock}
                className="inline-flex h-10 items-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Unlock anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationPreferencesTab() {
  const channelsMeta = [
    { key: "email", label: "Email notifications", description: "Deliver updates to the user’s email address." },
    { key: "inApp", label: "In-app notifications", description: "Show alerts inside the mobile app." },
    { key: "sms", label: "SMS notifications", description: "Send short messages to the registered mobile number." },
  ];

  const notificationEvents = [
    { key: "registrationStatus", label: "Registration status" },
    { key: "verificationApproved", label: "Account verification approval" },
    { key: "applicationSubmitted", label: "Application submitted" },
    { key: "applicationApproved", label: "Application approved" },
    { key: "actionRequired", label: "Application opted for action required" },
    { key: "resubmissionRequested", label: "Resubmission requested" },
    { key: "scheduleReminders", label: "Schedule reminders" },
    { key: "announcements", label: "Announcements" },
  ];

  const [channelsEnabled, setChannelsEnabled] = useState({
    email: true,
    inApp: true,
    sms: false,
  });

  const [byEvent, setByEvent] = useState(() =>
    Object.fromEntries(notificationEvents.map(({ key }) => [key, { email: true, inApp: true, sms: false }]))
  );

  const toggleChannel = (channelKey, value) => {
    setChannelsEnabled((prev) => ({ ...prev, [channelKey]: value }));
    if (!value) {
      setByEvent((prev) => {
        const next = { ...prev };
        for (const { key } of notificationEvents) {
          next[key] = { ...next[key], [channelKey]: false };
        }
        return next;
      });
    }
  };

  const toggleCell = (eventKey, channelKey) => {
    if (!channelsEnabled[channelKey]) return;
    setByEvent((prev) => ({
      ...prev,
      [eventKey]: {
        ...prev[eventKey],
        [channelKey]: !prev[eventKey][channelKey],
      },
    }));
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Channels</p>
        <p className="mt-1 text-xs text-ocean-700">
          Turn channels on first; then choose which events use each channel below.
        </p>
        <div className="mt-3 divide-y divide-ocean-100">
          {channelsMeta.map(({ key, label, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">{label}</p>
                <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
              </div>
              <IosToggle checked={!!channelsEnabled[key]} onChange={(v) => toggleChannel(key, v)} ariaLabel={label} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Events</p>
        <p className="mt-1 text-xs text-ocean-700">
          For each row, choose Email, In-app, and SMS when those channels are enabled above.
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-ocean-300/80">
          <table className="w-full min-w-[340px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ocean-200 bg-ocean-50/90">
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
                  Event
                </th>
                {channelsMeta.map(({ key, label }) => (
                  <th
                    key={key}
                    className={`px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600 ${
                      !channelsEnabled[key] ? "opacity-40" : ""
                    }`}
                  >
                    <span className="hidden sm:inline">{label.replace(" notifications", "")}</span>
                    <span className="sm:hidden">{key === "inApp" ? "App" : label.charAt(0)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notificationEvents.map(({ key, label }) => (
                <tr key={key} className="border-b border-ocean-100 last:border-0">
                  <td className="max-w-[11rem] px-3 py-2.5 text-xs font-semibold text-ocean-900 sm:max-w-none sm:text-sm">
                    {label}
                  </td>
                  {channelsMeta.map(({ key: ch }) => {
                    const off = !channelsEnabled[ch];
                    const checked = !!byEvent[key]?.[ch];
                    return (
                      <td key={ch} className="px-2 py-2 text-center align-middle">
                        <label
                          className={`inline-flex justify-center ${
                            off ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked && !off}
                            disabled={off}
                            onChange={() => toggleCell(key, ch)}
                            className="size-4 rounded border-ocean-300 text-ocean-600 focus:ring-ocean-500 disabled:cursor-not-allowed"
                            aria-label={`${label} via ${ch}`}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ApplicationPreferencesTab() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ocean-700">
        Language, form density, and mobile-app defaults for applicants and users.
      </p>
    </div>
  );
}

export function PrivacySettingsTab() {
  const privacyOptions = [
    { key: "viewPolicy", title: "View privacy policy", description: "Let users open and read the privacy policy from the app." },
    { key: "consentProcessing", title: "Give consent to data processing", description: "Allow users to record consent for how their data is used." },
    { key: "contactAnnouncements", title: "Allow contact for announcements", description: "Permit outreach for important updates and program announcements." },
    { key: "downloadData", title: "Download personal data", description: "Enable self-service export of the user’s own data." },
  ];

  const [enabled, setEnabled] = useState(() =>
    Object.fromEntries(privacyOptions.map(({ key }) => [key, true]))
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Privacy settings</p>
        <p className="mt-1 text-xs text-ocean-700">
          Control which privacy and consent features are available to users in the mobile app.
        </p>

        <div className="mt-3 divide-y divide-ocean-100">
          {privacyOptions.map(({ key, title, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ocean-900">{title}</p>
                <p className="mt-0.5 text-xs text-ocean-700">{description}</p>
              </div>
              <IosToggle checked={!!enabled[key]} onChange={(v) => setEnabled((prev) => ({ ...prev, [key]: v }))} ariaLabel={title} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

