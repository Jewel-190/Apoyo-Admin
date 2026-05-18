import { ChevronLeft, CheckCircle2, ListChecks } from "lucide-react";
import { detailFont } from "./forApprovalDetailStyles";

export function DetailBackButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-6 inline-flex items-center gap-2 rounded-xl border border-gray-200/90 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-[#06C1EC]/45 hover:bg-cyan-50/80 hover:text-[#008B88] hover:shadow-md"
    >
      <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
      {label}
    </button>
  );
}

export function DetailHero({ badge, title, meta }) {
  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_4px_28px_-10px_rgba(0,139,136,0.22)] md:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#008B88] via-[#06C1EC] to-[#008B88]" aria-hidden />
      <div className="pt-2">
        {badge}
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 md:text-[1.65rem]" style={detailFont}>
          {title}
        </h1>
        {meta ? <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">{meta}</p> : null}
      </div>
    </div>
  );
}

export function DetailStatusChip({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-[#008B88]/10 to-[#06C1EC]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#008B88] ring-1 ring-[#008B88]/20">
      {children}
    </span>
  );
}

export function DetailSectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="h-full rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_18px_-8px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_8px_28px_-12px_rgba(0,139,136,0.15)] md:p-6">
      <div className="mb-5 flex items-start gap-3 border-b border-gray-100 pb-4">
        {Icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#008B88]/14 to-[#06C1EC]/14 text-[#008B88] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <Icon size={22} strokeWidth={2} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 md:text-xl" style={detailFont}>
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function DetailFieldsGrid({ rows }) {
  return (
    <div className="grid gap-2.5">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`rounded-xl border px-4 py-3.5 transition-all hover:border-[#06C1EC]/30 ${
            i % 2 === 0
              ? "border-transparent bg-gradient-to-br from-gray-50 to-gray-100/70"
              : "border-gray-100 bg-white shadow-sm"
          }`}
        >
          <span className="block text-[11px] font-bold uppercase tracking-wider text-[#008B88]">{row.label}</span>
          <span className="mt-1 block text-sm font-medium leading-relaxed text-gray-800">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DetailActionsPanel({ children }) {
  return (
    <div className="space-y-5 rounded-2xl border border-gray-100 bg-gradient-to-b from-white via-cyan-50/40 to-teal-50/30 p-5 shadow-[0_2px_20px_-10px_rgba(0,139,136,0.18)] md:p-6">
      {children}
    </div>
  );
}

export function InterviewInstructions({ applicationId }) {
  return (
    <div className="rounded-2xl border border-[#008B88]/15 bg-gradient-to-br from-[#008B88]/5 via-white to-[#06C1EC]/10 p-5 shadow-inner md:p-6">
      <div className="mb-4 flex items-center gap-2 border-b border-[#008B88]/10 pb-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#008B88] shadow-sm ring-1 ring-[#008B88]/15">
          <ListChecks size={18} strokeWidth={2} />
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-gray-900" style={detailFont}>
            Instructions
          </h3>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#008B88]/80">Applicant briefing</p>
        </div>
      </div>
      <ul className="space-y-4 text-sm leading-relaxed text-gray-600">
        <li className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#008B88]" strokeWidth={2} aria-hidden />
          <div>
            <span className="font-semibold text-gray-800">Step 1:</span> Visit the Socio-Economic and Multi-Purpose
            Building Barangay Burol Main, City of Dasmariñas, Cavite
          </div>
        </li>
        <li className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#06C1EC]" strokeWidth={2} aria-hidden />
          <div>
            <span className="font-semibold text-gray-800">Step 2:</span> Present your Application Number:{" "}
            <strong className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[#008B88] ring-1 ring-gray-200">
              {applicationId}
            </strong>
          </div>
        </li>
        <li className="flex gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#008B88]" strokeWidth={2} aria-hidden />
          <div>
            <span className="font-semibold text-gray-800">Step 3:</span> Bring one (1) Original Valid ID for
            verification.
          </div>
        </li>
      </ul>
      <p className="mt-6 rounded-lg bg-white/60 px-3 py-2 text-xs font-medium text-gray-500 ring-1 ring-gray-100">
        Office Hours: Monday - Friday, 8:00 AM to 5:00 PM.
      </p>
    </div>
  );
}
