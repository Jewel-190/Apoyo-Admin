/** Status chip colors that follow the current line admin catalog theme. */

const FALLBACK_PRIMARY = "var(--apoyo-primary, #0f766e)";

/** Light blue for "In Progress" everywhere in admin (not theme-tinted). */
export const IN_PROGRESS_BADGE_STYLE = {
  backgroundColor: "#EFF6FF",
  color: "#60A5FA",
};

export const IN_PROGRESS_BADGE_CLASSES = "bg-blue-50 text-blue-400";

export function buildLineAdminStatusBadgeStyles(theme) {
  const primary = theme?.primary || FALLBACK_PRIMARY;

  return {
    Draft: { backgroundColor: "#E5E7EB", color: "#374151" },
    Pending: { backgroundColor: "#F3E8FF", color: "#C084FC" },
    "In Progress": { ...IN_PROGRESS_BADGE_STYLE },
    "Action Required": { backgroundColor: "#FEF3C7", color: "#D97706" },
    Resubmitted: { backgroundColor: "#FEF9C3", color: "#CA8A04" },
    "For Approval": {
      backgroundColor: `color-mix(in srgb, ${primary} 20%, white)`,
      color: primary,
    },
    Scheduled: { backgroundColor: "#E0F2FE", color: "#0369A1" },
    Approved: { backgroundColor: "#DCFCE7", color: "#15803D" },
    "Case Study": { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  };
}

/** Inset outline that works with catalog hex or CSS variables. */
export function lineAdminInsetHairline(primary) {
  const c = primary || "var(--apoyo-primary)";
  return `0 0 0 1px color-mix(in srgb, ${c} 16%, transparent) inset`;
}

/** Selection ring (filter chips, etc.). */
export function lineAdminSelectionRing(primary) {
  const c = primary || "var(--apoyo-primary)";
  return `0 0 0 2px color-mix(in srgb, ${c} 34%, transparent)`;
}
