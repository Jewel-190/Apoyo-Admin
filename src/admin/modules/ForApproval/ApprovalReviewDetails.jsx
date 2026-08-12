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
import {
  fetchRequestAttachments,
  mapAttachments,
} from "../../../shared/lib/requestAttachments";
import { DetailActionsPanel, InterviewInstructions } from "../../components/forApprovalDetailUi";
import { detailFont, detailPrimaryButtonCompactClass } from "../../components/forApprovalDetailStyles";
import { getAdminRequestStatusBadgeStyle } from "../../../shared/lib/adminLineStatusStyles";
import SubmittedDocumentsThumbnails from "../../components/SubmittedDocumentsThumbnails";

/**
 * Shared split-panel detail:
 * - variant `schedule`: For Approval → one-click move to Scheduled (default).
 * - variant `disbursement`: Case study queue → approve for disbursement (DB `approved`, Approved list).
 * Includes read-only submitted-document preview alongside scheduling/disbursement actions.
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
  const { allowedServiceIds, roleConfig } = useAuth();
  const attachmentCatalog = roleConfig?.attachmentCatalog;
  const [requestData, setRequestData] = useState(null);
  const [requesterData, setRequesterData] = useState(null);
  const [documentsList, setDocumentsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!application?.serviceId || !application?.requestId) {
        setLoadError("Missing application context.");
        setRequestData(null);
        setRequesterData(null);
        setDocumentsList([]);
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
          setDocumentsList([]);
          setIsLoading(false);
          return;
        }

        const userId = requestRow?.user_id || application.userId;
        const [requesterResult, attachmentsResult] = await Promise.all([
          userId
            ? supabase.from("users").select("*").eq("id", userId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          fetchRequestAttachments(application.requestId),
        ]);

        if (cancelled) return;

        if (requesterResult.error) {
          throw requesterResult.error;
        }

        if (attachmentsResult.error) {
          throw attachmentsResult.error;
        }

        const nextDocuments = mapAttachments(
          attachmentsResult.data || [],
          application.serviceId,
          attachmentCatalog
        );

        if (cancelled) return;

        setRequestData(requestRow || null);
        setRequesterData(requesterResult.data || null);
        setDocumentsList(nextDocuments);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error?.message || "Failed to load request details.");
        setRequestData(null);
        setRequesterData(null);
        setDocumentsList([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    application?.serviceId,
    application?.requestId,
    application?.userId,
    allowedServiceIds,
    roleConfig?.attachmentCatalog,
  ]);

  const requestStatus = normalizeStatus(requestData?.status || application?.status);
  const statusBadgeStyle = getAdminRequestStatusBadgeStyle(requestStatus);

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
      className="box-border flex h-[calc(100dvh-7.25rem)] max-h-[calc(100dvh-7.25rem)] w-full max-w-full min-h-0 flex-col md:h-[calc(100dvh-3rem)] md:max-h-[calc(100dvh-3rem)]"
      style={{ fontFamily: "'Instrument Sans', sans-serif" }}
    >
      <div
        className="flex min-h-0 flex-1 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_28px_-10px_rgba(0,139,136,0.22)] ring-1 ring-gray-900/[0.04]"
        style={{ fontFamily: "'Instrument Sans', sans-serif" }}
      >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4 md:px-8">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 p-2 text-gray-400 transition hover:text-gray-600"
            aria-label={backLabel}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-[color:var(--apoyo-primary)] sm:text-2xl md:text-3xl">
              {headerTitle}
            </h1>
            <p className="mt-0.5 hidden truncate text-xs text-gray-500 sm:block">{backLabel}</p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-gray-500">
          Loading request details...
        </div>
      )}

      {!isLoading && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="flex w-full min-w-0 shrink-0 flex-col border-b border-gray-200 bg-white lg:min-h-0 lg:w-1/2 lg:shrink lg:flex-1 lg:overflow-hidden lg:border-b-0 lg:border-r">
            <div className="z-10 shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-gray-800">Details</h2>
            </div>

            <div className="min-w-0 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <div className="space-y-2 px-4 py-4 sm:px-6">
                {loadError && (
                  <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {loadError}
                  </div>
                )}

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Date Applied:</span>
                  <span className="ml-2 break-all text-gray-700">{dateApplied}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-800">Status:</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={statusBadgeStyle}
                  >
                    {requestStatus}
                  </span>
                </div>

                {scheduledInterviewLabel ? (
                  <div className="text-xs">
                    <span className="font-semibold text-gray-800">Interview scheduled:</span>
                    <span className="ml-2 break-all text-gray-700">{scheduledInterviewLabel}</span>
                  </div>
                ) : null}

                <div className="rounded bg-gray-100 p-2.5 text-xs">
                  <span className="font-semibold text-gray-800">Type of Assistance:</span>
                  <span className="ml-1 break-all text-gray-700">{assistanceType}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Application ID:</span>
                  <span className="ml-2 break-all text-gray-700">{requestCode}</span>
                </div>

                <div className="rounded bg-gray-100 p-2.5 text-xs">
                  <span className="font-semibold text-gray-800">Name:</span>
                  <span className="ml-1 break-all text-gray-700">{requesterName}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Birthday:</span>
                  <span className="ml-2 break-all text-gray-700">{birthday}</span>
                </div>

                <div className="rounded bg-gray-100 p-2.5 text-xs">
                  <span className="font-semibold text-gray-800">Sex:</span>
                  <span className="ml-1 break-all text-gray-700">{sex}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Address:</span>
                  <span className="ml-2 break-all text-gray-700">{address}</span>
                </div>

                <div className="rounded bg-gray-100 p-2.5 text-xs">
                  <span className="font-semibold text-gray-800">Contact No:</span>
                  <span className="ml-1 break-all text-gray-700">{contactNumber}</span>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-gray-800">Email:</span>
                  <span className="ml-2 break-all text-gray-700">{email}</span>
                </div>
              </div>

              <div className="mx-3 mb-4 rounded-lg border border-gray-300 bg-white px-3 py-3 shadow-sm sm:mx-4">
                {hasCoverageField ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold leading-tight text-gray-800">
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
                                  ? "mb-1 border-b border-gray-200 pb-1"
                                  : ""
                              }`}
                            >
                              <span className="font-semibold text-gray-800">{row.label}:</span>
                              <span className="ml-1 break-words text-gray-700">{row.value}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-semibold leading-tight text-gray-800">
                        Additional Info
                      </div>
                      <textarea
                        readOnly
                        value={additionalInfoText}
                        rows={3}
                        className="h-[3.25rem] w-full resize-none overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs leading-5 text-gray-700"
                      />
                    </div>
                  </div>
                ) : hasPreflightRows || hasFinancialRequestType ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold leading-tight text-gray-800">
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
                                ? "mb-1 border-b border-gray-200 pb-1"
                                : ""
                            }`}
                          >
                            <span className="font-semibold text-gray-800">{row.label}:</span>
                            <span className="ml-1 break-words text-gray-700">{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-1 text-[11px] font-semibold leading-tight text-gray-800">
                        Additional Info
                      </div>
                      <textarea
                        readOnly
                        value={additionalInfoText}
                        rows={3}
                        className="h-[3.25rem] w-full resize-none overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs leading-5 text-gray-700"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1 text-[11px] font-semibold leading-tight text-gray-800">
                      Additional Info
                    </div>
                    <textarea
                      readOnly
                      value={additionalInfoText}
                      rows={3}
                      className="h-[3.25rem] w-full resize-none overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs leading-5 text-gray-700"
                    />
                  </>
                )}
              </div>

              <SubmittedDocumentsThumbnails documents={documentsList} columns={2} />
            </div>
          </div>

          <div className="flex min-h-[50vh] w-full min-w-0 flex-1 flex-col overflow-hidden bg-gray-100 lg:min-h-0 lg:w-1/2">
            <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-gray-800">{rightPanelTitle}</h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 md:p-6">
              <DetailActionsPanel>

                {variant === "schedule" && readOnly && scheduledIso && (
                  <div className="rounded-xl border border-[color-mix(in_srgb,var(--apoyo-secondary)_25%,transparent)] bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--apoyo-primary)]">
                      Scheduled interview
                    </p>
                    <p className="mt-2 break-words text-lg font-semibold text-gray-900" style={detailFont}>
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
                    className={`${detailPrimaryButtonCompactClass} w-full max-w-full text-center leading-snug whitespace-normal`}
                  >
                    {isScheduling ? "Saving schedule…" : "Schedule this applicant for interview / case study"}
                  </button>
                )}

                {variant === "disbursement" && !readOnly && (
                  <button
                    type="button"
                    disabled={isApproving || typeof onApproveDisbursement !== "function"}
                    onClick={() => onApproveDisbursement?.()}
                    className={`${detailPrimaryButtonCompactClass} w-full max-w-full text-center leading-snug whitespace-normal`}
                  >
                    {isApproving ? "Saving…" : "Approve for Disbursement"}
                  </button>
                )}

                {readOnly ? (
                  <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
                    Viewing current request state (read-only).
                  </p>
                ) : null}
              </DetailActionsPanel>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
