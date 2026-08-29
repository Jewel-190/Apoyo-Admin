/** Historical applicant identity stored on assistance_requests at submit. */

export const APPLICANT_SNAPSHOT_SELECT = [
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
].join(", ");

function scalar(value: unknown): string {
  return String(value ?? "").trim();
}

export function applicantDisplayNameFromRequest(
  row: Record<string, unknown> | null | undefined,
  fallback = "Unknown Applicant"
): string {
  if (!row) return fallback;
  const parts = [
    row.applicant_first_name,
    row.applicant_middle_name,
    row.applicant_last_name,
    row.applicant_suffix,
  ]
    .map((part) => scalar(part))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : fallback;
}

export function applicantRecordFromRequest(
  row: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!row) return null;
  const hasIdentity =
    scalar(row.applicant_first_name) ||
    scalar(row.applicant_last_name) ||
    scalar(row.applicant_email) ||
    scalar(row.applicant_contact_number);
  if (!hasIdentity) return null;
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
