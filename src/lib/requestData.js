import { supabase } from "./supabaseClient";

export const STATUS_LABELS = {
  draft: "Draft",
  pending: "Pending",
  "in progress": "In Progress",
  "action required": "Action Required",
  resubmitted: "Resubmitted",
  approved: "Approved",
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
  const withSubmittedAt = await supabase
    .from(tableName)
    .select("id, request_code, user_id, created_at, submitted_at, status")
    .neq("status", "draft")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!withSubmittedAt.error) {
    return withSubmittedAt;
  }

  return supabase
    .from(tableName)
    .select("id, request_code, user_id, created_at, status")
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
        createdAt: row.created_at,
        status: normalizeStatus(row.status),
        sourceTable: source.table,
      }));
    })
    .sort((a, b) => {
      const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
}
