/**
 * Wrapper around the `admin_request_op` Supabase RPC (super_admin only).
 */

import { supabase } from "../lib/supabaseClient";
import { invalidateAdminPipelineCaches } from "../lib/requestData";

/**
 * @typedef {"insert" | "update" | "delete" | "transition_status"} AdminRequestOp
 */

/**
 * @param {Object} params
 * @param {AdminRequestOp} params.op
 * @param {string}         [params.serviceId]  assistance_services.id (required for insert)
 * @param {string}         params.requestId    UUID
 * @param {Record<string, unknown>} [params.patch]
 */
export async function adminRequestOp(params) {
  const patch = { ...(params.patch ?? {}) };
  if (params.serviceId && params.op === "insert") {
    patch.service_id = params.serviceId;
  }

  const { data, error } = await supabase.rpc("admin_request_op", {
    op: params.op,
    service_type: null,
    request_id: params.requestId,
    patch,
  });
  if (error) throw error;
  invalidateAdminPipelineCaches();
  return data;
}

export const adminRequest = {
  insert: (serviceId, patch) =>
    adminRequestOp({ op: "insert", serviceId, requestId: undefined, patch }),

  update: (requestId, patch) =>
    adminRequestOp({ op: "update", requestId, patch }),

  delete: (requestId) =>
    adminRequestOp({ op: "delete", requestId }),

  transitionStatus: (requestId, newStatus) =>
    adminRequestOp({
      op: "transition_status",
      requestId,
      patch: { status: newStatus },
    }),
};
