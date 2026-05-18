import { useState } from "react";

export function LocalizationTab() {
  const [mobileLanguage, setMobileLanguage] = useState("english");
  const [schedulingDate, setSchedulingDate] = useState("");
  const [officeStart, setOfficeStart] = useState("08:00");
  const [officeEnd, setOfficeEnd] = useState("17:00");

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-ocean-900">Localization</h3>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Default Language (Mobile App)</p>
        <p className="mt-1 text-xs text-ocean-700">Choose the default language shown when users open the mobile app.</p>
        <div className="mt-3 inline-flex rounded-lg border border-ocean-200 bg-ocean-50 p-1">
          <button
            type="button"
            onClick={() => setMobileLanguage("english")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mobileLanguage === "english" ? "bg-ocean-600 text-white shadow-sm" : "text-ocean-700"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setMobileLanguage("filipino")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              mobileLanguage === "filipino" ? "bg-ocean-600 text-white shadow-sm" : "text-ocean-700"
            }`}
          >
            Filipino
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <label className="space-y-1.5 text-sm font-semibold text-ocean-900">
          Scheduling Date
          <p className="text-xs font-medium text-ocean-700">Set the target date for Scheduling Interview.</p>
          <input
            type="date"
            value={schedulingDate}
            onChange={(event) => setSchedulingDate(event.target.value)}
            className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium text-ocean-900 outline-none focus:border-ocean-400"
          />
        </label>
      </section>

      <section className="rounded-xl border border-ocean-200 bg-white/80 p-4">
        <p className="text-sm font-semibold text-ocean-900">Office Hours</p>
        <p className="mt-1 text-xs text-ocean-700">Set when the office is open for public operations.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
            Start Time
            <input
              type="time"
              value={officeStart}
              onChange={(event) => setOfficeStart(event.target.value)}
              className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium normal-case tracking-normal text-ocean-900 outline-none focus:border-ocean-400"
            />
          </label>
          <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.08em] text-ocean-600">
            End Time
            <input
              type="time"
              value={officeEnd}
              onChange={(event) => setOfficeEnd(event.target.value)}
              className="h-10 w-full rounded-lg border border-ocean-200 bg-ocean-50/70 px-3 text-sm font-medium normal-case tracking-normal text-ocean-900 outline-none focus:border-ocean-400"
            />
          </label>
        </div>
      </section>
    </div>
  );
}

