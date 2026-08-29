import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { AUDIT_MODULES, createAuditor } from "../_shared/auditTrail.ts";

type CredentialsPayload = {
  action?: "create" | "update" | "delete";
  category_id?: string | null;
  user_id?: string | null;
  email?: string | null;
  password?: string | null;
};

function parseEmail(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function parsePassword(value: unknown): string {
  return String(value ?? "").trim();
}

function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isUuidLike(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

async function ensureSuperAdminCaller(
  supabase: ReturnType<typeof getServiceClient>,
  callerUserId: string
) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: callerUserId });
  if (error) throw error;
  if (data !== true) {
    return { ok: false as const, response: jsonResponse({ error: "Forbidden" }, 403) };
  }
  return { ok: true as const };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();

    const auth = await authorizeRequest(req, supabase);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    if (auth.viaSecret || !auth.userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const superAdminCheck = await ensureSuperAdminCaller(supabase, auth.userId);
    if (!superAdminCheck.ok) {
      return superAdminCheck.response;
    }

    const auditor = createAuditor(supabase, req, auth.userId);

    let payload: CredentialsPayload;
    try {
      payload = (await req.json()) as CredentialsPayload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = String(payload.action ?? "").trim().toLowerCase();
    if (action !== "create" && action !== "update" && action !== "delete") {
      return jsonResponse({ error: "Invalid action. Use create, update, or delete." }, 400);
    }

    if (action === "create") {
      const categoryId = String(payload.category_id ?? "").trim();
      const email = parseEmail(payload.email);
      const password = parsePassword(payload.password);

      if (!isUuidLike(categoryId)) {
        return jsonResponse({ error: "category_id is required." }, 400);
      }
      if (!looksLikeEmail(email)) {
        return jsonResponse({ error: "A valid email is required." }, 400);
      }
      if (password.length < 8) {
        return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
      }

      const { data: category, error: categoryError } = await supabase
        .from("assistance_categories")
        .select("id")
        .eq("id", categoryId)
        .maybeSingle();

      if (categoryError) throw categoryError;
      if (!category) {
        return jsonResponse({ error: "Assistance category not found." }, 404);
      }

      const { data: created, error: createAuthError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createAuthError || !created?.user?.id) {
        return jsonResponse(
          { error: createAuthError?.message || "Failed to create auth user." },
          400
        );
      }

      const createdUserId = created.user.id;
      const { error: insertAdminError } = await supabase.from("admins").insert({
        user_id: createdUserId,
        is_super_admin: false,
        category_id: categoryId,
      });

      if (insertAdminError) {
        // Roll back auth user when admin row fails to keep records consistent.
        await supabase.auth.admin.deleteUser(createdUserId);
        throw insertAdminError;
      }

      await auditor.record({
        action: "create",
        module: AUDIT_MODULES.DATA_ADMINS,
        resourceType: "admin",
        resourceId: createdUserId,
        summary: `Created line admin ${email}`,
        metadata: { categoryId },
      });
      return jsonResponse({
        success: true,
        action: "create",
        admin: {
          user_id: createdUserId,
          category_id: categoryId,
          is_super_admin: false,
          email,
        },
      });
    }

    const userId = String(payload.user_id ?? "").trim();

    if (!isUuidLike(userId)) {
      return jsonResponse({ error: "user_id is required." }, 400);
    }

    const { data: adminRow, error: adminLookupError } = await supabase
      .from("admins")
      .select("user_id, category_id, is_super_admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (adminLookupError) throw adminLookupError;
    if (!adminRow) {
      return jsonResponse({ error: "Admin not found." }, 404);
    }
    if (adminRow.is_super_admin) {
      return jsonResponse({ error: "Superadmin credentials cannot be deleted here." }, 400);
    }
    if (userId === auth.userId) {
      return jsonResponse({ error: "You cannot delete your own admin account." }, 400);
    }

    if (action === "delete") {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 400);
      }

      await auditor.record({
        action: "delete",
        module: AUDIT_MODULES.DATA_ADMINS,
        resourceType: "admin",
        resourceId: userId,
        summary: `Deleted line admin ${userId}`,
        metadata: { categoryId: adminRow.category_id },
      });
      return jsonResponse({
        success: true,
        action: "delete",
        admin: {
          user_id: userId,
          category_id: adminRow.category_id,
          is_super_admin: adminRow.is_super_admin,
        },
      });
    }

    const email = parseEmail(payload.email);
    const password = parsePassword(payload.password);
    if (!email && !password) {
      return jsonResponse({ error: "Provide at least email or password to update." }, 400);
    }
    if (email && !looksLikeEmail(email)) {
      return jsonResponse({ error: "A valid email is required." }, 400);
    }
    if (password && password.length < 8) {
      return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
    }

    const updatePayload: { email?: string; password?: string; email_confirm?: boolean } = {};
    if (email) {
      updatePayload.email = email;
      updatePayload.email_confirm = true;
    }
    if (password) {
      updatePayload.password = password;
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      userId,
      updatePayload
    );
    if (updateAuthError) {
      return jsonResponse({ error: updateAuthError.message }, 400);
    }

    const { data: refreshedAuth, error: refreshedError } = await supabase.auth.admin.getUserById(
      userId
    );
    if (refreshedError) throw refreshedError;

    await auditor.record({
      action: "update",
      module: AUDIT_MODULES.DATA_ADMINS,
      resourceType: "admin",
      resourceId: userId,
      summary: `Updated line admin credentials ${refreshedAuth?.user?.email ?? email ?? userId}`,
      metadata: { emailChanged: Boolean(email), passwordChanged: Boolean(password) },
    });
    return jsonResponse({
      success: true,
      action: "update",
      admin: {
        user_id: adminRow.user_id,
        category_id: adminRow.category_id,
        is_super_admin: adminRow.is_super_admin,
        email: refreshedAuth?.user?.email ?? email ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
