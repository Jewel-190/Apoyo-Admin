import { supabase } from "./supabaseClient";
import { buildDisplayName } from "./requestData";

/**
 * Runs the service-side processor (Edge Function → `process_admin_notifications`)
 * so `admin_notification` is populated from `audit_logs`. Safe to call often;
 * failures are logged and reads still proceed with whatever rows already exist.
 */
async function syncAdminNotificationsFromAuditLogs() {
  const { error } = await supabase.functions.invoke("admin-notifications", {
    body: {},
  });

  if (error) {
    console.warn(
      "[adminNotifications] admin-notifications edge sync failed:",
      error.message
    );
  }
}

/**
 * Loads admin_notification rows (admin_user_id + audit_log_id only on the table).
 * Request, service, and category come from audit_logs + assistance_requests (joined in app).
 */
export async function fetchAdminNotificationsForAdmin(adminUserId) {
  if (!adminUserId) {
    return [];
  }

  await syncAdminNotificationsFromAuditLogs();

  const { data: rows, error } = await supabase
    .from("admin_notification")
    .select("id, admin_user_id, audit_log_id, is_read, created_at, updated_at")
    .eq("admin_user_id", adminUserId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const list = rows || [];
  const auditIds = [...new Set(list.map((r) => r.audit_log_id).filter(Boolean))];

  if (auditIds.length === 0) {
    return [];
  }

  const { data: audits, error: auditErr } = await supabase
    .from("audit_logs")
    .select("id, request_id, action, changed_by, changed_at, old_status, new_status")
    .in("id", auditIds);

  if (auditErr) {
    throw auditErr;
  }

  const auditById = Object.fromEntries((audits || []).map((a) => [a.id, a]));
  const requestIds = [
    ...new Set(
      (audits || []).map((a) => a.request_id).filter(Boolean)
    ),
  ];

  if (requestIds.length === 0) {
    return [];
  }

  const { data: requests, error: reqErr } = await supabase
    .from("assistance_requests")
    .select("id, service_id, status, request_code, user_id")
    .in("id", requestIds);

  if (reqErr) {
    throw reqErr;
  }

  const requestById = Object.fromEntries((requests || []).map((r) => [r.id, r]));

  const userIds = [...new Set((requests || []).map((r) => r.user_id).filter(Boolean))];
  let usersById = {};

  if (userIds.length > 0) {
    const { data: userRows, error: userErr } = await supabase
      .from("users")
      .select("id, first_name, middle_name, last_name, suffix")
      .in("id", userIds);

    if (userErr) {
      throw userErr;
    }

    usersById = Object.fromEntries((userRows || []).map((u) => [u.id, u]));
  }

  const serviceIds = [...new Set((requests || []).map((r) => r.service_id).filter(Boolean))];
  let servicesById = {};
  let categoriesById = {};

  if (serviceIds.length > 0) {
    const { data: svcRows, error: svcErr } = await supabase
      .from("assistance_services")
      .select("id, display_name, category_id")
      .in("id", serviceIds);

    if (svcErr) {
      throw svcErr;
    }

    servicesById = Object.fromEntries((svcRows || []).map((s) => [s.id, s]));

    const catIds = [...new Set((svcRows || []).map((s) => s.category_id).filter(Boolean))];
    if (catIds.length > 0) {
      const { data: catRows, error: catErr } = await supabase
        .from("assistance_categories")
        .select("id, slug, label")
        .in("id", catIds);

      if (catErr) {
        throw catErr;
      }

      categoriesById = Object.fromEntries((catRows || []).map((c) => [c.id, c]));
    }
  }

  return list.map((row) => {
    const al = auditById[row.audit_log_id] || {};
    const reqId = al.request_id;
    const req = reqId ? requestById[reqId] || {} : {};
    const svc = req.service_id ? servicesById[req.service_id] : null;
    const cat = svc?.category_id ? categoriesById[svc.category_id] : null;
    const applicant = req.user_id ? usersById[req.user_id] : null;

    return {
      id: row.id,
      admin_user_id: row.admin_user_id,
      audit_log_id: row.audit_log_id,
      is_read: row.is_read,
      created_at: row.created_at,
      updated_at: row.updated_at,
      assistance_request_id: reqId ?? null,
      request_table: "assistance_requests",
      request_id: reqId ?? null,
      service_id: req.service_id ?? null,
      assistanceCategorySlug: cat?.slug ?? null,
      assistanceCategoryName: cat?.label ?? svc?.display_name ?? "Other",
      applicantName: buildDisplayName(applicant, "Applicant"),
      requestCode: req.request_code ?? null,
      requestStatus: req.status ?? null,
      action: al.action ?? null,
      changed_by: al.changed_by ?? null,
      changed_at: al.changed_at ?? null,
      old_status: al.old_status ?? null,
      new_status: al.new_status ?? null,
      changed_by_role: null,
    };
  });
}

/**
 * Marks every inbox row for this admin whose audit belongs to the given assistance request.
 * Used when the request is opened in review (Notifications or ReviewApplications).
 */
export async function markAdminNotificationsReadForAssistanceRequest(
  adminUserId,
  assistanceRequestId
) {
  if (!adminUserId || !assistanceRequestId) {
    return;
  }

  const { data: audits, error: auditErr } = await supabase
    .from("audit_logs")
    .select("id")
    .eq("request_id", assistanceRequestId);

  if (auditErr) {
    throw auditErr;
  }

  const auditIds = (audits || []).map((a) => a.id).filter(Boolean);
  if (auditIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("admin_notification")
    .update({ is_read: true })
    .eq("admin_user_id", adminUserId)
    .in("audit_log_id", auditIds);

  if (error) {
    throw error;
  }
}
