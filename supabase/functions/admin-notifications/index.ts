import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();

    // This endpoint is intended for trusted server callers (cron / scheduled
    // job). When ADMIN_NOTIFICATIONS_SECRET is set, require it. Otherwise
    // fall back to a valid Supabase access token to avoid breaking existing
    // callers.
    const auth = await authorizeRequest(
      req,
      supabase,
      "ADMIN_NOTIFICATIONS_SECRET"
    );

    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }

    const { data: inserted, error: processError } = await supabase.rpc(
      "process_admin_notifications"
    );

    if (processError) {
      throw processError;
    }

    const { data: admins, error: adminsError } = await supabase
      .from("admins")
      .select("user_id, role, service_type")
      .in("role", ["medical_admin", "financial_admin", "burial_admin"])
      .order("role", { ascending: true });

    if (adminsError) {
      throw adminsError;
    }

    // Fetch unread counts in parallel rather than sequentially per-admin.
    const unreadByAdmin = await Promise.all(
      (admins || []).map(async (admin) => {
        const { data: unreadCount, error: unreadError } = await supabase.rpc(
          "get_unread_notification_count_for_admin",
          { p_admin_user_id: admin.user_id }
        );

        if (unreadError) {
          throw unreadError;
        }

        return {
          user_id: admin.user_id,
          role: admin.role,
          service_type: admin.service_type,
          unread_count: Number(unreadCount || 0),
        };
      })
    );

    return jsonResponse({
      success: true,
      inserted_count: Number(inserted || 0),
      unread_by_admin: unreadByAdmin,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
