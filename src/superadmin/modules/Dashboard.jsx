import { useState } from "react";

const FILTER_OPTIONS = ["Day", "Month", "Year"];

const TimeFilter = ({ value, onChange }) => (
  <label className="inline-flex items-center gap-2 rounded-lg border border-ocean-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ocean-700">
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-md border border-ocean-200 bg-ocean-50 px-2 py-1 text-xs font-semibold text-ocean-800 outline-none focus:border-ocean-400"
    >
      {FILTER_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

const BellIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
    <path d="M9 17a3 3 0 0 0 6 0" />
  </svg>
);

const metricCards = [
  { title: "New Registrations", value: "--", helper: "Placeholder: users created this month" },
  { title: "Total Accounts", value: "--", helper: "Placeholder: combined users and admins" },
  { title: "Active Users", value: "--", helper: "Placeholder: active versus inactive split" },
  { title: "Benefits Published", value: "--", helper: "Placeholder: live benefits count" },
];

const analyticsCards = [
  { title: "Benefits Distribution", helper: "Placeholder: daily, weekly, monthly, yearly trends" },
  { title: "Most Applied Benefit", helper: "Placeholder: top categories by applications" },
  { title: "Benefit Reuse Frequency", helper: "Placeholder: how often benefits are claimed" },
  { title: "Approved Applications", helper: "Placeholder: total approved requests" },
  { title: "Disbursed Applications", helper: "Placeholder: processed and disbursed requests" },
  { title: "Approval Rate", helper: "Placeholder: approved versus total applications" },
  { title: "Application Status Mix", helper: "Placeholder: pending, approved, disbursed" },
  { title: "Processing Time", helper: "Placeholder: average end-to-end processing duration" },
  { title: "Applicant Segments", helper: "Placeholder: repeat, first-time, and top branches" },
];

export function DashboardPage() {
  const [globalFilter, setGlobalFilter] = useState("Month");

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-2xl">
          <input
            type="text"
            placeholder="Search users, reports, settings..."
            className="h-12 w-full rounded-xl border border-ocean-200 bg-white pl-12 pr-4 text-sm text-ocean-900 shadow-sm outline-none placeholder:text-ocean-500/70 focus:border-ocean-400"
          />
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ocean-500">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="m21 21-4.3-4.3" />
              <circle cx="11" cy="11" r="7" />
            </svg>
          </span>
        </div>
        <div className="flex items-center gap-3 self-end lg:self-auto">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-ocean-200 bg-white px-4 text-sm font-semibold text-ocean-800 shadow-sm transition hover:border-ocean-300 hover:bg-ocean-50"
          >
            <BellIcon />
            Notifications
          </button>
          <div className="hidden rounded-xl border border-ocean-200 bg-white px-3 py-2 text-xs font-semibold text-ocean-700 sm:block">
            Last updated: --:--
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ocean-950">Dashboard Overview</h2>
          <span className="text-xs font-medium text-ocean-600">Placeholder data</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ocean-700">{card.title}</p>
                <TimeFilter value={globalFilter} onChange={setGlobalFilter} />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-ocean-950">{card.value}</p>
              <p className="mt-3 text-xs leading-relaxed text-ocean-600">{card.helper}</p>
              <div className="mt-4 h-1.5 rounded-full bg-ocean-100">
                <div className="h-1.5 w-1/3 rounded-full bg-ocean-400" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <article className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ocean-900">User Growth Chart</h3>
            <TimeFilter value={globalFilter} onChange={setGlobalFilter} />
          </div>
          <div className="mt-5 grid h-48 place-items-center rounded-xl border border-dashed border-ocean-200 bg-ocean-50 text-center">
            <p className="text-sm font-medium text-ocean-700">
              Chart Placeholder
              <br />
              Add line or area chart component here.
            </p>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-ocean-600">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-ocean-400" />
              New users
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-ocean-700" />
              Active users
            </span>
          </div>
        </article>

        <article className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ocean-900">Quick Status</h3>
            <TimeFilter value={globalFilter} onChange={setGlobalFilter} />
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl bg-ocean-50 p-3">
              <p className="text-xs text-ocean-700">Pending reviews</p>
              <p className="text-xl font-semibold text-ocean-950">--</p>
            </div>
            <div className="rounded-xl bg-ocean-50 p-3">
              <p className="text-xs text-ocean-700">Approved today</p>
              <p className="text-xl font-semibold text-ocean-950">--</p>
            </div>
            <div className="rounded-xl bg-ocean-50 p-3">
              <p className="text-xs text-ocean-700">Escalated cases</p>
              <p className="text-xl font-semibold text-ocean-950">--</p>
            </div>
          </div>
        </article>
      </section>

      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ocean-950">Analytics</h2>
          <span className="text-xs font-medium text-ocean-600">Professional placeholder blocks</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {analyticsCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-ocean-200 bg-white p-5 shadow-[0_12px_30px_-24px_rgba(10,70,111,0.7)]"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ocean-900">{card.title}</h3>
                <TimeFilter value={globalFilter} onChange={setGlobalFilter} />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ocean-600">{card.helper}</p>
              <div className="mt-4 h-24 rounded-lg border border-dashed border-ocean-200 bg-ocean-50/80 px-3 py-2">
                <p className="text-xs text-ocean-600">Visualization Placeholder</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

