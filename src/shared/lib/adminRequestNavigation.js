import { normalizeStatus, formatDate } from "./requestData";
import { supabase } from "./supabaseClient";
import { applicantDisplayNameFromRequest, APPLICANT_SNAPSHOT_SELECT } from "./applicantSnapshot";

/**
 * Map a request status to the admin module that owns that queue.
 */
export function resolveAdminModulePathForStatus(status) {
  const label = normalizeStatus(status);

  switch (label) {
    case "Action Required":
      return "/admin/applications/action-required";
    case "Resubmitted":
      return "/admin/applications/resubmissions";
    case "For Approval":
      return "/admin/scheduling";
    case "Scheduled":
    case "Case Study":
      return "/admin/case-study";
    case "Approved":
    case "Declined":
      return "/admin/archive";
    case "Pending":
    case "In Progress":
    default:
      return "/admin/applications/overview";
  }
}

export function buildOpenRequestLocationState(requestId) {
  return {
    openRequestId: String(requestId),
    // Nonce so re-clicking the same request while already on that module still triggers open.
    openRequestNonce: Date.now(),
  };
}

/**
 * Clear React Router location state without a remount.
 * Prefer this over window.history.replaceState, which does not update useLocation().
 */
export function consumeOpenRequestLocationState(navigate, pathname) {
  if (typeof navigate !== "function") {
    return;
  }
  navigate(pathname || window.location.pathname, { replace: true, state: null });
}

/**
 * Direct fetch used when the module list does not yet contain the request
 * (stale cache, race, or status filter mismatch).
 */
export async function fetchAdminApplicationByRequestId(
  requestId,
  allowedServiceIds = []
) {
  if (!requestId) {
    return null;
  }

  let reqQuery = supabase
    .from("assistance_requests")
    .select(`id, request_code, user_id, created_at, submitted_at, status, service_id, ${APPLICANT_SNAPSHOT_SELECT}`)
    .eq("id", requestId);

  if (allowedServiceIds?.length > 0) {
    reqQuery = reqQuery.in("service_id", allowedServiceIds);
  }

  const { data: requestRow, error: reqErr } = await reqQuery.maybeSingle();
  if (reqErr) {
    throw reqErr;
  }
  if (!requestRow) {
    return null;
  }

  const { data: svcRow } = await supabase
    .from("assistance_services")
    .select("id, display_name")
    .eq("id", requestRow.service_id)
    .maybeSingle();

  const applicantName = applicantDisplayNameFromRequest(requestRow);

  const submittedAt = requestRow.submitted_at || null;
  const createdAt = requestRow.created_at || null;
  const serviceId = requestRow.service_id || null;

  return {
    key: `${serviceId || "unknown"}-${requestRow.id}`,
    id: requestRow.request_code || requestRow.id,
    requestId: requestRow.id,
    requestCode: requestRow.request_code || requestRow.id,
    userId: requestRow.user_id || null,
    name: applicantName,
    category: svcRow?.display_name || "Request",
    date: formatDate(submittedAt || createdAt),
    submittedAt,
    createdAt,
    status: normalizeStatus(requestRow.status),
    serviceId,
  };
}
