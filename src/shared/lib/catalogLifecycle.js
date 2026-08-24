/**
 * Catalog visibility (`active` column) is the source of truth for NEW picks.
 * Archive = set `active` to false (soft-delete). Live loaders (CMS lists, mobile home)
 * must filter `.eq("active", true)`. Historical requests/logs/notifications keep
 * snapshots on `assistance_requests` and must not require `active = true`.
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} categoryId — assistance_categories.id (uuid)
 */
export async function archiveAssistanceCategory(supabase, categoryId) {
  const id = String(categoryId || "").trim();
  if (!id) {
    throw new Error("Category id is required.");
  }

  const { error: servicesError } = await supabase
    .from("assistance_services")
    .update({ active: false })
    .eq("category_id", id)
    .eq("active", true);

  if (servicesError) {
    throw servicesError;
  }

  const { data: archived, error: categoryError } = await supabase
    .from("assistance_categories")
    .update({ active: false })
    .eq("id", id)
    .eq("active", true)
    .select("id")
    .maybeSingle();

  if (categoryError) {
    throw categoryError;
  }

  if (archived?.id) {
    return { archived: true, alreadyArchived: false };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("assistance_categories")
    .select("id, active")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }
  if (!existing) {
    throw new Error("Assistance category not found.");
  }
  if (existing.active === false) {
    return { archived: true, alreadyArchived: true };
  }

  throw new Error("Could not archive assistance category.");
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} serviceId — assistance_services.id (uuid)
 */
export async function archiveAssistanceService(supabase, serviceId) {
  const id = String(serviceId || "").trim();
  if (!id) {
    throw new Error("Service id is required.");
  }

  const { data: archived, error } = await supabase
    .from("assistance_services")
    .update({ active: false })
    .eq("id", id)
    .eq("active", true)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (archived?.id) {
    return { archived: true, alreadyArchived: false };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("assistance_services")
    .select("id, active")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    throw lookupError;
  }
  if (!existing) {
    throw new Error("Service not found.");
  }
  if (existing.active === false) {
    return { archived: true, alreadyArchived: true };
  }

  throw new Error("Could not archive service.");
}
