import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

/**
 * POST /functions/v1/admin-notifications
 *
 * Janitor / reconciliation only — not the live delivery path.
 * Live inbox rows are created by `private.enqueue_admin_notification_for_audit`
 * (audit_logs trigger) and pushed via Supabase Realtime.
 *
 * This endpoint runs `process_admin_notifications()` (service_role) to:
 * 1) Delete stale rows (approved / complete / done, or category mismatch)
 * 2) Backfill any missed upserts from latest user-initiated audits
 *
 * Returns unread counts: full `unread_by_admin` only when authorized with
 * `ADMIN_NOTIFICATIONS_SECRET` (cron / server). JWT callers must be in
 * `public.admins` and receive only `unread_count` for themselves.
 *
 * Auth: `Authorization: Bearer <ADMIN_NOTIFICATIONS_SECRET>` when set,
 * otherwise a valid Supabase user JWT (see `_shared/client.ts`).
 *
 * Intended callers: admin login, manual Reload, optional scheduled cron.
 */
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();

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

    const insertedCount = Number(inserted ?? 0);

    // JWT callers: only sync + own unread (avoid exposing every admin's counts).
    if (!auth.viaSecret) {
      if (!auth.userId) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const { data: adminMembership, error: adminCheckError } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", auth.userId)
        .maybeSingle();

      if (adminCheckError) {
        throw adminCheckError;
      }

      if (!adminMembership) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const { data: myUnread, error: unreadError } = await supabase.rpc(
        "get_unread_notification_count_for_admin",
        { p_admin_user_id: auth.userId }
      );

      if (unreadError) {
        throw unreadError;
      }

      return jsonResponse({
        success: true,
        inserted_count: insertedCount,
        unread_count: Number(myUnread ?? 0),
      });
    }

    const { data: admins, error: adminsError } = await supabase
      .from("admins")
      .select("user_id, category_id, is_super_admin")
      .not("user_id", "is", null)
      .eq("is_super_admin", false);

    if (adminsError) {
      throw adminsError;
    }

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
          category_id: admin.category_id,
          unread_count: Number(unreadCount || 0),
        };
      })
    );

    return jsonResponse({
      success: true,
      inserted_count: insertedCount,
      unread_by_admin: unreadByAdmin,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
