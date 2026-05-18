import { useEffect, useState } from "react";
import { ChevronLeft, Wallet } from "lucide-react";
import { supabase } from "../../../shared/lib/supabaseClient";
import { useAuth } from "../../../shared/context/AuthContext";
import { normalizeStatus } from "../../../shared/domain/status";
import {
  buildDisplayName,
  formatDateLong,
  getFirstValue,
  resolveAdditionalInfoText,
  resolveCoverageRows,
  resolvePreflightRows,
} from "../../../shared/lib/requestReviewDisplay";
import { formatCaseStudyDateTimeDisplay } from "../../../shared/lib/schedulingDateTime";
import { DetailActionsPanel, InterviewInstructions } from "../../components/forApprovalDetailUi";
import { detailFont, detailPrimaryButtonCompactClass } from "../../components/forApprovalDetailStyles";

const STATUS_BADGE_STYLES = {
  "In Progress": "bg-blue-50 text-blue-400",
  Pending: "bg-purple-100 text-purple-600",
  "Action Required": "bg-orange-100 text-orange-700",
  Resubmitted: "bg-yellow-100 text-yellow-700",
  "For Approval": "bg-gray-50 text-[color:var(--apoyo-primary)] ring-1 ring-[color-mix(in_srgb,var(--apoyo-primary)_28%,transparent)]",
  Scheduled: "bg-sky-100 text-sky-800",
  Approved: "bg-green-100 text-green-700",
  "Case Study": "bg-blue-100 text-blue-800",
  Draft: "bg-gray-100 text-gray-700",
};

/**
 * Shared split-panel detail:
 * - variant `schedule`: For Approval â†’ one-click move to Scheduled (default).
 * - variant `disbursement`: Case study queue â†’ approve for disbursement (DB `approved`, Approved list).
 */
export default function ApprovalReviewDetails({
  application,
  onBack,
  variant = "schedule",
  onConfirmSchedule,
  scheduleError = "",
  isScheduling = false,
  onApproveDisbursement,
  approveError = "",
  isApproving = false,
  readOnly = false,
  backLabel = "Back to scheduling",
}) {
  const { allowedServiceIds } = useAuth();
  const [requestData, setRequestData] = useState(null);
  const [requesterData, setRequesterData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!application?.serviceId || !application?.requestId) {
        setLoadError("Missing application context.");
        setRequestData(null);
        setRequesterData(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");

      try {
        let rowQuery = supabase
          .from("assistance_requests")
          .select("*")
          .eq("id", application.requestId);
        if (allowedServiceIds.length > 0) {
          rowQuery = rowQuery.in("service_id", allowedServiceIds);
        }
        const { data: requestRow, error: requestError } = await rowQuery.maybeSingle();

        if (requestError) {
          throw requestError;
        }

        if (!requestRow) {
          setLoadError("This request is not in your line or you do not have access.");
          setRequestData(null);
          setRequesterData(null);
          setIsLoading(false);
          return;
        }

        const userId = requestRow?.user_id || application.userId;
        const requesterResult = userId
          ? await supabase.from("users").select("*").eq("id", userId).maybeSingle()
          : { data: null, error: null };

        if (cancelled) return;

        if (requesterResult.error) {
          throw requesterResult.error;
        }

        setRequestData(requestRow || null);
        setRequesterData(requesterResult.data || null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error?.message || "Failed to load request details.");
        setRequestData(null);
        setRequesterData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [application?.serviceId, application?.requestId, application?.userId, allowedServiceIds]);

  const requestStatus = normalizeStatus(requestData?.status || application?.status);
  const statusClass = STATUS_BADGE_STYLES[requestStatus] || STATUS_BADGE_STYLES.Pending;

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
  const preflightRows = resolvePreflightRows(requestData);
  const hasPreflightRows = preflightRows.length > 0;

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
  const additionalInfoText = resolveAdditionalInfoText(requestData);
  const financialRequestType = getFirstValue(requestData, ["financial_request_type"], "");
  const hasFinancialRequestType = String(financialRequestType || "").trim() !== "";
  const hasCoverageField =
    requestData && Object.prototype.hasOwnProperty.call(requestData, "coverage");
  const coverageRows = resolveCoverageRows(requestData);

  const scheduledIso =
    requestData?.case_study_date ||
    application?.caseStudyDate ||
    application?.caseStudyInterviewEnd ||
    (application?.interviewDate ? `${application.interviewDate}T12:00:00` : null);
  const scheduledDisplay = readOnly && scheduledIso ? formatCaseStudyDateTimeDisplay(scheduledIso) : "";
  const scheduledInterviewLabel =
    variant === "disbursement" && scheduledIso ? formatCaseStudyDateTimeDisplay(scheduledIso) : "";

  const headerTitle =
    variant === "disbursement"
      ? "Disbursement"
      : readOnly
        ? "Interview scheduled"
        : "Schedule interview";

  const rightPanelTitle =
    variant === "disbursement" ? "Disbursement" : "Interview scheduling";

  return (
    <div
      className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] md:max-h-[calc(100dvh-3rem)] w-full max-w-full flex min-h-0 flex-col box-border"
      style={{ fontFamily: "'Instrument Sans', sans-serif" }}
    >
      <div
        className="flex min-h-0 flex-1 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_28px_-10px_rgba(0,139,136,0.22)] ring-1 ring-gray-900/[0.04]"
        style={{ fontFamily: "'Instrument Sans', sans-serif" }}
      >
      <div className="flex items-center justify-between px-6 md:px-8 py-4 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-gray-600 transition shrink-0"
            aria-label={backLabel}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-3xl font-semibold truncate text-[color:var(--apoyo-primary)]">
              {headerTitle}
            </h1>
            <p className="text-xs text-gray-500 truncate mt-0.5 hidden sm:block">{backLabel}</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 min-h-0 flex items-center justify-center text-gray-500 text-sm">
          Loading request details...
        </div>
      )}

      {!isLoading && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="w-1/2 border-r border-gray-200 bg-white min-h-0 flex flex-col overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-200 bg-white z-10 shrink-0">
              <h2 className="text-sm font-semibold text-gray-800">Details</h2>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-6 py-4 space-y-2">
                {loadError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded">
                    {loadError}
                  </div>
                )}

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Date Applied:</span>
                  <span className="text-gray-700 ml-2 break-all">{dateApplied}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800">Status:</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                    {requestStatus}
                  </span>
                </div>

                {scheduledInterviewLabel ? (
                  <div className="text-xs">
                    <span className="font-semibold text-gray-800">Interview scheduled:</span>
                    <span className="text-gray-700 ml-2 break-all">{scheduledInterviewLabel}</span>
                  </div>
                ) : null}

                <div className="bg-gray-100 p-2.5 rounded text-xs">
                  <span className="font-semibold text-gray-800">Type of Assistance:</span>
                  <span className="text-gray-700 ml-1 break-all">{assistanceType}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Application ID:</span>
                  <span className="text-gray-700 ml-2 break-all">{requestCode}</span>
                </div>

                <div className="bg-gray-100 p-2.5 rounded text-xs">
                  <span className="font-semibold text-gray-800">Name:</span>
                  <span className="text-gray-700 ml-1 break-all">{requesterName}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Birthday:</span>
                  <span className="text-gray-700 ml-2 break-all">{birthday}</span>
                </div>

                <div className="bg-gray-100 p-2.5 rounded text-xs">
                  <span className="font-semibold text-gray-800">Sex:</span>
                  <span className="text-gray-700 ml-1 break-all">{sex}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Address:</span>
                  <span className="text-gray-700 ml-2 break-all">{address}</span>
                </div>

                <div className="bg-gray-100 p-2.5 rounded text-xs">
                  <span className="font-semibold text-gray-800">Contact No:</span>
                  <span className="text-gray-700 ml-1 break-all">{contactNumber}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Email:</span>
                  <span className="text-gray-700 ml-2 break-all">{email}</span>
                </div>
              </div>

              <div className="mx-4 mb-4 bg-white border border-gray-300 rounded-lg px-3 py-3 shadow-sm">
                {hasCoverageField ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-gray-800 mb-1 leading-tight">
                        Coverage
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 pr-1">
                        {coverageRows.length === 0 ? (
                          <div className="text-xs text-gray-500">No coverage provided.</div>
                        ) : (
                          coverageRows.map((row, index) => (
                            <div
                              key={`${row.label}-${index}`}
                              className={`text-xs leading-5 ${
                                index < coverageRows.length - 1
                                  ? "border-b border-gray-200 pb-1 mb-1"
                                  : ""
                              }`}
                            >
                              <span className="font-semibold text-gray-800">{row.label}:</span>
                              <span className="ml-1 text-gray-700 break-words">{row.value}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-gray-800 mb-1 leading-tight">
                        Additional Info
                      </div>
                      <textarea
                        readOnly
                        value={additionalInfoText}
                        rows={3}
                        className="w-full h-[3.25rem] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 leading-5 whitespace-pre-wrap break-all resize-none overflow-y-auto"
                      />
                    </div>
                  </div>
                ) : hasPreflightRows || hasFinancialRequestType ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-gray-800 mb-1 leading-tight">
                        Application choices
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 pr-1">
                        {(hasPreflightRows
                          ? preflightRows
                          : [{ label: "Financial Request Type", value: financialRequestType }]
                        ).map((row, index, list) => (
                          <div
                            key={`${row.label}-${index}`}
                            className={`text-xs leading-5 ${
                              index < list.length - 1
                                ? "border-b border-gray-200 pb-1 mb-1"
                                : ""
                            }`}
                          >
                            <span className="font-semibold text-gray-800">{row.label}:</span>
                            <span className="ml-1 text-gray-700 break-words">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-gray-800 mb-1 leading-tight">
                        Additional Info
                      </div>
                      <textarea
                        readOnly
                        value={additionalInfoText}
                        rows={3}
                        className="w-full h-[3.25rem] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 leading-5 whitespace-pre-wrap break-all resize-none overflow-y-auto"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] font-semibold text-gray-800 mb-1 leading-tight">
                      Additional Info
                    </div>
                    <textarea
                      readOnly
                      value={additionalInfoText}
                      rows={3}
                      className="w-full h-[3.25rem] rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 leading-5 whitespace-pre-wrap break-all resize-none overflow-y-auto"
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="w-1/2 bg-gray-100 flex flex-col min-h-0 overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-200 bg-white shrink-0">
              <h2 className="text-sm font-semibold text-gray-800">{rightPanelTitle}</h2>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6">
              <DetailActionsPanel>

                {variant === "schedule" && readOnly && scheduledIso && (
                  <div className="rounded-xl border border-[color-mix(in_srgb,var(--apoyo-secondary)_25%,transparent)] bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--apoyo-primary)]">
                      Scheduled interview
                    </p>
                    <p className="mt-2 text-lg font-semibold text-gray-900" style={detailFont}>
                      {scheduledDisplay}
                    </p>
                  </div>
                )}

                {variant === "disbursement" && (
                  <div className="rounded-xl border border-gray-100 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[color-mix(in_srgb,var(--apoyo-primary)_14%,white)] to-[color-mix(in_srgb,var(--apoyo-secondary)_14%,white)] text-[color:var(--apoyo-primary)]">
                        <Wallet size={20} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-800" style={detailFont}>
                          Final approval
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Confirm this request is ready for disbursement. It will be marked approved and listed in
                          Approved.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <InterviewInstructions applicationId={requestCode || application.id} />

                {variant === "schedule" && scheduleError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {scheduleError}
                  </div>
                ) : null}

                {variant === "disbursement" && approveError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {approveError}
                  </div>
                ) : null}

                {variant === "schedule" && !readOnly && (
                  <button
                    type="button"
                    disabled={isScheduling || typeof onConfirmSchedule !== "function"}
                    onClick={() => onConfirmSchedule?.()}
                    className={`${detailPrimaryButtonCompactClass} w-full sm:w-auto`}
                  >
                    {isScheduling ? "Saving schedule…" : "Schedule this applicant for interview / case study"}
                  </button>
                )}

                {variant === "disbursement" && (
                  <button
                    type="button"
                    disabled={isApproving || typeof onApproveDisbursement !== "function"}
                    onClick={() => onApproveDisbursement?.()}
                    className={`${detailPrimaryButtonCompactClass} w-full sm:w-auto`}
                  >
                    {isApproving ? "Saving…" : "Approve for Disbursement"}
                  </button>
                )}
              </DetailActionsPanel>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
