import { ChevronLeft, Check } from "lucide-react";

const steps = [
  "Pending",
  "In Progress",
  "Action Required",
  "Update Requirements",
  "Approval",
];

const DOC_RESULT_BADGE_STYLES = {
  Approved: "bg-green-100 text-green-700",
  Verified: "bg-green-100 text-green-700",
  Pending: "bg-purple-100 text-purple-700",
  "In Progress": "bg-cyan-100 text-cyan-700",
  Resubmitted: "bg-yellow-100 text-yellow-700",
  "Action Required": "bg-orange-100 text-orange-700",
};

function getFirstValue(record, fields, fallback = "N/A") {
  if (!record || typeof record !== "object") {
    return fallback;
  }

  for (const field of fields) {
    const value = record[field];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return fallback;
}

function formatDateLong(dateValue) {
  if (!dateValue) {
    return "N/A";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildDisplayName(user, fallbackName = "Unknown Applicant") {
  if (!user) {
    return fallbackName;
  }

  const nameParts = [
    user.first_name,
    user.middle_name,
    user.last_name,
    user.suffix,
  ].filter((part) => part && String(part).trim() !== "");

  return nameParts.length > 0 ? nameParts.join(" ") : fallbackName;
}

function normalizeDocumentResult(value) {
  const key = String(value || "pending").trim().toLowerCase();

  if (["action required", "action_required", "requires_action"].includes(key)) {
    return "Action Required";
  }

  if (["resubmitted", "resubmission", "resubmission_required"].includes(key)) {
    return "Resubmitted";
  }

  if (["in progress", "in_progress"].includes(key)) {
    return "In Progress";
  }

  if (["approved"].includes(key)) {
    return "Approved";
  }

  if (["verified", "complete", "done"].includes(key)) {
    return "Verified";
  }

  return "Pending";
}

const FINAL_APPROVAL_SCALE = 0.75;

function FinalApprovalDisbursement({
  application,
  requestData = null,
  requesterData = null,
  documents = [],
  onBack,
  onApproved,
  asOverlay = false,
  readOnly = false,
  isApproving = false,
  errorMessage = "",
}) {
  if (!application) return null;

  const dateApplied = formatDateLong(
    requestData?.submitted_at ||
      requestData?.created_at ||
      application?.submittedAt ||
      application?.createdAt
  );

  const assistanceType = getFirstValue(
    requestData,
    ["assistance_type", "request_type", "category"],
    application?.category || "N/A"
  );

  const requestCode = getFirstValue(
    requestData,
    ["request_code"],
    application?.requestCode || application?.id || "N/A"
  );

  const requesterName = buildDisplayName(requesterData, application?.name || "N/A");
  const birthday = formatDateLong(
    getFirstValue(requesterData, ["birth_date", "birthday", "date_of_birth"], "")
  );
  const sex = getFirstValue(requesterData, ["sex", "gender"], "N/A");
  const address = getFirstValue(
    requesterData,
    ["address", "home_address", "residential_address"],
    "N/A"
  );
  const contactNumber = getFirstValue(
    requesterData,
    ["contact_no", "contact_number", "phone_number", "mobile_number"],
    "N/A"
  );
  const email = getFirstValue(requesterData, ["email"], "N/A");

  const resolvedDocuments = (documents || []).map((doc, index) => ({
    key: doc?.id || `${doc?.name || "document"}-${index}`,
    name: doc?.label || doc?.name || doc?.fileName || `Document ${index + 1}`,
    result: normalizeDocumentResult(doc?.result),
  }));

  const isStepComplete = (stepIndex) => {
    if (readOnly) {
      return true;
    }

    return stepIndex < steps.length - 1;
  };

  return (
    <div
      className={
        asOverlay
          ? "fixed inset-0 z-40 bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
          : "min-h-screen bg-[#ECECEC] p-3 md:p-5"
      }
      style={{ fontFamily: "'Instrument Sans', sans-serif" }}
      onClick={asOverlay ? onBack : undefined}
    >
      <div
        className={
          asOverlay
            ? "w-full max-w-5xl max-h-[92vh] bg-[#ECECEC] border border-[#C8C8C8] rounded-3xl px-4 md:px-9 py-5 md:py-8 shadow-[0_2px_5px_rgba(0,0,0,0.18)] overflow-y-auto overflow-x-hidden"
            : "max-w-[1220px] mx-auto bg-[#ECECEC] border border-[#C8C8C8] rounded-3xl px-4 md:px-9 py-5 md:py-8 shadow-[0_2px_5px_rgba(0,0,0,0.18)]"
        }
        onClick={asOverlay ? (event) => event.stopPropagation() : undefined}
      >
        <div style={{ zoom: FINAL_APPROVAL_SCALE }}>
          <div className="flex items-center gap-3 md:gap-5">
            <button onClick={onBack} className="text-gray-300 hover:text-gray-500 transition">
              <ChevronLeft className="w-8 h-8 md:w-11 md:h-11" />
            </button>
            <h1 className="text-3xl md:text-[44px] leading-none font-semibold">
              <span className="text-teal-600">Final Approval &amp; </span>
              <span className="text-cyan-500">Disbursement</span>
            </h1>
          </div>

          <p className="mt-5 text-xs md:text-lg font-semibold">Date Applied: {dateApplied}</p>

          <div className="mt-8 md:mt-10 flex items-center justify-between gap-2 overflow-x-auto pb-2">
            {steps.map((step, index) => (
              <div key={step} className="flex items-center min-w-max">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center ${
                      isStepComplete(index) ? "bg-lime-500" : "bg-[#BFBFBF]"
                    }`}
                  >
                    <Check className="text-white" size={16} />
                  </div>
                  <span className="mt-3 text-[11px] md:text-[16px] text-[#A7A7A7] whitespace-nowrap">
                    {step}
                  </span>
                </div>
                {index !== steps.length - 1 && (
                  <div className="w-10 md:w-28 h-1 bg-[#D9D9D9] mx-2 md:mx-4" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-10 md:mt-14 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
            <div className="space-y-3 md:space-y-4 text-gray-700 text-base md:text-[18px]">
              <div className="bg-[#DFDFDF] rounded-xl px-4 py-2.5">
                <strong>Type of Assistance:</strong> {assistanceType}
              </div>
              <p>
                <strong>Application ID:</strong> {requestCode}
              </p>
              <div className="bg-[#DFDFDF] rounded-xl px-4 py-2.5">
                <strong>Name:</strong> {requesterName}
              </div>
              <p>
                <strong>Birthday:</strong> {birthday}
              </p>
              <div className="bg-[#DFDFDF] rounded-xl px-4 py-2.5">
                <strong>Sex:</strong> {sex}
              </div>
              <p>
                <strong>Address:</strong> {address}
              </p>
              <div className="bg-[#DFDFDF] rounded-xl px-4 py-2.5">
                <strong>Contact No:</strong> {contactNumber}
              </div>
              <p>
                <strong>Email:</strong> {email}
              </p>
            </div>

            <div className="space-y-3 md:space-y-4 text-gray-700 text-base md:text-[18px]">
              {resolvedDocuments.length === 0 && (
                <div className="bg-[#DFDFDF] rounded-xl px-4 py-2.5 text-sm text-gray-600">
                  No documents available.
                </div>
              )}

              {resolvedDocuments.map((doc) => (
                <div key={doc.key} className="flex items-center gap-3 md:gap-5">
                  <div className="bg-[#DFDFDF] rounded-xl px-4 py-2.5 flex-1 min-w-0">
                    <span className="truncate block">{doc.name}</span>
                  </div>
                  <span
                    className={`px-3 md:px-4 py-0.5 rounded-full text-[10px] md:text-xs font-semibold shrink-0 ${
                      DOC_RESULT_BADGE_STYLES[doc.result] || DOC_RESULT_BADGE_STYLES.Pending
                    }`}
                  >
                    {doc.result}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {!readOnly && (
            <>
              {errorMessage && (
                <p className="mt-8 text-sm text-red-600 text-right">{errorMessage}</p>
              )}

              <div className="mt-6 md:mt-8 flex justify-end">
                <button
                  onClick={onApproved}
                  disabled={isApproving}
                  className="px-9 md:px-12 py-2.5 md:py-3 bg-lime-500 text-white rounded-full text-base md:text-lg font-semibold hover:bg-lime-600 transition shadow-[0_2px_3px_rgba(0,0,0,0.16)] disabled:opacity-60"
                >
                  {isApproving ? "Approving..." : "Approve"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default FinalApprovalDisbursement;
