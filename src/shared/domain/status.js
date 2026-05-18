/**
 * Status vocabulary. Synced 1:1 with
 * `ApoyoMobile/shared/domain/status.ts`.
 */

export const REQUEST_STATUS_DB_VALUES = [
  "draft",
  "pending",
  "in progress",
  "action required",
  "resubmitted",
  "for approval",
  "scheduled",
  "case study",
  "approved",
];

export const REQUEST_STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  "for approval": "For Approval",
  scheduled: "Scheduled",
  "case study": "Case Study",
  approved: "Approved",
};

export function normalizeStatus(status) {
  const key = String(status ?? "").trim().toLowerCase();

  if (
    [
      "action required",
      "action_required",
      "requires_action",
      "for_revision",
      "resubmission_required",
      "resubmission required",
    ].includes(key)
  ) {
    return "Action Required";
  }
  if (["resubmitted", "resubmission"].includes(key)) return "Resubmitted";
  if (["in progress", "in_progress"].includes(key)) return "In Progress";
  if (["case study", "case_study", "casestudy", "for case study"].includes(key))
    return "Case Study";
  if (["for approval", "for_approval"].includes(key)) return "For Approval";
  if (key === "scheduled") return "Scheduled";
  if (["approved", "complete", "done"].includes(key)) return "Approved";
  if (key === "pending") return "Pending";
  return "Pending";
}

/** True when the stored/UI status is Resubmitted (not merely attachment-level). */
export function isResubmittedRequestStatus(status) {
  return normalizeStatus(status) === "Resubmitted";
}

/** Admin auto-start on open: Pending → In Progress only (never from Resubmitted). */
export function canAutoTransitionToInProgress(status) {
  return normalizeStatus(status) === "Pending";
}

export function dbStatusForLabel(label) {
  switch (label) {
    case "Pending":
      return "pending";
    case "In Progress":
      return "in progress";
    case "Action Required":
      return "action required";
    case "Resubmitted":
      return "resubmitted";
    case "For Approval":
      return "for approval";
    case "Scheduled":
      return "scheduled";
    case "Case Study":
      return "case study";
    case "Approved":
      return "approved";
    default:
      return "pending";
  }
}
