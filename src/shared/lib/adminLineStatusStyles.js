/**
 * Single source of truth for admin request + document status colors.
 * Used across all modules under src/admin.
 */

import { normalizeStatus } from "../domain/status";

/** @typedef {{ background: string, text: string }} AdminStatusColors */

/** Request-level status badges (tables, headers, filters). */
export const ADMIN_REQUEST_STATUS_COLORS = {
  Draft: { background: "#E5E7EB", text: "#374151" },
  Pending: { background: "#E8C6FF", text: "#4A2E5B" },
  "In Progress": { background: "#B9E3FF", text: "#2B2B2B" },
  "Action Required": { background: "#FFD59E", text: "#2B2B2B" },
  Resubmitted: { background: "#FFE082", text: "#5C4A00" },
  "For Approval": { background: "#C8EDE9", text: "#0D5C58" },
  Scheduled: { background: "#D8E6FA", text: "#2F4F7A" },
  "Case Study": { background: "#EDE7F6", text: "#4527A0" },
  Approved: { background: "#C8F1C8", text: "#2B2B2B" },
};

/** Document / attachment result badges in review & finalize flows. */
export const ADMIN_DOCUMENT_RESULT_COLORS = {
  Pending: ADMIN_REQUEST_STATUS_COLORS.Pending,
  "In Progress": ADMIN_REQUEST_STATUS_COLORS["In Progress"],
  "Action Required": {
    background: "#FFD59E",
    text: "#2B2B2B",
  },
  Resubmitted: ADMIN_REQUEST_STATUS_COLORS.Resubmitted,
  Verified: { background: "#C8F1C8", text: "#2B2B2B" },
  Approved: { background: "#C8F1C8", text: "#2B2B2B" },
};

/** Solid accents for document UI (icons, approve actions). */
export const ADMIN_DOCUMENT_ACCENT_COLORS = {
  approved: "#7CCB53",
  actionRequired: "#FFD59E",
  resubmitted: "#5C4A00",
};

const FALLBACK_PRIMARY = "var(--apoyo-primary, #0f766e)";

/** @deprecated Use ADMIN_REQUEST_STATUS_COLORS — kept for imports that expect this shape. */
export const IN_PROGRESS_BADGE_STYLE = toInlineStyle(
  ADMIN_REQUEST_STATUS_COLORS["In Progress"]
);

/** @deprecated Prefer inline styles from getAdminRequestStatusBadgeStyle. */
export const IN_PROGRESS_BADGE_CLASSES = "";

function toInlineStyle({ background, text }) {
  return { backgroundColor: background, color: text };
}

function resolveRequestLabel(status) {
  return normalizeStatus(status);
}

function resolveDocumentLabel(result) {
  const key = String(result ?? "pending").trim().toLowerCase();
  if (["action required", "action_required", "requires_action"].includes(key)) {
    return "Action Required";
  }
  if (["resubmitted", "resubmission", "resubmission_required"].includes(key)) {
    return "Resubmitted";
  }
  if (["in progress", "in_progress"].includes(key)) {
    return "In Progress";
  }
  if (key === "approved") return "Approved";
  if (["verified", "complete", "done"].includes(key)) return "Verified";
  return "Pending";
}

/** Inline style for a request status badge. */
export function getAdminRequestStatusBadgeStyle(status) {
  const label = resolveRequestLabel(status);
  const colors =
    ADMIN_REQUEST_STATUS_COLORS[label] ?? ADMIN_REQUEST_STATUS_COLORS.Pending;
  return toInlineStyle(colors);
}

/** Inline style for a document/attachment result badge. */
export function getAdminDocumentResultBadgeStyle(result) {
  const label = resolveDocumentLabel(result);
  const colors =
    ADMIN_DOCUMENT_RESULT_COLORS[label] ?? ADMIN_DOCUMENT_RESULT_COLORS.Pending;
  return toInlineStyle(colors);
}

/** Map of all request labels → inline styles (for table StatusBadge components). */
export function buildAdminRequestStatusBadgeStylesMap() {
  return Object.fromEntries(
    Object.entries(ADMIN_REQUEST_STATUS_COLORS).map(([label, colors]) => [
      label,
      toInlineStyle(colors),
    ])
  );
}

/**
 * Legacy helper — theme is ignored; colors are fixed per defense palette.
 * @param {object} [_theme]
 */
export function buildLineAdminStatusBadgeStyles(_theme) {
  return buildAdminRequestStatusBadgeStylesMap();
}

/** Chart / legend dot fill for a request status. */
export function getAdminRequestStatusChartColor(status) {
  const label = resolveRequestLabel(status);
  return (
    ADMIN_REQUEST_STATUS_COLORS[label]?.background ??
    ADMIN_REQUEST_STATUS_COLORS.Pending.background
  );
}

/** Dashboard follow-up row (dot + mini badge). */
export function getAdminFollowUpRowStyle(status) {
  const label = resolveRequestLabel(status);
  const colors =
    ADMIN_REQUEST_STATUS_COLORS[label] ?? ADMIN_REQUEST_STATUS_COLORS.Pending;
  return {
    dotColor: colors.background,
    badgeBg: colors.background,
    badgeText: colors.text,
  };
}

/** Overview status filter chip when selected vs idle. */
export function getAdminStatusFilterChipStyle(statusLabel, isSelected) {
  const colors =
    ADMIN_REQUEST_STATUS_COLORS[statusLabel] ??
    (statusLabel === "All"
      ? { background: "#FFFBEB", text: "#2B2B2B" }
      : ADMIN_REQUEST_STATUS_COLORS.Pending);
  return {
    backgroundColor: isSelected ? colors.background : "white",
    color: colors.text,
  };
}

/** Activity log timeline border accent (status palette backgrounds). */
export function getAdminActivityLogBorderColor(actionText, status) {
  if (status) {
    return getAdminRequestStatusChartColor(status);
  }

  const text = String(actionText || "").toLowerCase();
  if (text.includes("for approval")) {
    return getAdminRequestStatusChartColor("For Approval");
  }
  if (text.includes("scheduled")) {
    return getAdminRequestStatusChartColor("Scheduled");
  }
  if (text.includes("case study")) {
    return getAdminRequestStatusChartColor("Case Study");
  }
  if (text.includes("approved")) {
    return getAdminRequestStatusChartColor("Approved");
  }
  if (text.includes("resubmit")) {
    return getAdminRequestStatusChartColor("Resubmitted");
  }
  if (text.includes("action required")) {
    return getAdminRequestStatusChartColor("Action Required");
  }
  if (text.includes("in progress")) {
    return getAdminRequestStatusChartColor("In Progress");
  }
  if (text.includes("draft")) {
    return getAdminRequestStatusChartColor("Draft");
  }
  if (text.includes("pending") || text.includes("apply")) {
    return getAdminRequestStatusChartColor("Pending");
  }

  return getAdminRequestStatusChartColor("Pending");
}

/** Inset outline that works with catalog hex or CSS variables. */
export function lineAdminInsetHairline(primary) {
  const c = primary || FALLBACK_PRIMARY;
  return `0 0 0 1px color-mix(in srgb, ${c} 16%, transparent) inset`;
}

/** Selection ring (filter chips, etc.). */
export function lineAdminSelectionRing(primary) {
  const c = primary || FALLBACK_PRIMARY;
  return `0 0 0 2px color-mix(in srgb, ${c} 34%, transparent)`;
}

export function lineAdminSelectionRingForStatus(statusLabel) {
  const bg = getAdminRequestStatusChartColor(statusLabel);
  return `0 0 0 2px color-mix(in srgb, ${bg} 55%, transparent)`;
}
