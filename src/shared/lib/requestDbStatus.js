/**
 * Canonical request-row `status` values persisted to Supabase (see migration
 * `202605030003_request_tables_scheduled_status.sql` CHECK constraints).
 * Use these in `.update({ status })` to stay aligned with the DB.
 */
export const REQUEST_DB_STATUS = {
  FOR_APPROVAL: "for approval",
  SCHEDULED: "scheduled",
  APPROVED: "approved",
  DECLINED: "declined",
};

