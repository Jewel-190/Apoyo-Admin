// Shared Supabase service-role client construction.
// Pinned to match the supabase-js version used by the frontend (see package.json).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

export type ServiceClient = SupabaseClient;

export function getServiceClient(): ServiceClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or service role key environment variables."
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verify the inbound Authorization header.
 * - If `secretEnvVar` is set on the function and the header carries that exact
 *   secret, the call is treated as a trusted server-to-server invocation.
 * - Otherwise the header is interpreted as a Supabase user access token and
 *   is resolved through `auth.getUser`. Returns the user id on success.
 */
export async function authorizeRequest(
  req: Request,
  client: ServiceClient,
  secretEnvVar?: string
): Promise<
  | { ok: true; viaSecret: true; userId: null }
  | { ok: true; viaSecret: false; userId: string }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get("authorization") || "";
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (secretEnvVar) {
    const secret = Deno.env.get(secretEnvVar);
    if (secret && provided && provided === secret) {
      return { ok: true, viaSecret: true, userId: null };
    }
  }

  if (!provided) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const { data, error } = await client.auth.getUser(provided);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true, viaSecret: false, userId: data.user.id };
}
