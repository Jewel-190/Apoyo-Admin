import { ChevronLeft, CheckCircle2, ListChecks } from "lucide-react";
import { detailFont } from "./forApprovalDetailStyles";
import { useScopeSettings } from "../../shared/context/SettingsContext";
import {
  INTERVIEW_SCHEDULING_DEFAULTS,
  INTERVIEW_SCHEDULING_KEY,
  formatOfficeHoursLabel,
  isApplicationNumberStep,
  normalizeInterviewScheduling,
} from "../../shared/lib/interviewScheduling";

export function DetailBackButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group mb-6 inline-flex items-center gap-2 rounded-xl border border-gray-200/90 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-[color:var(--apoyo-secondary)] hover:bg-gray-50 hover:text-[color:var(--apoyo-primary)] hover:shadow-md"
    >
      <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
      {label}
    </button>
  );
}

export function DetailHero({ badge, title, meta }) {
  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1"
        style={{ background: "linear-gradient(to right, var(--apoyo-primary), var(--apoyo-secondary), var(--apoyo-primary))" }}
        aria-hidden
      />
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
    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--apoyo-primary)_10%,transparent)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[color:var(--apoyo-primary)] ring-1 ring-[color-mix(in_srgb,var(--apoyo-primary)_20%,transparent)]">
      {children}
    </span>
  );
}

export function DetailSectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="h-full rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_2px_18px_-8px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-md md:p-6">
      <div className="mb-5 flex items-start gap-3 border-b border-gray-100 pb-4">
        {Icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--apoyo-primary)_14%,white)] text-[color:var(--apoyo-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
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
          className={`rounded-xl border px-4 py-3.5 transition-all hover:border-[color:var(--apoyo-secondary)] ${
            i % 2 === 0
              ? "border-transparent bg-gradient-to-br from-gray-50 to-gray-100/70"
              : "border-gray-100 bg-white shadow-sm"
          }`}
        >
          <span className="block text-[11px] font-bold uppercase tracking-wider text-[color:var(--apoyo-primary)]">
            {row.label}
          </span>
          <span className="mt-1 block text-sm font-medium leading-relaxed text-gray-800">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DetailActionsPanel({ children }) {
  return (
    <div className="min-w-0 space-y-5 rounded-2xl border border-gray-100 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm sm:p-5 md:p-6">
      {children}
    </div>
  );
}

export function InterviewInstructions({ applicationId, config }) {
  const { settings } = useScopeSettings("admin");
  const resolved = normalizeInterviewScheduling(
    config ?? settings?.[INTERVIEW_SCHEDULING_KEY] ?? INTERVIEW_SCHEDULING_DEFAULTS
  );

  return (
    <div className="rounded-2xl border border-[color-mix(in_srgb,var(--apoyo-primary)_15%,transparent)] bg-[color-mix(in_srgb,var(--apoyo-primary)_5%,white)] p-4 shadow-inner sm:p-5 md:p-6">
      <div className="mb-4 flex min-w-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--apoyo-primary)_10%,transparent)] pb-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[color:var(--apoyo-primary)] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--apoyo-primary)_15%,transparent)]">
          <ListChecks size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-gray-900 sm:text-lg" style={detailFont}>
            {resolved.title}
          </h3>
          {resolved.subtitle ? (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--apoyo-primary)]">
              {resolved.subtitle}
            </p>
          ) : null}
        </div>
      </div>
      <ul className="space-y-4 text-sm leading-relaxed text-gray-600">
        {resolved.steps.map((step, index) => (
          <li key={step.id} className="flex gap-3">
            <CheckCircle2
              className={`mt-0.5 size-5 shrink-0 ${
                index % 2 === 0 ? "text-[color:var(--apoyo-primary)]" : "text-[color:var(--apoyo-secondary)]"
              }`}
              strokeWidth={2}
              aria-hidden
            />
            <div className="min-w-0">
              <span className="font-semibold text-gray-800">Step {index + 1}:</span>{" "}
              <span className="whitespace-pre-wrap">{step.body}</span>
              {isApplicationNumberStep(step) ? (
                <>
                  {" "}
                  <strong className="inline-block max-w-full break-all rounded-md bg-white px-1.5 py-0.5 font-mono text-[color:var(--apoyo-primary)] ring-1 ring-gray-200">
                    {applicationId || "—"}
                  </strong>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 rounded-lg bg-white/60 px-3 py-2 text-xs font-medium text-gray-500 ring-1 ring-gray-100">
        {formatOfficeHoursLabel(resolved)}
      </p>
    </div>
  );
}
