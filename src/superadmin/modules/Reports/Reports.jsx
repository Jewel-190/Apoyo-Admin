import { useState } from "react";
import { OverviewReportTab } from "./ReportsTab/OverviewReportTab.jsx";
import { ApplicationAnalyticsReportTab } from "./ReportsTab/ApplicationAnalyticsReportTab.jsx";
import { BenefitCategoryReportTab } from "./ReportsTab/BenefitCategoryReportTab.jsx";
import { UserApplicantReportTab } from "./ReportsTab/UserApplicantReportTab.jsx";
import { ApprovalStatusReportTab } from "./ReportsTab/ApprovalStatusReportTab.jsx";
import { ResubmissionReportTab } from "./ReportsTab/ResubmissionReportTab.jsx";
import { SchedulingReportTab } from "./ReportsTab/SchedulingReportTab.jsx";
import { CaseStudyReportTab } from "./ReportsTab/CaseStudyReportTab.jsx";
import { AdminPerformanceReportTab } from "./ReportsTab/AdminPerformanceReportTab.jsx";
import { ActivityLogsReportTab } from "./ReportsTab/ActivityLogsReportTab.jsx";
import { LocationBasedReportTab } from "./ReportsTab/LocationBasedReportTab.jsx";

const reportTabs = [
  { id: "overview", label: "Overview report", icon: "📌", component: OverviewReportTab },
  { id: "application-analytics", label: "Application Analytics", icon: "📈", component: ApplicationAnalyticsReportTab },
  { id: "benefit-category", label: "Benefit Category Report", icon: "🗂️", component: BenefitCategoryReportTab },
  { id: "user-applicant", label: "User / Applicant Report", icon: "👥", component: UserApplicantReportTab },
  { id: "approval-status", label: "Approval & Status Report", icon: "✅", component: ApprovalStatusReportTab },
  { id: "resubmission", label: "Resubmission Report", icon: "♻️", component: ResubmissionReportTab },
  { id: "scheduling", label: "Scheduling Report", icon: "📅", component: SchedulingReportTab },
  { id: "case-study", label: "Case Study Report", icon: "📚", component: CaseStudyReportTab },
  { id: "admin-performance", label: "Admin Performance Report", icon: "🎯", component: AdminPerformanceReportTab },
  { id: "activity-logs", label: "Activity Logs Report", icon: "🧾", component: ActivityLogsReportTab },
  { id: "location-based", label: "Location-Based Report", icon: "📍", component: LocationBasedReportTab },
];

export function Reports() {
  const [activeTab, setActiveTab] = useState(null);
  const activeItem = reportTabs.find((item) => item.id === activeTab) ?? null;
  const ActiveTabComponent = activeItem?.component ?? null;

  return (
    <section className="-m-2 overflow-hidden rounded-[30px] border border-ocean-200 sm:-m-3 lg:-m-4">
      <div className="bg-gradient-to-b from-ocean-700 via-ocean-800 to-ocean-900 p-4">
        <div className="space-y-1">
          {reportTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className="flex w-full items-center justify-between rounded-2xl px-3.5 py-3 text-left text-ocean-100 transition hover:bg-white/10"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-7 place-items-center rounded-lg bg-white/20 text-base">{item.icon}</span>
                <span className="text-[15px] font-semibold">{item.label}</span>
              </span>
              <span className="text-ocean-200">›</span>
            </button>
          ))}
        </div>
      </div>

      {activeItem && ActiveTabComponent ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-ocean-200 bg-white p-4 shadow-[0_20px_45px_-24px_rgba(10,70,111,0.6)] sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ocean-600">Reports</p>
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
            <div className="mt-4 rounded-2xl border border-ocean-200 bg-ocean-50/80 p-5">
              <ActiveTabComponent />
            </div>
            <div className="mt-3 rounded-xl border border-ocean-200/80 bg-ocean-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ocean-600">Report Note</p>
              <p className="mt-1 text-xs text-ocean-700">
                Each report type has its own configuration and output format. Connect filters and exports as needed.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

