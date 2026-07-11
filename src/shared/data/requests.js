/**
 * Cross-cutting requests data layer for the admin app.
 */

import { supabase } from "../lib/supabaseClient";
import { invalidateAdminPipelineCaches } from "../lib/requestData";

/**
 * @typedef {Object} ListRequestsParams
 * @property {string} [userId]
 * @property {string[]} [serviceIds]
 * @property {string[]} [statuses]
 * @property {number}   [limit]
 */

/**
 * @param {ListRequestsParams} [params]
 * @returns {Promise<Array>}
 */
export async function listRequestsView(params = {}) {
  let q = supabase
    .from("assistance_requests")
    .select(
      "id, request_code, user_id, status, submitted_at, updated_at, created_at, service_id, assistance_services(display_name)"
    )
    .order("updated_at", { ascending: false })
    .limit(params.limit ?? 100);

  if (params.userId) q = q.eq("user_id", params.userId);
  if (params.serviceIds?.length) q = q.in("service_id", params.serviceIds);
  if (params.statuses?.length) q = q.in("status", params.statuses);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch a single row from `assistance_requests` by id (optional service_id scope).
 */
export async function getRequestRow({ serviceId, requestId }) {
  let q = supabase.from("assistance_requests").select("*").eq("id", requestId);
  if (serviceId) {
    q = q.eq("service_id", serviceId);
  }
  const { data, error } = await q.maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

/**
 * Update fields on `assistance_requests`.
 */
export async function updateRequestRow({ serviceId, requestId, patch }) {
  let q = supabase.from("assistance_requests").update(patch).eq("id", requestId);
  if (serviceId) {
    q = q.eq("service_id", serviceId);
  }
  const { error } = await q;
  if (error) throw error;
  invalidateAdminPipelineCaches();
}
