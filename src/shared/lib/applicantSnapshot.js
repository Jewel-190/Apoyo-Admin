/**
 * Historical applicant identity stored on assistance_requests.
 * After submit these fields are frozen; do not read public.users for request UI.
 */

export const APPLICANT_SNAPSHOT_COLUMNS = [
  "applicant_first_name",
  "applicant_middle_name",
  "applicant_last_name",
  "applicant_suffix",
  "applicant_sex",
  "applicant_birth_date",
  "applicant_email",
  "applicant_contact_number",
  "applicant_address",
  "applicant_barangay",
  "applicant_voter_id_number",
  "applicant_snapshot_at",
];

export const APPLICANT_SNAPSHOT_SELECT = APPLICANT_SNAPSHOT_COLUMNS.join(", ");

function nonEmpty(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function hasApplicantSnapshot(row) {
  if (!row || typeof row !== "object") {
    return false;
  }
  return (
    nonEmpty(row.applicant_first_name) ||
    nonEmpty(row.applicant_last_name) ||
    nonEmpty(row.applicant_email) ||
    nonEmpty(row.applicant_contact_number)
  );
}

/** Shape compatible with buildDisplayName / getFirstValue (live users row). */
export function applicantRecordFromRequest(row) {
  if (!hasApplicantSnapshot(row)) {
    return null;
  }

  return {
    id: row.user_id ?? null,
    first_name: row.applicant_first_name ?? "",
    middle_name: row.applicant_middle_name ?? "",
    last_name: row.applicant_last_name ?? "",
    suffix: row.applicant_suffix ?? "",
    sex: row.applicant_sex ?? "",
    birth_date: row.applicant_birth_date ?? null,
    email: row.applicant_email ?? "",
    contact_number: row.applicant_contact_number ?? "",
    address: row.applicant_address ?? "",
    barangay: row.applicant_barangay ?? "",
    voter_id_number: row.applicant_voter_id_number ?? "",
  };
}

export function applicantDisplayNameFromRequest(row, fallback = "Unknown Applicant") {
  const record = applicantRecordFromRequest(row);
  if (!record) {
    return fallback;
  }
  const parts = [
    record.first_name,
    record.middle_name,
    record.last_name,
    record.suffix,
  ].filter((part) => nonEmpty(part));
  return parts.length > 0 ? parts.join(" ") : fallback;
}
