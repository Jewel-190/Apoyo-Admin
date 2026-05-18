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

export function NotificationsTab() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [notifyOnRegistration, setNotifyOnRegistration] = useState(true);
  const [notifyOnVerification, setNotifyOnVerification] = useState(true);
  const [notifyOnSubmission, setNotifyOnSubmission] = useState(true);
  const [notifyOnApproval, setNotifyOnApproval] = useState(true);
  const [bannerEnabled, setBannerEnabled] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");
  const [lastAnnouncement, setLastAnnouncement] = useState("");

  const handleSendAnnouncement = () => {
    const trimmed = announcementText.trim();
    if (!trimmed) return;
    setLastAnnouncement(trimmed);
    setAnnouncementText("");
  };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Notifications</h3>
      <p className="text-sm text-ocean-700">
        Choose which events send notifications and how announcements appear in the mobile app.
      </p>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Channels</p>
        <p className="mt-1 text-xs text-ocean-700">Turn on the channels users will receive messages from.</p>

        <div className="mt-3 divide-y divide-ocean-100">
          <ToggleRow
            title="Enable email notifications"
            description="Send emails for key status updates and announcements."
            checked={emailEnabled}
            onChange={setEmailEnabled}
          />
          <ToggleRow
            title="Enable in-app notifications"
            description="Show alerts inside the mobile app notification center."
            checked={inAppEnabled}
            onChange={setInAppEnabled}
          />
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Notification triggers</p>
        <p className="mt-1 text-xs text-ocean-700">Decide which events automatically send notifications to users.</p>

        <div className="mt-3 divide-y divide-ocean-100">
          <ToggleRow
            title="Notify on registration"
            description="Send a welcome message when a user first registers."
            checked={notifyOnRegistration}
            onChange={setNotifyOnRegistration}
          />
          <ToggleRow
            title="Notify on verification"
            description="Let users know when their identity has been verified."
            checked={notifyOnVerification}
            onChange={setNotifyOnVerification}
          />
          <ToggleRow
            title="Notify on application submission"
            description="Confirm that an application was received."
            checked={notifyOnSubmission}
            onChange={setNotifyOnSubmission}
          />
          <ToggleRow
            title="Notify on application approval"
            description="Send a notification when an application is approved."
            checked={notifyOnApproval}
            onChange={setNotifyOnApproval}
          />
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ocean-900">Enable announcement banner</p>
              <p className="mt-0.5 text-xs text-ocean-700">
                Turn on a persistent banner at the top of the mobile app for important updates.
              </p>
            </div>
            <IosToggle checked={bannerEnabled} onChange={setBannerEnabled} ariaLabel="Enable announcement banner" />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-[0.1em] text-ocean-600">
              Announcement message
            </label>
            <textarea
              rows={3}
              value={announcementText}
              onChange={(event) => setAnnouncementText(event.target.value)}
              className="w-full rounded-xl border border-ocean-200 bg-ocean-50/80 p-2.5 text-sm text-ocean-900 outline-none focus:border-ocean-400"
              placeholder="Type an announcement to send to users…"
            />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-ocean-600">
                Keep announcements short. Newest message replaces the previous banner.
              </p>
              <button
                type="button"
                onClick={handleSendAnnouncement}
                disabled={!announcementText.trim()}
                className="inline-flex h-9 items-center justify-center rounded-full bg-ocean-600 px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:bg-ocean-300 sm:self-end"
              >
                Send announcement
              </button>
            </div>
          </div>

          {lastAnnouncement ? (
            <div className="rounded-lg border border-ocean-100 bg-ocean-50/60 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-600">Last sent announcement</p>
              <p className="mt-1 text-sm text-ocean-900">{lastAnnouncement}</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

