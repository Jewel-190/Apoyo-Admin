import { useState } from "react";
import {
  AccountManagementTab,
  AccountSecurityTab,
  ApplicationPreferencesTab,
  NotificationPreferencesTab,
  PrivacySettingsTab,
} from "./UserSettings/index.jsx";

const userTabs = [
  { id: "account-security", label: "Account Security", icon: "🔒", component: AccountSecurityTab },
  {
    id: "notification-preferences",
    label: "Notification Preferences",
    icon: "🔔",
    component: NotificationPreferencesTab,
  },
  {
    id: "application-preferences",
    label: "Application Preferences",
    icon: "📱",
    component: ApplicationPreferencesTab,
  },
  { id: "privacy-settings", label: "Privacy Settings", icon: "🔐", component: PrivacySettingsTab },
  { id: "account-management", label: "Account Management", icon: "👤", component: AccountManagementTab },
];

export function UserSettingsPage() {
  const [activeTab, setActiveTab] = useState(null);
  const activeItem = userTabs.find((item) => item.id === activeTab) ?? null;
  const ActiveTabComponent = activeItem?.component ?? null;

  return (
    <section className="-m-2 overflow-hidden rounded-[30px] border border-ocean-200 sm:-m-3 lg:-m-4">
      <div className="bg-gradient-to-b from-ocean-700 via-ocean-800 to-ocean-900 p-4">
        <div className="space-y-1">
          {userTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left text-ocean-100 transition hover:bg-white/10"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-lg bg-white/20 text-base">
                  {item.icon}
                </span>
                <span className="text-[15px] font-semibold">{item.label}</span>
              </span>
              <span className="text-ocean-200">›</span>
            </button>
          ))}
        </div>
      </div>

      {activeItem && ActiveTabComponent ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ocean-200 bg-white p-4 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">
                  User Settings
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-ocean-950">{activeItem.label}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab(null)}
                className="inline-flex h-9 items-center rounded-lg border border-ocean-200 bg-ocean-50 px-3 text-xs font-semibold text-ocean-700 transition hover:border-ocean-300 hover:bg-ocean-100"
              >
                Close
              </button>
            </div>
            <div className="mt-4">
              <ActiveTabComponent />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

