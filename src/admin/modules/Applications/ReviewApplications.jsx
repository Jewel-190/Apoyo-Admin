import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  FileText,
  X,
} from "lucide-react";
import { supabase } from "../../../shared/lib/supabaseClient";
import FinalizeDocs from "./FinalizeDocs";
import FinalApprovalDisbursement from "./FinalApprovalDisbursement";
import { ASSISTANCE_REQUESTS_TABLE } from "../../../shared/lib/assistanceRequestsTable";
import {
  attachmentHierarchyRank,
  normalizeAttachmentFieldKey,
  resolveAttachmentLabelFromCatalog,
} from "../../../shared/lib/attachmentCatalog";
import { useAuth } from "../../../shared/context/AuthContext";
import { markAdminNotificationsReadForAssistanceRequest } from "../../../shared/lib/adminNotifications";
import { normalizeAttachmentResult } from "../../../shared/lib/requestData";
import {
  buildDisplayName,
  formatDateLong,
  getFirstValue,
  resolveAdditionalInfoText,
  resolveCoverageRows,
  resolvePreflightRows,
} from "../../../shared/lib/requestReviewDisplay";
import {
  canAutoTransitionToInProgress,
  normalizeStatus as normalizeRequestStatus,
} from "../../../shared/domain/status";

const ATTACHMENT_BUCKET = "request-documents";

const ACTION_REASONS = [
  "Blurry",
  "Tampered/Photoshopped",
  "Expired",
  "Name Mismatch",
  "Wrong document",
];

const STATUS_BADGE_STYLES = {
  "In Progress": "bg-blue-50 text-blue-400",
  Pending: "bg-purple-100 text-purple-600",
  "Action Required": "bg-orange-100 text-orange-700",
  Resubmitted: "bg-yellow-100 text-yellow-700",
  "For Approval": "bg-gray-50 text-[color:var(--apoyo-primary)] ring-1 ring-[color-mix(in_srgb,var(--apoyo-primary)_28%,transparent)]",
  Scheduled: "bg-sky-100 text-sky-800",
  Approved: "bg-green-100 text-green-700",
};

const ATTACHMENT_RESULT_STYLES = {
  Pending: { backgroundColor: "#F3E8FF", color: "#C084FC" },
  "Action Required": { backgroundColor: "#FED7AA", color: "#EA580C" },
  Verified: { backgroundColor: "#DCFCE7", color: "#166534" },
  "In Progress": { backgroundColor: "#EFF6FF", color: "#60A5FA" },
  Resubmitted: { backgroundColor: "#FEF9C3", color: "#CA8A04" },
  Approved: { backgroundColor: "#DCFCE7", color: "#15803D" },
};

const FIT_EXPANDED_ZOOM_LEVEL = 100;
const EXPANDED_ZOOM_LEVELS = [50, 75, 90, 100, 105, 110, 115, 120, 130, 140, 150, 160, 175, 200];

function knownFieldKeysFromCatalog(catalog) {
  return new Set(Object.keys(catalog?.globalLabels ?? {}));
}

function hasActionRequiredAttachment(documents) {
  return (documents || []).some(
    (doc) => normalizeAttachmentResult(doc?.result) === "Action Required"
  );
}

function hasInProgressAttachment(documents) {
  return (documents || []).some(
    (doc) => normalizeAttachmentResult(doc?.result) === "In Progress"
  );
}

function hasResubmittedAttachment(documents) {
  return (documents || []).some(
    (doc) => normalizeAttachmentResult(doc?.result) === "Resubmitted"
  );
}

function isFinalApprovedDocumentResult(value) {
  const normalized = normalizeAttachmentResult(value);
  return normalized === "Approved" || normalized === "Verified";
}

function areAllDocumentsFinalApproved(documents) {
  const list = documents || [];
  return (
    list.length > 0 && list.every((doc) => isFinalApprovedDocumentResult(doc?.result))
  );
}

function findFirstResubmittedDocumentIndex(documents) {
  const list = documents || [];
  const idx = list.findIndex(
    (doc) => normalizeAttachmentResult(doc?.result) === "Resubmitted"
  );
  return idx >= 0 ? idx : 0;
}

function normalizeReason(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return ACTION_REASONS.includes(trimmed) ? trimmed : "";
}

function composeReason(reasonForAction, additionalReason) {
  const parts = [reasonForAction, additionalReason]
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((value) => value.trim());

  return parts.join(" - ");
}

function normalizeAttachmentObjectPath(pathValue) {
  if (typeof pathValue !== "string") {
    return "";
  }

  let normalized = pathValue.trim();
  if (!normalized) {
    return "";
  }

  normalized = normalized.split("?")[0];
  normalized = normalized.replace(
    /^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/[^/]+\//i,
    ""
  );
  normalized = normalized.replace(
    /^\/?storage\/v1\/object\/(?:public|sign)\/[^/]+\//i,
    ""
  );
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^request-documents\//i, "");
  normalized = normalized.replace(
    /^(hospitalization-documents|treatment-documents|medical-documents|financial-documents|monetary-documents|burial-documents|cremation-documents|columbarium-documents)\//i,
    ""
  );

  return normalized;
}

function buildAttachmentImageUrl(objectPath) {
  if (!objectPath) {
    return "";
  }

  const { data } = supabase.storage
    .from(ATTACHMENT_BUCKET)
    .getPublicUrl(objectPath);

  return data?.publicUrl || "";
}

function resolveAttachmentName(attachment, objectPath, index) {
  const pathParts = String(objectPath || "")
    .split("/")
    .filter(Boolean);
  const fileName = pathParts[pathParts.length - 1];

  if (fileName) {
    return fileName;
  }

  return getFirstValue(
    attachment,
    ["document_name", "attachment_type", "file_name", "name", "type"],
    `Document ${index + 1}`
  );
}

function normalizeFieldKey(value, catalog) {
  const knownKeys = knownFieldKeysFromCatalog(catalog);
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  const aliases = {
    letter: "letter_file",
    voterid: "voter_id_file",
    voter_id: "voter_id_file",
    barangay: "barangay_endorsement_file",
    barangay_endorsement: "barangay_endorsement_file",
    indigency: "indigency_cert_file",
    indigency_cert: "indigency_cert_file",
    birth: "birth_cert_file",
    birth_cert: "birth_cert_file",
    valid_id: "birth_cert_file",
    abstract: "abstract_file",
    bill: "bill_file",
    medcert: "med_cert_file",
    med_cert: "med_cert_file",
    rx: "rx_file",
    lab: "lab_file",
    prescription: "prescription_file",
    quotation: "quotation_file",
    billing: "billing_file",
    statement_of_account: "billing_file",
    proof_of_income: "proof_of_income_file",
    death_certificate: "death_cert_file",
    death_cert: "death_cert_file",
    funeral_contract: "funeral_contract_file",
    cremation_quote: "cremation_quote_file",
    columbarium_contract: "columbarium_contract_file",
    attachment: "attachment_file",
    attachments: "attachment_file",
  };

  if (knownKeys.has(normalized)) {
    return normalized;
  }

  if (knownKeys.has(`${normalized}_file`)) {
    return `${normalized}_file`;
  }

  const catalogKey = normalizeAttachmentFieldKey(normalized);
  if (catalogKey && knownKeys.has(catalogKey)) {
    return catalogKey;
  }

  return aliases[normalized] || catalogKey || "";
}

function inferFieldKeyFromObjectPath(objectPath) {
  if (typeof objectPath !== "string" || objectPath.trim() === "") {
    return "";
  }

  const parts = objectPath.split("/").filter(Boolean);
  const fileName = (parts[parts.length - 1] || "").toLowerCase();

  if (/^letter[_-]/.test(fileName)) return "letter_file";
  if (/^(voter|voterid|voter_id)/.test(fileName)) return "voter_id_file";
  if (/^barangay[_-]/.test(fileName)) return "barangay_endorsement_file";
  if (/^indigency[_-]/.test(fileName)) return "indigency_cert_file";
  if (/^(birth|validid|valid_id)/.test(fileName)) return "birth_cert_file";
  if (/^abstract[_-]/.test(fileName)) return "abstract_file";
  if (/^bill[_-]/.test(fileName)) return "bill_file";
  if (/^(medcert|med_cert|medcertification|medcertification_file|medcertfile|medcert_fb|medcertimg|medcerti?)/.test(fileName)) return "med_cert_file";
  if (/^rx[_-]/.test(fileName)) return "rx_file";
  if (/^lab[_-]/.test(fileName)) return "lab_file";
  if (/^prescription[_-]/.test(fileName)) return "prescription_file";
  if (/^(quotation|quote)[_-]/.test(fileName)) return "quotation_file";
  if (/^(billing|statement)[_-]/.test(fileName)) return "billing_file";
  if (/^proof[_-]?of[_-]?income/.test(fileName)) return "proof_of_income_file";
  if (/^death[_-](cert|certificate)/.test(fileName)) return "death_cert_file";
  if (/^funeral[_-](contract|bill|billing)/.test(fileName)) return "funeral_contract_file";
  if (/^cremation[_-](quote|quotation|bill)/.test(fileName)) return "cremation_quote_file";
  if (/^columbarium[_-](contract|quote|quotation)/.test(fileName)) return "columbarium_contract_file";
  if (/^attachment[_-]/.test(fileName)) return "attachment_file";

  return "";
}

function resolveFieldKey(attachment, objectPath, catalog) {
  const rawFieldKey = getFirstValue(
    attachment,
    [
      "file_type",
      "file_field",
      "field_key",
      "field_name",
      "document_field",
      "attachment_field",
      "attachment_type",
      "document_type",
      "type",
    ],
    ""
  );

  const normalized = normalizeFieldKey(rawFieldKey, catalog);
  if (normalized) {
    return normalized;
  }

  const inferred = inferFieldKeyFromObjectPath(objectPath);
  return normalizeFieldKey(inferred, catalog) || inferred;
}

function resolveAttachmentLabel(catalog, serviceId, fieldKey, fallbackName) {
  return resolveAttachmentLabelFromCatalog(catalog, serviceId, fieldKey, fallbackName);
}

function getAttachmentHierarchyRank(catalog, serviceId, fieldKey, label) {
  return attachmentHierarchyRank(catalog, serviceId, fieldKey, label);
}

async function fetchRequestAttachments(labelSourceTable, requestId) {
  void labelSourceTable;
  if (!requestId) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from("request_attachments")
    .select("*")
    .or(`assistance_request_id.eq.${requestId},request_uid.eq.${requestId}`)
    .eq("request_table", "assistance_requests");

  const rows = (data || []).filter((row) => {
    const path = String(row?.path ?? "").trim();
    return path.length > 0;
  });

  return { data: rows, error };
}

function sortAttachments(data) {
  return [...data].sort((a, b) => {
    const aTime = new Date(
      getFirstValue(a, ["created_at", "uploaded_at", "updated_at"], 0)
    ).getTime();
    const bTime = new Date(
      getFirstValue(b, ["created_at", "uploaded_at", "updated_at"], 0)
    ).getTime();

    return aTime - bTime;
  });
}

function mapAttachments(rows, serviceId, catalog) {
  const mapped = sortAttachments(rows).map((row, index) => {
    const objectPath = normalizeAttachmentObjectPath(getFirstValue(row, ["path"], ""));
    const fileName = resolveAttachmentName(row, objectPath, index);
    const fieldKey = resolveFieldKey(row, objectPath, catalog);
    const label = resolveAttachmentLabel(catalog, serviceId, fieldKey, fileName);
    const reasonForAction = normalizeReason(row.reason_for_action);
    const additionalReason =
      typeof row.additional_reason === "string"
        ? row.additional_reason.slice(0, 500)
        : "";

    const statusColumn = ["status", "result", "verification_status"].find(
      (field) => Object.prototype.hasOwnProperty.call(row, field)
    );

    return {
      id: row.uid,
      keyColumn: "uid",
      tableName: "request_attachments",
      fieldKey,
      _hierarchyRank: getAttachmentHierarchyRank(catalog, serviceId, fieldKey, label),
      _orderIndex: index,
      objectPath,
      imageUrl: buildAttachmentImageUrl(objectPath),
      label,
      fileName,
      name: label,
      result: normalizeAttachmentResult(
        getFirstValue(row, ["status", "result", "verification_status"], "pending")
      ),
      reasonForAction,
      additionalReason,
      reason: composeReason(reasonForAction, additionalReason),
      statusColumn,
      raw: row,
    };
  });

  return mapped
    .sort((a, b) => {
      if (a._hierarchyRank !== b._hierarchyRank) {
        return a._hierarchyRank - b._hierarchyRank;
      }

      return a._orderIndex - b._orderIndex;
    })
    .map(({ _hierarchyRank, _orderIndex, ...doc }) => doc);
}

function isPdfAttachment(doc) {
  const mimeType = String(
    doc?.raw?.mime_type || doc?.raw?.content_type || ""
  ).toLowerCase();

  const lookup = [doc?.fileName, doc?.objectPath, doc?.imageUrl]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return mimeType.includes("pdf") || /\.pdf(\?|#|$)/.test(lookup);
}

function AttachmentImage({ doc, onImageClick }) {
  const [displaySrc, setDisplaySrc] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const latestLoadTokenRef = useRef(0);

  useEffect(() => {
    const nextImageUrl = typeof doc?.imageUrl === "string" ? doc.imageUrl : "";
    const loadToken = latestLoadTokenRef.current + 1;
    latestLoadTokenRef.current = loadToken;

    // The reset-on-input-change pattern below is intentional: when the doc
    // changes we synchronously clear the previous image so a stale src is not
    // shown while the next one preloads. Behavior must be preserved.
    /* eslint-disable react-hooks/set-state-in-effect */
    setHasError(false);
    setDisplaySrc("");
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!nextImageUrl) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const preloadedImage = new Image();
    preloadedImage.decoding = "async";
    preloadedImage.src = nextImageUrl;

    preloadedImage.onload = () => {
      if (latestLoadTokenRef.current !== loadToken) {
        return;
      }

      setDisplaySrc(nextImageUrl);
      setIsLoading(false);
    };

    preloadedImage.onerror = () => {
      if (latestLoadTokenRef.current !== loadToken) {
        return;
      }

      setHasError(true);
      setIsLoading(false);
    };

    return () => {
      preloadedImage.onload = null;
      preloadedImage.onerror = null;
    };
  }, [doc?.id, doc?.imageUrl]);

  if (!doc?.imageUrl || hasError) {
    return (
      <div className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg px-6 py-8">
        Image preview is unavailable for this attachment.
      </div>
    );
  }

  if (isLoading || !displaySrc) {
    return (
      <div className="w-full h-full flex items-center justify-center text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg">
        Loading image...
      </div>
    );
  }

  return (
    <img
      key={`${doc?.id || "doc"}-${displaySrc}`}
      src={displaySrc}
      alt={doc.label || doc.fileName || doc.name}
      onClick={onImageClick}
      onError={() => setHasError(true)}
      className="w-full h-full object-contain transition-all duration-200"
    />
  );
}

function AttachmentPreview({ doc, onImageClick }) {
  if (!doc?.imageUrl) {
    return (
      <div className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-lg px-6 py-8">
        Preview is unavailable for this attachment.
      </div>
    );
  }

  if (isPdfAttachment(doc)) {
    return (
      <div className="w-full h-full p-4">
        <button
          onClick={onImageClick}
          className="relative w-full h-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-left group"
          type="button"
        >
          <iframe
            src={`${doc.imageUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            title={doc.label || doc.fileName || "PDF Document"}
            className="w-full h-full border-0 pointer-events-none"
          />

          <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition" />

          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
            <FileText size={12} />
            PDF Preview
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
            Click to open larger view
          </div>
        </button>
      </div>
    );
  }

  return <AttachmentImage doc={doc} onImageClick={onImageClick} />;
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim() !== ""))];
}

function isStatusConstraintError(error) {
  const message = String(error?.message || "");
  return /request_attachments_status_chk|violates check constraint.*status|status_chk/i.test(message);
}

function getAttachmentStatusCandidates(nextLabel, currentValue) {
  const isActionRequired = nextLabel === "Action Required";

  const actionRequiredCandidates = [
    "action_required",
    "action required",
    "Action Required",
    "requires_action",
    "for_revision",
    "resubmission_required",
    "rejected",
  ];

  const verifiedCandidates = [
    "verified",
    "approved",
    "Verified",
    "Approved",
    "complete",
    "done",
  ];

  const baseCandidates = isActionRequired
    ? actionRequiredCandidates
    : verifiedCandidates;

  const current = typeof currentValue === "string" ? currentValue.trim() : "";

  if (!current) {
    return uniqueValues(baseCandidates);
  }

  if (current.includes("_")) {
    return uniqueValues([
      ...baseCandidates.filter((value) => value.includes("_")),
      ...baseCandidates,
    ]);
  }

  if (current.includes(" ")) {
    return uniqueValues([
      ...baseCandidates.filter((value) => value.includes(" ")),
      ...baseCandidates,
    ]);
  }

  return uniqueValues(baseCandidates);
}

async function updateAttachmentReview(document, payload) {
  let response = await supabase
    .from("request_attachments")
    .update(payload)
    .eq("uid", document.id);

  if (
    response.error &&
    /reason_for_action|additional_reason/i.test(response.error.message || "")
  ) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.reason_for_action;
    delete fallbackPayload.additional_reason;

    response = await supabase
      .from("request_attachments")
      .update(fallbackPayload)
      .eq("uid", document.id);
  }

  return response;
}

function ReviewApplications({
  onBack,
  application,
  readOnly = false,
  openFinalApprovalOnLoad = false,
}) {
  const navigate = useNavigate();
  const { allowedServiceIds, user: authUser, roleConfig } = useAuth();
  const attachmentCatalog = roleConfig?.attachmentCatalog;
  const [documentsList, setDocumentsList] = useState([]);
  const [selectedReason, setSelectedReason] = useState("");
  const [additionalReason, setAdditionalReason] = useState("");
  const [currentDocumentIndex, setCurrentDocumentIndex] = useState(0);
  const [expandedImageDoc, setExpandedImageDoc] = useState(null);
  const [expandedZoom, setExpandedZoom] = useState(100);
  const [showFinalizeDocs, setShowFinalizeDocs] = useState(false);
  const [showFinalApproval, setShowFinalApproval] = useState(false);
  const [requestData, setRequestData] = useState(null);
  const [requesterData, setRequesterData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApprovingRequest, setIsApprovingRequest] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const currentDoc = documentsList[currentDocumentIndex] || null;

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      if (!application?.serviceId || !application?.requestId) {
        setLoadError("Missing application context for review.");
        setDocumentsList([]);
        setRequestData(null);
        setRequesterData(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");
      setSaveError("");
      setCurrentDocumentIndex(0);
      setShowFinalizeDocs(false);
      setShowFinalApproval(false);

      if (!allowedServiceIds.length) {
        setLoadError(
          "Your line has no assistance services assigned. Wait for catalog to load or contact an administrator."
        );
        setRequestData(null);
        setRequesterData(null);
        setDocumentsList([]);
        setIsLoading(false);
        return;
      }

      try {
        const { data: requestRow, error: requestError } = await supabase
          .from(ASSISTANCE_REQUESTS_TABLE)
          .select("*")
          .eq("id", application.requestId)
          .in("service_id", allowedServiceIds)
          .maybeSingle();

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
          fetchRequestAttachments(application.serviceId, application.requestId),
        ]);

        if (cancelled) {
          return;
        }

        if (requesterResult.error) {
          throw requesterResult.error;
        }

        if (attachmentsResult.error) {
          throw attachmentsResult.error;
        }

        let resolvedRequestRow = requestRow || null;

        if (
          !readOnly &&
          requestRow &&
          canAutoTransitionToInProgress(requestRow?.status) &&
          canAutoTransitionToInProgress(application?.status)
        ) {
          resolvedRequestRow = { ...requestRow, status: "in progress" };

          const { error: inProgressError } = await supabase
            .from(ASSISTANCE_REQUESTS_TABLE)
            .update({ status: "in progress" })
            .eq("id", application.requestId)
            .in("service_id", allowedServiceIds);

          if (inProgressError) {
            setSaveError(
              inProgressError.message ||
                "Failed to sync request status to In Progress."
            );
          }
        }

        if (cancelled) {
          return;
        }

        if (authUser?.id && application.requestId) {
          void markAdminNotificationsReadForAssistanceRequest(
            authUser.id,
            application.requestId
          ).catch(() => {});
        }

        const nextDocuments = mapAttachments(
          attachmentsResult.data || [],
          application.serviceId,
          attachmentCatalog
        );

        if (cancelled) {
          return;
        }

        let nextCarouselIndex = 0;
        if (nextDocuments.length > 0) {
          nextCarouselIndex = findFirstResubmittedDocumentIndex(nextDocuments);
        }

        if (!readOnly && areAllDocumentsFinalApproved(nextDocuments)) {
          setShowFinalApproval(true);
          setShowFinalizeDocs(false);
          nextCarouselIndex = 0;
        }

        setCurrentDocumentIndex(nextCarouselIndex);
        setRequestData(resolvedRequestRow);
        setRequesterData(requesterResult.data || null);
        setDocumentsList(nextDocuments);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error?.message || "Failed to load request review data.");
        setRequestData(null);
        setRequesterData(null);
        setDocumentsList([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [application, readOnly, allowedServiceIds, authUser?.id]);

  useEffect(() => {
    if (!currentDoc) {
      setSelectedReason("");
      setAdditionalReason("");
      return;
    }

    setSelectedReason(currentDoc.reasonForAction || "");
    setAdditionalReason(currentDoc.additionalReason || "");
  }, [currentDoc]);

  useEffect(() => {
    if (!openFinalApprovalOnLoad || !readOnly || isLoading) {
      return;
    }

    setShowFinalApproval(true);
    setShowFinalizeDocs(false);
  }, [openFinalApprovalOnLoad, readOnly, isLoading]);

  const handleDocumentClick = (index) => {
    const clampedIndex = Math.max(0, Math.min(index, documentsList.length - 1));
    setCurrentDocumentIndex(clampedIndex);
  };

  const moveToPreviousDocument = () => {
    if (currentDocumentIndex > 0) {
      handleDocumentClick(currentDocumentIndex - 1);
    }
  };

  const moveToNextDocument = () => {
    if (currentDocumentIndex < documentsList.length - 1) {
      handleDocumentClick(currentDocumentIndex + 1);
    }
  };

  const persistCurrentDocument = async ({ nextResult, reason, additional }) => {
    if (!currentDoc?.id) {
      return { error: new Error("Attachment uid is missing.") };
    }

    const basePayload = {
      reason_for_action: nextResult === "Action Required" ? reason || null : null,
      additional_reason:
        nextResult === "Action Required" ? additional || null : null,
    };

    if (!currentDoc.statusColumn) {
      const response = await updateAttachmentReview(currentDoc, basePayload);
      return { ...response, persistedStatus: null };
    }

    const statusCandidates = getAttachmentStatusCandidates(
      nextResult,
      currentDoc.raw?.[currentDoc.statusColumn]
    );

    let lastError = null;

    for (const statusValue of statusCandidates) {
      const payload = {
        ...basePayload,
        [currentDoc.statusColumn]: statusValue,
      };

      const response = await updateAttachmentReview(currentDoc, payload);

      if (!response.error) {
        return { ...response, persistedStatus: statusValue };
      }

      if (!isStatusConstraintError(response.error)) {
        return { ...response, persistedStatus: statusValue };
      }

      lastError = response.error;
    }

    return { error: lastError || new Error("Failed to update attachment status."), persistedStatus: null };
  };

  const buildNextDocumentsList = (
    previous,
    { nextResult, reason, additional, persistedStatus }
  ) => {
    return previous.map((doc, index) => {
        if (index !== currentDocumentIndex) {
          return doc;
        }

        const nextRaw = { ...doc.raw };

        if (doc.statusColumn && persistedStatus) {
          nextRaw[doc.statusColumn] = persistedStatus;
        }

        nextRaw.reason_for_action = nextResult === "Action Required" ? reason : null;
        nextRaw.additional_reason =
          nextResult === "Action Required" ? additional : null;

        const nextReason =
          nextResult === "Action Required"
            ? composeReason(reason, additional)
            : "";

        const resolvedResult = normalizeAttachmentResult(
          persistedStatus || nextResult || doc.result
        );

        return {
          ...doc,
          result: resolvedResult,
          reasonForAction: nextResult === "Action Required" ? reason : "",
          additionalReason: nextResult === "Action Required" ? additional : "",
          reason: nextReason,
          raw: nextRaw,
        };
      });
  };

  const openFinalizeFromDocuments = (documents) => {
    const allDocumentsApproved =
      documents.length > 0 &&
      documents.every((doc) => isFinalApprovedDocumentResult(doc?.result));

    if (allDocumentsApproved) {
      setShowFinalApproval(true);
      setShowFinalizeDocs(false);
      return;
    }

    setShowFinalizeDocs(true);
  };

  const handleMarkAsActionRequired = async () => {
    if (readOnly || !currentDoc || isSaving) {
      return;
    }

    // Approved documents can still be overridden to Action Required.

    if (!selectedReason) {
      setSaveError("Please choose a reason before marking this as Action Required.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    const trimmedAdditional = additionalReason.slice(0, 500).trim();

    try {
      const { error, persistedStatus } = await persistCurrentDocument({
        nextResult: "Action Required",
        reason: selectedReason,
        additional: trimmedAdditional,
      });

      if (error) {
        throw error;
      }

      const nextDocuments = buildNextDocumentsList(documentsList, {
        nextResult: "Action Required",
        reason: selectedReason,
        additional: trimmedAdditional,
        persistedStatus,
      });
      setDocumentsList(nextDocuments);

      const isLastDocument = currentDocumentIndex >= documentsList.length - 1;
      if (isLastDocument) {
        openFinalizeFromDocuments(nextDocuments);
      } else {
        moveToNextDocument();
      }
    } catch (error) {
      setSaveError(error?.message || "Failed to update attachment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproved = async () => {
    if (readOnly || !currentDoc || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const { error, persistedStatus } = await persistCurrentDocument({
        nextResult: "Verified",
        reason: null,
        additional: null,
      });

      if (error) {
        throw error;
      }

      const nextDocuments = buildNextDocumentsList(documentsList, {
        nextResult: "Verified",
        reason: "",
        additional: "",
        persistedStatus,
      });
      setDocumentsList(nextDocuments);

      if (areAllDocumentsFinalApproved(nextDocuments)) {
        setShowFinalApproval(true);
        setShowFinalizeDocs(false);
        setCurrentDocumentIndex(0);
        return;
      }

      const isLastDocument = currentDocumentIndex >= documentsList.length - 1;
      if (isLastDocument) {
        openFinalizeFromDocuments(nextDocuments);
      } else {
        moveToNextDocument();
      }
    } catch (error) {
      setSaveError(error?.message || "Failed to update attachment.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleFinalizeDocs = () => {
    if (readOnly) {
      return;
    }

    setSaveError("");

    openFinalizeFromDocuments(documentsList);
  };

  const handleBackToReview = () => {
    setShowFinalizeDocs(false);
  };

  const handleBackFromFinalApproval = () => {
    setShowFinalApproval(false);
    setSaveError("");
  };

  const handleViewDocumentsFromFinalApproval = () => {
    setShowFinalApproval(false);
  };

  const handleApproveRequest = async () => {
    if (readOnly || !application?.serviceId || !application?.requestId || isApprovingRequest) {
      return;
    }

    setIsApprovingRequest(true);
    setSaveError("");

    try {
      const { error } = await supabase
        .from(ASSISTANCE_REQUESTS_TABLE)
        .update({ status: "for approval" })
        .eq("id", application.requestId)
        .in("service_id", allowedServiceIds);

      if (error) {
        throw error;
      }

      setRequestData((previous) => ({
        ...(previous || {}),
        status: "for approval",
      }));

      setShowFinalApproval(false);
      navigate("/admin/scheduling");
    } catch (error) {
      setSaveError(error?.message || "Failed to approve request.");
    } finally {
      setIsApprovingRequest(false);
    }
  };

  const handleSendBackToApplicant = async () => {
    if (readOnly) {
      return { success: false, message: "This view is read-only." };
    }

    const currentRequestStatus = normalizeRequestStatus(
      requestData?.status || application?.status
    );

    if (currentRequestStatus === "Action Required") {
      const message =
        "Cannot send back again because this request is still Action Required and the applicant has not submitted new changes yet.";
      setSaveError(message);
      return { success: false, message };
    }

    const hasInProgress = hasInProgressAttachment(documentsList);
    const hasResubmitted = hasResubmittedAttachment(documentsList);
    const hasActionRequired = hasActionRequiredAttachment(documentsList);

    if (hasInProgress) {
      const message =
        "You cannot send this request back while at least one document is still In Progress.";
      setSaveError(message);
      return { success: false, message };
    }

    if (hasResubmitted) {
      const message =
        "You cannot send this request back while there are documents still tagged as Resubmitted.";
      setSaveError(message);
      return { success: false, message };
    }

    if (!hasActionRequired) {
      const message =
        "Mark at least one document as Action Required before sending back to the applicant.";
      setSaveError(message);
      return { success: false, message };
    }

    if (!application?.serviceId || !application?.requestId) {
      const message = "Missing request context for status update.";
      setSaveError(message);
      return { success: false, message };
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const { error } = await supabase
        .from(ASSISTANCE_REQUESTS_TABLE)
        .update({ status: "action required" })
        .eq("id", application.requestId)
        .in("service_id", allowedServiceIds);

      if (error) {
        throw error;
      }

      setRequestData((previous) => ({
        ...(previous || {}),
        status: "action required",
      }));
      setShowFinalizeDocs(false);
      onBack?.();
      return { success: true };
    } catch (error) {
      const message =
        error?.message ||
        "Failed to mark application as Action Required before sending back.";
      setSaveError(
        message
      );
      return { success: false, message };
    } finally {
      setIsSaving(false);
    }
  };

  const openExpandedImage = (doc) => {
    if (!doc?.imageUrl) {
      return;
    }

    setExpandedZoom(FIT_EXPANDED_ZOOM_LEVEL);
    setExpandedImageDoc(doc);
  };

  const closeExpandedImage = () => {
    setExpandedImageDoc(null);
  };

  const adjustExpandedZoom = (direction) => {
    setExpandedZoom((prev) => {
      const currentIndex = EXPANDED_ZOOM_LEVELS.indexOf(prev);
      if (currentIndex === -1) {
        return FIT_EXPANDED_ZOOM_LEVEL;
      }

      if (direction > 0) {
        const nextIndex = Math.min(
          currentIndex + 1,
          EXPANDED_ZOOM_LEVELS.length - 1
        );
        return EXPANDED_ZOOM_LEVELS[nextIndex];
      }

      if (currentIndex === 0) {
        return EXPANDED_ZOOM_LEVELS[0];
      }

      return EXPANDED_ZOOM_LEVELS[currentIndex - 1];
    });
  };

  const handleExpandedZoomSelect = (value) => {
    const numericValue = Number(value);
    if (Number.isNaN(numericValue)) {
      return;
    }

    if (!EXPANDED_ZOOM_LEVELS.includes(numericValue)) {
      return;
    }

    setExpandedZoom(numericValue);
  };

  const requestStatus = normalizeRequestStatus(
    requestData?.status || application?.status
  );
  const statusClass =
    STATUS_BADGE_STYLES[requestStatus] || STATUS_BADGE_STYLES["In Progress"];

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
  const financialRequestType = getFirstValue(
    requestData,
    ["financial_request_type"],
    ""
  );
  const hasFinancialRequestType =
    String(financialRequestType || "").trim() !== "";
  const hasCoverageField =
    requestData &&
    Object.prototype.hasOwnProperty.call(requestData, "coverage");
  const coverageRows = resolveCoverageRows(requestData);

  const currentDocResult = currentDoc?.result || "Pending";
  const currentDocResultStyle =
    ATTACHMENT_RESULT_STYLES[currentDocResult] || ATTACHMENT_RESULT_STYLES.Pending;
  const expandedDocIsPdf = isPdfAttachment(expandedImageDoc);

  return (
    <div className="relative w-full max-w-full">
      <div
        className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)] md:max-h-[calc(100dvh-3rem)] w-full max-w-full flex min-h-0 flex-col box-border"
        style={{ fontFamily: "'Instrument Sans', sans-serif" }}
      >
        <div
          className="flex min-h-0 flex-1 w-full max-w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_28px_-10px_rgba(0,139,136,0.22)] ring-1 ring-gray-900/[0.04]"
          style={{ fontFamily: "'Instrument Sans', sans-serif" }}
        >
          <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={onBack}
                className="p-2 text-gray-300 hover:text-gray-500 transition"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <h1 className="text-3xl font-semibold text-[color:var(--apoyo-primary)]">Review Application</h1>
            </div>
            {!readOnly && (
              <button
                onClick={handleFinalizeDocs}
                className="px-5 py-2 bg-green-100 text-green-700 rounded-full font-medium text-xs hover:bg-green-200 transition"
              >
                Finalize Documents
              </button>
            )}
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

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-800">Status:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}>
                  {requestStatus}
                </span>
              </div>

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

              <div className="mx-4 mb-2 bg-white border border-gray-300 rounded-lg px-3 py-3 shadow-sm">
                {hasCoverageField ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] font-semibold text-gray-800 mb-1 leading-tight">
                        Coverage
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 pr-1">
                        {coverageRows.length === 0 ? (
                          <div className="text-xs text-gray-500">
                            No coverage provided.
                          </div>
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

              <div className="mx-4 mb-2.5 bg-white border border-gray-300 rounded-lg px-5 py-4 shadow-sm">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-700 min-w-0 pr-3 break-words">
                    {currentDoc ? currentDoc.label : "No document available"}
                  </h3>
                  <span className="text-xs text-gray-500 border border-gray-300 rounded-full px-2 py-0.5 shrink-0">
                    {documentsList.length > 0 ? currentDocumentIndex + 1 : 0} of {documentsList.length}
                  </span>
                </div>

                <div className="text-[11px] text-gray-400 mb-2 truncate">
                  {currentDoc ? currentDoc.fileName : ""}
                </div>

                <div className="mb-2">
                  <div className="w-56 relative">
                    <select
                      value={selectedReason}
                      onChange={(event) => setSelectedReason(event.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg appearance-none bg-white cursor-pointer text-gray-600 text-sm truncate"
                      disabled={readOnly || !currentDoc || isSaving}
                    >
                      <option value="">Choose Reason</option>
                      {ACTION_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>

                <textarea
                  value={additionalReason}
                  onChange={(event) =>
                    setAdditionalReason(event.target.value.slice(0, 500))
                  }
                  placeholder="Write Additional Reason"
                  maxLength={500}
                  className="w-full h-20 p-2.5 border-2 border-red-300 border-dashed rounded-lg text-sm text-gray-600 placeholder-gray-400 resize-none focus:outline-none focus:border-red-400 break-all overflow-y-auto"
                  disabled={readOnly || !currentDoc || isSaving}
                />
                <div className="text-right text-xs text-gray-500 mt-2">
                  {additionalReason.length} Characters
                </div>

                {saveError && (
                  <div className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {saveError}
                  </div>
                )}

                <div className="flex gap-3 mt-3 justify-center">
                  <button
                    onClick={handleMarkAsActionRequired}
                    className="px-5 py-2 bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-orange-600 transition disabled:opacity-50"
                    disabled={readOnly || !currentDoc || isSaving || !selectedReason}
                  >
                    {isSaving ? "Saving..." : 'Mark as "Action Required"'}
                  </button>
                  <button
                    onClick={handleApproved}
                    className="px-5 py-2 bg-green-500 text-white rounded-full font-semibold text-sm hover:bg-green-600 transition disabled:opacity-50"
                    disabled={readOnly || !currentDoc || isSaving}
                  >
                    {isSaving ? "Saving..." : "Approve"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="w-1/2 bg-gray-100 flex flex-col min-h-0 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center gap-3 min-w-0">
                {currentDoc && (
                  <span
                    className="px-3 py-1 rounded-full text-xs inline-block"
                    style={currentDocResultStyle}
                  >
                    {currentDocResult}
                  </span>
                )}
                <span className="text-sm font-semibold text-gray-800 truncate min-w-0">
                  {currentDoc ? currentDoc.label : "No documents"}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-white flex flex-col overflow-hidden">
              {documentsList.length === 0 && (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">
                  No request attachments found for this application.
                </div>
              )}

              {currentDoc && (
                <>
                  <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
                    <AttachmentPreview
                      doc={currentDoc}
                      onImageClick={(event) => {
                        event.stopPropagation();
                        openExpandedImage(currentDoc);
                      }}
                    />
                  </div>

                  <div className="shrink-0 border-t border-gray-200 px-6 py-3 bg-gray-50 flex items-center justify-between">
                    <button
                      onClick={moveToPreviousDocument}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                      disabled={currentDocumentIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>

                    <span className="text-xs text-gray-500">
                      {documentsList.length > 0 ? currentDocumentIndex + 1 : 0} of {documentsList.length}
                    </span>

                    <button
                      onClick={moveToNextDocument}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40"
                      disabled={currentDocumentIndex >= documentsList.length - 1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      </div>

      {expandedImageDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-1"
          onClick={closeExpandedImage}
        >
          <div
            className="relative w-[99vw] h-[98vh] bg-black/50 border border-white/20 rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute top-4 left-4 z-10 max-w-[70vw] bg-black/55 border border-white/20 rounded-lg px-3 py-2">
              <p className="text-sm font-semibold text-white truncate">
                {expandedImageDoc.label || "Document Preview"}
              </p>
              <p className="text-xs text-white/80 truncate mt-0.5">
                {expandedImageDoc.fileName || "Unknown file name"}
              </p>
            </div>

            {!expandedDocIsPdf && (
              <div className="absolute top-20 left-4 z-10 flex items-center gap-1 bg-black/55 border border-white/20 rounded-lg px-2 py-1.5">
                <button
                  onClick={() => adjustExpandedZoom(-1)}
                  className="p-1 text-white hover:bg-white/10 rounded"
                  aria-label="Zoom out"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <select
                  value={expandedZoom}
                  onChange={(event) => handleExpandedZoomSelect(event.target.value)}
                  className="bg-transparent text-white text-sm border border-white/30 rounded px-2 py-1 outline-none"
                  aria-label="Select zoom level"
                >
                  {[FIT_EXPANDED_ZOOM_LEVEL, ...EXPANDED_ZOOM_LEVELS.filter((level) => level !== FIT_EXPANDED_ZOOM_LEVEL)].map((level) => (
                    <option key={level} value={level} className="text-black">
                      {level === FIT_EXPANDED_ZOOM_LEVEL ? "Fit (100%)" : `${level}%`}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => adjustExpandedZoom(1)}
                  className="p-1 text-white hover:bg-white/10 rounded"
                  aria-label="Zoom in"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              onClick={closeExpandedImage}
              className="absolute top-4 right-4 z-20 p-2 text-white hover:bg-white/10 rounded-full"
              aria-label="Close fullscreen image"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-full h-full overflow-auto relative">
              {expandedDocIsPdf ? (
                <div className="absolute inset-0 px-4 pt-20 pb-4">
                  <iframe
                    src={`${expandedImageDoc.imageUrl}#toolbar=1&navpanes=0`}
                    title={expandedImageDoc.label || expandedImageDoc.fileName || "PDF Document"}
                    className="w-full h-full border border-white/20 rounded-lg bg-white"
                  />
                </div>
              ) : expandedZoom <= FIT_EXPANDED_ZOOM_LEVEL ? (
                <div className="absolute inset-0 px-6 py-6 flex items-center justify-center">
                  <img
                    src={expandedImageDoc.imageUrl}
                    alt={expandedImageDoc.label || expandedImageDoc.fileName || "Document"}
                    style={{
                      display: "block",
                      width: "auto",
                      height: "auto",
                      maxWidth: "100%",
                      maxHeight: "100%",
                      transform: `scale(${expandedZoom / 100})`,
                      transformOrigin: "center center",
                    }}
                    className="block object-contain transition-all duration-150"
                  />
                </div>
              ) : (
                <div className="relative w-max min-w-full min-h-full px-6 py-6">
                  <img
                    src={expandedImageDoc.imageUrl}
                    alt={expandedImageDoc.label || expandedImageDoc.fileName || "Document"}
                    style={{
                      display: "block",
                      width: `${expandedZoom}%`,
                      maxWidth: "none",
                      maxHeight: "none",
                      height: "auto",
                    }}
                    className="block origin-top-left transition-all duration-150"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFinalizeDocs && (
        <FinalizeDocs
          documents={documentsList}
          onBack={handleBackToReview}
          onSendBack={handleSendBackToApplicant}
          disableSendBack={requestStatus === "Action Required"}
          disableSendBackReason="Cannot send back again while this request is still Action Required. Wait for applicant changes before sending back."
          asOverlay
        />
      )}

      {showFinalApproval && (
        <FinalApprovalDisbursement
          application={application}
          requestData={requestData}
          requesterData={requesterData}
          documents={documentsList}
          onBack={handleBackFromFinalApproval}
          onApproved={handleApproveRequest}
          onViewDocuments={handleViewDocumentsFromFinalApproval}
          showViewDocumentsButton={readOnly}
          readOnly={readOnly}
          isApproving={isApprovingRequest}
          errorMessage={saveError}
          asOverlay
        />
      )}
    </div>
  );
}

export default ReviewApplications;
