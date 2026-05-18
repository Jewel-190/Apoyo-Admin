/**
 * Canonical Postgres table names. Synced 1:1 with
 * `ApoyoMobile/shared/domain/requestTables.ts` — do not edit one
 * without the other. Run `scripts/sync-shared.ps1` from the mobile
 * repo to refresh.
 */

export const REQUEST_TABLES = [
  "hospitalization_requests",
  "treatment_requests",
  "medical_requests",
  "financial_requests",
  "monetary_requests",
  "burial_requests",
  "cremation_requests",
  "columbarium_requests",
];

export function isRequestTableName(value) {
  if (!value) return false;
  return REQUEST_TABLES.includes(String(value));
}
