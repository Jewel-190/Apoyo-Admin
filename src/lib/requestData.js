import { supabase } from "./supabaseClient";

export const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  "for approval": "For Approval",
  scheduled: "Scheduled",
  approved: "Approved",
  "case study": "Case Study",
};

export function normalizeStatus(status) {
  const key = String(status || "pending").trim().toLowerCase();

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

  if (["resubmitted", "resubmission", "resubmission_required"].includes(key)) {
    return "Resubmitted";
  }

  if (["in progress", "in_progress"].includes(key)) {
    return "In Progress";
  }

  if (["case study", "case_study", "casestudy", "for case study"].includes(key)) {
    return "Case Study";
  }

  if (["for approval", "for_approval"].includes(key)) {
    return "For Approval";
  }

  if (key === "scheduled") {
    return "Scheduled";
  }

  if (["approved", "complete", "done"].includes(key)) {
    return "Approved";
  }

  return STATUS_LABELS[key] || "Pending";
}

export function formatDate(dateValue) {
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

export function toValidDate(value) {
  const parsed = new Date(value || "");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRelativeWithTime(dateValue) {
  const date = toValidDate(dateValue);
  if (!date) return "Unknown time";

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let relative;

  if (diffMinutes < 1) {
    relative = "Just now";
  } else if (diffMinutes < 60) {
    relative = `${diffMinutes} min ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours} hr${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffDays < 30) {
    relative = `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else {
    const diffMonths = Math.floor(diffDays / 30);
    relative = `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  }

  const exactDateTime = date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `${relative} | ${exactDateTime}`;
}

export function buildNotificationDescription(notification, categoryLabel) {
  const action = String(notification?.action || "").trim().toLowerCase();

  if (action === "insert") return `New request submitted in ${categoryLabel}`;
  if (action === "update") return `Request updated in ${categoryLabel}`;
  if (action.includes("resubmit")) return `Resubmitted documents in ${categoryLabel}`;
  if (action.includes("action_required")) return `Action required update in ${categoryLabel}`;
  if (action.includes("for approval") || action.includes("for_approval")) {
    return `For approval update in ${categoryLabel}`;
  }
  if (action.includes("scheduled")) return `Scheduled update in ${categoryLabel}`;
  if (action.includes("approved")) return `Approved update in ${categoryLabel}`;
  if (action.includes("status")) return `Status update in ${categoryLabel}`;

  return `Request update in ${categoryLabel}`;
}

export function normalizeAttachmentResult(value) {
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

export function buildDisplayName(user) {
  if (!user) {
    return "Unknown Applicant";
  }

  const nameParts = [
    user.first_name,
    user.middle_name,
    user.last_name,
    user.suffix,
  ].filter(Boolean);

  return nameParts.length > 0 ? nameParts.join(" ") : "Unknown Applicant";
}

async function fetchSourceRows(tableName) {
  const withUpdatedAt = await supabase
    .from(tableName)
    .select(
      "id, request_code, user_id, created_at, updated_at, submitted_at, status, case_study_date"
    )
    .neq("status", "draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!withUpdatedAt.error) {
    return withUpdatedAt;
  }

  const withSubmittedAt = await supabase
    .from(tableName)
    .select("id, request_code, user_id, created_at, submitted_at, status, case_study_date")
    .neq("status", "draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!withSubmittedAt.error) {
    return withSubmittedAt;
  }

  return supabase
    .from(tableName)
    .select("id, request_code, user_id, created_at, status, case_study_date")
    .neq("status", "draft")
    .order("created_at", { ascending: false });
}

export async function fetchApplicationsBySources(sourceTables) {
  const sources = Array.isArray(sourceTables) ? sourceTables : [];

  if (sources.length === 0) {
    return [];
  }

  const results = await Promise.all(
    sources.map((source) => fetchSourceRows(source.table))
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throw firstError;
  }

  const userIds = [
    ...new Set(
      results
        .flatMap((result) => result.data || [])
        .map((row) => row.user_id)
        .filter(Boolean)
    ),
  ];

  let usersById = {};

  if (userIds.length > 0) {
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", userIds);

    if (usersError) {
      throw usersError;
    }

    usersById = Object.fromEntries((usersData || []).map((user) => [user.id, user]));
  }

  return results
    .flatMap((result, index) => {
      const source = sources[index];

      return (result.data || []).map((row) => ({
        key: `${source.table}-${row.id}`,
        id: row.request_code || row.id,
        requestId: row.id,
        requestCode: row.request_code || row.id,
        userId: row.user_id,
        name: buildDisplayName(usersById[row.user_id]),
        category: source.category,
        date: formatDate(row.submitted_at || row.created_at),
        submittedAt: row.submitted_at || null,
        updatedAt: row.updated_at || null,
        createdAt: row.created_at,
        status: normalizeStatus(row.status),
        sourceTable: source.table,
        caseStudyDate: row.case_study_date ?? null,
      }));
    })
    .sort((a, b) => {
      const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
}
