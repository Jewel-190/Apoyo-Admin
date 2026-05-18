import { User, FileCheck } from "lucide-react";
import {
  DetailBackButton,
  DetailHero,
  DetailStatusChip,
  DetailSectionCard,
  DetailFieldsGrid,
} from "../../components/forApprovalDetailUi";
import { detailFont } from "../../components/forApprovalDetailStyles";

function formatPhp(amount) {
  if (amount == null || amount === "") return "—";
  const n = Number(String(amount).replace(/,/g, ""));
  if (Number.isNaN(n)) return String(amount);
  return `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCalendarDate(value) {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  const t = Date.parse(value);
  if (!Number.isNaN(t)) {
    return new Date(t).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  return value;
}

function formatCaseStudyWindow(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function ApprovedApplicationDetailView({ application, onBack }) {
  if (!application) return null;

  const verifiedDocs = application.documents.filter((d) => d.result === "Verified");
  const totalDocs = application.documents.length;
  const statusLabel =
    application.status === "Approved for Disbursement" ? "Approved for Disbursement" : "Approved";

  const detailRows = [
    { label: "Name", value: application.name },
    { label: "Age", value: application.age != null ? `${application.age} years` : "—" },
    { label: "Contact number", value: application.contactNo },
    { label: "Email", value: application.email },
    { label: "Full address", value: application.address },
    { label: "Application ID", value: application.id },
    { label: "Control number", value: application.controlNumber ?? "—" },
    { label: "Status", value: statusLabel },
    { label: "Approved amount", value: formatPhp(application.disbursementAmount) },
    { label: "Date application", value: formatCalendarDate(application.date) },
    {
      label: "Date of case study",
      value: application.interviewDate
        ? formatCalendarDate(application.interviewDate)
        : formatCaseStudyWindow(application.caseStudyInterviewEnd),
    },
    {
      label: "Date claimed",
      value: application.dateClaimed ? formatCalendarDate(application.dateClaimed) : "—",
    },
  ];

  return (
    <div className="w-full">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_2px_24px_-12px_rgba(0,139,136,0.12)] md:p-8">
        <DetailBackButton onClick={onBack} label="Back to list" />

        <DetailHero
          badge={<DetailStatusChip>{statusLabel}</DetailStatusChip>}
          title={application.name}
          meta={
            <>
              <span className="font-mono font-medium text-gray-700">{application.id}</span>
              {application.controlNumber ? (
                <>
                  <span className="text-gray-300">·</span>
                  <span>Control {application.controlNumber}</span>
                </>
              ) : null}
              <span className="text-gray-300">·</span>
              <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-[#008B88] to-[#06C1EC]">
                {formatPhp(application.disbursementAmount)}
              </span>
            </>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          <DetailSectionCard icon={User} title="Applicant record" subtitle="Beneficiary profile & timeline">
            <DetailFieldsGrid rows={detailRows} />
          </DetailSectionCard>

          <DetailSectionCard
            icon={FileCheck}
            title="Documents approved"
            subtitle={`${verifiedDocs.length} of ${totalDocs} verified on file`}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {application.documents.map((doc) => {
                const ok = doc.result === "Verified";
                return (
                  <div
                    key={doc.name}
                    className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md ring-1 ring-gray-100/80 transition-all hover:-translate-y-0.5 hover:border-[#06C1EC]/35 hover:shadow-xl hover:shadow-[#008B88]/10"
                  >
                    <div className="relative flex h-44 items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-4 md:h-52">
                      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#008B88] to-[#06C1EC]" />
                      </div>
                      <img src={doc.image} alt={doc.name} className="relative z-[1] max-h-full max-w-full object-contain drop-shadow-sm" />
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-[#008B88] to-[#06C1EC] px-4 py-3">
                      <span className="text-sm font-semibold leading-tight text-white">{doc.name}</span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          ok ? "bg-white/25 text-white ring-1 ring-white/30" : "bg-amber-200 text-amber-950"
                        }`}
                      >
                        {ok ? "Approved" : doc.result}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </DetailSectionCard>
        </div>

        <p className="mt-8 text-center text-[11px] font-medium uppercase tracking-wider text-gray-400" style={detailFont}>
          Apoyo Admin · Disbursement record
        </p>
      </div>
    </div>
  );
}
