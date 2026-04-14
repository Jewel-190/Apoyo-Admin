import React, { useState } from "react";
import { X } from "lucide-react";

const RESULT_BADGE_STYLES = {
  Pending: { backgroundColor: "#F3E8FF", color: "#C084FC" },
  "Action Required": { backgroundColor: "#FED7AA", color: "#EA580C" },
  Verified: { backgroundColor: "#DCFCE7", color: "#166534" },
  "In Progress": { backgroundColor: "#E0F7FA", color: "#06C1EC" },
  Resubmitted: { backgroundColor: "#FEF9C3", color: "#CA8A04" },
  Approved: { backgroundColor: "#DCFCE7", color: "#15803D" },
};

function normalizeDocumentResult(value) {
  const key = String(value || "pending").trim().toLowerCase();

  if (["action required", "action_required", "requires_action"].includes(key)) {
    return "Action Required";
  }

  if (key === "approved") {
    return "Approved";
  }

  if (["verified", "complete", "done"].includes(key)) {
    return "Verified";
  }

  if (key === "in progress" || key === "in_progress") {
    return "In Progress";
  }

  if (["resubmitted", "resubmission", "resubmission_required"].includes(key)) {
    return "Resubmitted";
  }

  return "Pending";
}

function sortDocumentsForSummary(documents) {
  return documents
    .map((doc, index) => ({
      ...doc,
      __index: index,
      __isOptionalAttachment:
        doc?.fieldKey === "attachment_file" ||
        /attachments?\s*\(optional\)/i.test(String(doc?.label || doc?.name || "")),
    }))
    .sort((a, b) => {
      if (a.__isOptionalAttachment !== b.__isOptionalAttachment) {
        return a.__isOptionalAttachment ? 1 : -1;
      }

      return a.__index - b.__index;
    })
    .map(({ __index, __isOptionalAttachment, ...doc }) => doc);
}

function FinalizeDocs({
  documents = [],
  onBack,
  onSendBack,
  asOverlay = false,
  disableSendBack = false,
  disableSendBackReason = "",
}) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSendingBack, setIsSendingBack] = useState(false);
  const [sendBackError, setSendBackError] = useState("");

  const normalizedDocuments = sortDocumentsForSummary(documents).map((doc) => ({
    ...doc,
    normalizedResult: normalizeDocumentResult(doc.result),
  }));

  const hasInProgressDocuments = normalizedDocuments.some(
    (doc) => doc.normalizedResult === "In Progress"
  );
  const hasResubmittedDocuments = normalizedDocuments.some(
    (doc) => doc.normalizedResult === "Resubmitted"
  );
  const derivedSendBackBlockReason = hasInProgressDocuments
    ? "You cannot send this request back while at least one document is still In Progress."
    : hasResubmittedDocuments
      ? "You cannot send this request back while there are documents still tagged as Resubmitted."
      : "";
  const sendBackBlockReason = disableSendBack
    ? (disableSendBackReason ||
      "You cannot send this request back in its current status.")
    : derivedSendBackBlockReason;

  const handleSendBackClick = () => {
    if (sendBackBlockReason) {
      setSendBackError(sendBackBlockReason);
      return;
    }

    setSendBackError("");
    setShowConfirmModal(true);
  };

  const handleConfirmSendBack = async () => {
    if (isSendingBack) {
      return;
    }

    if (sendBackBlockReason) {
      setSendBackError(sendBackBlockReason);
      return;
    }

    setIsSendingBack(true);
    setSendBackError("");

    try {
      const result = await onSendBack?.();

      if (result?.success === false) {
        throw new Error(result.message || "Failed to send back to applicant.");
      }

      setShowConfirmModal(false);
    } catch (error) {
      setSendBackError(error?.message || "Failed to send back to applicant.");
    } finally {
      setIsSendingBack(false);
    }
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
  };

  // Filter documents that need action
  const documentsNeedingAction = normalizedDocuments.filter(
    (doc) => doc.normalizedResult === "Action Required"
  );

  return (
    <div
      className={
        asOverlay
          ? "fixed inset-0 z-40 bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
          : "min-h-screen bg-white p-8 relative"
      }
      style={{ fontFamily: "'Instrument Sans', sans-serif" }}
      onClick={asOverlay ? onBack : undefined}
    >
      {/* Main Container */}
      <div
        className={
          asOverlay
            ? "w-full max-w-5xl max-h-[92vh] bg-white border border-gray-300 rounded-2xl p-8 shadow-sm overflow-hidden flex flex-col"
            : "max-w-5xl mx-auto bg-white border border-gray-300 rounded-2xl p-8 shadow-sm"
        }
        onClick={asOverlay ? (event) => event.stopPropagation() : undefined}
      >
        {/* Title */}
        <h1
          className="text-3xl mb-8"
          style={{
            fontFamily: "'Instrument Sans', sans-serif",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "#008B88" }}>Verification </span>
          <span style={{ color: "#D4AF37" }}>Summary </span>
          <span style={{ color: "#FF8500" }}>Table</span>
        </h1>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-auto mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300">
                <th
                  className="text-left py-4 px-4 text-gray-800"
                  style={{
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Document
                </th>
                <th
                  className="text-left py-4 px-4 text-gray-800"
                  style={{
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Result
                </th>
                <th
                  className="text-left py-4 px-4 text-gray-800"
                  style={{
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: 500,
                  }}
                >
                  Reason / Rejection Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {normalizedDocuments.map((doc, index) => (
                <tr
                  key={index}
                  className={`border-b border-gray-200 ${
                    index % 2 === 0 ? "bg-gray-50" : "bg-white"
                  }`}
                >
                  <td
                    className="py-4 px-4 text-sm text-gray-800"
                    style={{
                      fontFamily: "'Instrument Sans', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {doc.name}
                  </td>
                  <td className="py-4 px-4">
                    <span
                      className="px-3 py-1 rounded-full text-xs inline-block"
                      style={{
                        ...(RESULT_BADGE_STYLES[doc.normalizedResult] ||
                          RESULT_BADGE_STYLES.Pending),
                        fontFamily: "'Instrument Sans', sans-serif",
                        fontWeight: 500,
                      }}
                    >
                      {doc.normalizedResult}
                    </span>
                  </td>
                  <td
                    className="py-4 px-4 text-sm text-gray-700"
                    style={{
                      fontFamily: "'Instrument Sans', sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {doc.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-6 mt-12">
          <button
            onClick={onBack}
            className="px-8 py-3 rounded-full text-sm transition hover:shadow-lg"
            style={{
              backgroundColor: "#D1D5DB",
              color: "#4B5563",
              fontFamily: "'Instrument Sans', sans-serif",
              fontWeight: 500,
            }}
          >
            Back to Review
          </button>
          <button
            onClick={handleSendBackClick}
            className="px-8 py-3 rounded-full text-sm transition border-2 hover:shadow-lg"
            disabled={Boolean(sendBackBlockReason)}
            style={{
              backgroundColor: sendBackBlockReason ? "#F3F4F6" : "#FFFBEB",
              color: sendBackBlockReason ? "#9CA3AF" : "#FF8500",
              borderColor: sendBackBlockReason ? "#D1D5DB" : "#FF8500",
              fontFamily: "'Instrument Sans', sans-serif",
              fontWeight: 500,
              cursor: sendBackBlockReason ? "not-allowed" : "pointer",
            }}
          >
            Send back to Applicant
          </button>
        </div>

        {sendBackBlockReason && (
          <p className="text-center mt-4 text-sm text-red-500">
            {sendBackBlockReason}
          </p>
        )}
      </div>

      {/* Confirmation Modal - NO BLACK BACKGROUND */}
      {showConfirmModal && (
        <>
          {/* Blurred Overlay - Light gray blur effect */}
          <div
            className="fixed inset-0 z-[60] backdrop-blur-sm"
            style={{
              backgroundColor: "rgba(155, 155, 155, 0.3)",
            }}
            onClick={handleCloseModal}
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center p-4 z-[70]">
            <div
              className="bg-white rounded-3xl p-16 max-w-2xl w-full shadow-2xl relative transform transition-all duration-300 ease-out"
              style={{
                fontFamily: "'Instrument Sans', sans-serif",
                animation: "slideIn 0.3s ease-out",
              }}
            >
              <style>{`
                @keyframes slideIn {
                  from {
                    opacity: 0;
                    transform: scale(0.95) translateY(-20px);
                  }
                  to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                  }
                }
              `}</style>

              {/* Close Button */}
              <button
                onClick={handleCloseModal}
                className="absolute top-6 right-6 text-red-400 hover:text-red-600 transition duration-200 hover:scale-110"
              >
                <div
                  style={{
                    border: "2px solid #EF4444",
                    borderRadius: "50%",
                    padding: "4px",
                  }}
                >
                  <X className="w-5 h-5" />
                </div>
              </button>

              {/* Message */}
              <p
                className="text-center text-xl leading-relaxed mb-6"
                style={{ fontWeight: 400, color: "#1F2937", lineHeight: "1.8" }}
              >
                You are about to mark this application as{" "}
                <span style={{ color: "#FF8500", fontWeight: 600 }}>
                  Action Required
                </span>
                . The user will be notified to re-upload the following
                documents:
              </p>

              {/* Documents List */}
              <div className="mb-8 space-y-2 max-h-64 overflow-y-auto">
                {documentsNeedingAction.length > 0 ? (
                  documentsNeedingAction.map((doc, index) => (
                    <div key={index} className="flex items-start gap-3 pl-4">
                      <span style={{ color: "#FF8500", fontWeight: 600 }}>
                        •
                      </span>
                      <div>
                        <p
                          style={{
                            fontWeight: 500,
                            color: "#1F2937",
                            fontFamily: "'Instrument Sans', sans-serif",
                          }}
                        >
                          {doc.name}
                        </p>
                        {doc.reason && (
                          <p
                            style={{
                              fontWeight: 400,
                              color: "#6B7280",
                              fontSize: "0.875rem",
                              marginTop: "0.25rem",
                              fontFamily: "'Instrument Sans', sans-serif",
                            }}
                          >
                            {doc.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p
                    style={{
                      color: "#6B7280",
                      fontFamily: "'Instrument Sans', sans-serif",
                    }}
                  >
                    No documents marked as Action Required
                  </p>
                )}
              </div>

              {/* Confirm Button */}
              {sendBackError && (
                <p
                  className="text-center text-sm mb-4"
                  style={{
                    color: "#DC2626",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  {sendBackError}
                </p>
              )}

              <div className="flex justify-center">
                <button
                  onClick={handleConfirmSendBack}
                  className="px-16 py-3 rounded-full text-sm transition hover:shadow-lg hover:scale-105 duration-200"
                  disabled={isSendingBack}
                  style={{
                    backgroundColor: "#84CC16",
                    color: "#FFFFFF",
                    fontFamily: "'Instrument Sans', sans-serif",
                    fontWeight: 500,
                    opacity: isSendingBack ? 0.7 : 1,
                  }}
                >
                  {isSendingBack ? "Sending..." : "I understand"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default FinalizeDocs;
