import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

/**
 * POST /functions/v1/super-admin-services-management
 *
 * Superadmin Content Management (Services) catalog reads/writes.
 * Auth: JWT user must pass is_superadmin().
 *
 * Actions:
 *  - catalog.list
 *  - catalog.service.get
 *  - category.create
 *  - category.update
 *  - category.archive
 *  - service.save
 *  - service.archive
 */

const ADDITIONAL_ATTACHMENT_SLOT = "attachment";
const DEFAULT_ADDITIONAL_FILE_TYPE = "attachment_file";
const DEFAULT_ADDITIONAL_TITLE = "Additional attachment";

const CATALOG_SELECT = {
  categoriesFull: "id,slug,assistance_name,description,sort_order,active,theme_json",
  servicesList:
    "id,category_id,display_name,request_code,description_html,mobile_image_url,sort_order,active,attachment_slot_map",
  servicesDetail:
    "id,category_id,display_name,request_code,description_html,about_html,who_bullets,mobile_image_url,reminder_text,web_intro_html,cms_metadata,radio_selection,attachment_slot_map,sort_order,active",
  requirementsDetail: "id,service_id,slot_key,title,help,sort_order,metadata",
  tips: "id,requirement_id,title,description,sort_order",
};

type ServiceClient = ReturnType<typeof getServiceClient>;

async function ensureSuperAdminCaller(supabase: ServiceClient, callerUserId: string) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: callerUserId });
  if (error) throw error;
  if (data !== true) {
    return { ok: false as const, response: jsonResponse({ error: "Forbidden" }, 403) };
  }
  return { ok: true as const };
}

function slugify(text: unknown) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 64);
}

function sanitizeRequirementHelpText(value: unknown) {
  const raw = String(value ?? "");
  if (!raw) return "";
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRequirementMetadata(req: Record<string, unknown>) {
  const image = String(req?.sampleDocumentImage || "");
  const name = String(req?.sampleDocumentName || "");
  if (!image && !name) return {};
  return { sampleDocumentImage: image, sampleDocumentName: name };
}

function sortCatalogRows<T extends { sort_order?: number | null }>(rows: T[] | null | undefined) {
  return [...(rows ?? [])].sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0));
}

function stitchTipsOntoRequirements(
  requirements: Record<string, unknown>[],
  tips: Record<string, unknown>[]
) {
  const tipsByRequirementId = new Map<string, Record<string, unknown>[]>();
  for (const tip of tips ?? []) {
    const key = String(tip.requirement_id ?? "");
    if (!tipsByRequirementId.has(key)) tipsByRequirementId.set(key, []);
    tipsByRequirementId.get(key)!.push(tip);
  }

  return sortCatalogRows(requirements as { sort_order?: number | null }[]).map((req) => ({
    ...req,
    assistance_requirement_tips: sortCatalogRows(
      tipsByRequirementId.get(String((req as Record<string, unknown>).id)) ?? []
    ),
  }));
}

function stitchCatalogRows({
  categories,
  services,
  requirements = [],
  tips = [],
}: {
  categories: Record<string, unknown>[];
  services: Record<string, unknown>[];
  requirements?: Record<string, unknown>[];
  tips?: Record<string, unknown>[];
}) {
  const requirementsWithTips = stitchTipsOntoRequirements(requirements, tips);
  const requirementsByServiceId = new Map<string, Record<string, unknown>[]>();
  for (const req of requirementsWithTips) {
    const key = String(req.service_id ?? "");
    if (!requirementsByServiceId.has(key)) requirementsByServiceId.set(key, []);
    requirementsByServiceId.get(key)!.push(req);
  }

  const servicesByCategoryId = new Map<string, Record<string, unknown>[]>();
  for (const svc of services ?? []) {
    const key = String(svc.category_id ?? "");
    if (!servicesByCategoryId.has(key)) servicesByCategoryId.set(key, []);
    servicesByCategoryId.get(key)!.push({
      ...svc,
      assistance_requirements: sortCatalogRows(
        requirementsByServiceId.get(String(svc.id)) ?? []
      ),
    });
  }

  return sortCatalogRows(categories as { sort_order?: number | null }[]).map((cat) => ({
    ...cat,
    assistance_services: sortCatalogRows(
      servicesByCategoryId.get(String((cat as Record<string, unknown>).id)) ?? []
    ),
  }));
}

async function listCatalog(supabase: ServiceClient) {
  const { data: categories, error: catErr } = await supabase
    .from("assistance_categories")
    .select(CATALOG_SELECT.categoriesFull)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (catErr) throw catErr;

  const categoryIds = (categories ?? []).map((row) => row.id).filter(Boolean);
  let services: Record<string, unknown>[] = [];
  if (categoryIds.length) {
    const { data: serviceRows, error: svcErr } = await supabase
      .from("assistance_services")
      .select(CATALOG_SELECT.servicesList)
      .in("category_id", categoryIds)
      .eq("active", true);
    if (svcErr) throw svcErr;
    services = (serviceRows ?? []) as Record<string, unknown>[];
  }

  return stitchCatalogRows({
    categories: (categories ?? []) as Record<string, unknown>[],
    services,
    requirements: [],
    tips: [],
  });
}

async function getServiceDetail(supabase: ServiceClient, serviceId: string) {
  const id = String(serviceId ?? "").trim();
  if (!id) throw new Error("Service id is required.");

  const { data: service, error: serviceErr } = await supabase
    .from("assistance_services")
    .select(CATALOG_SELECT.servicesDetail)
    .eq("id", id)
    .maybeSingle();
  if (serviceErr) throw serviceErr;
  if (!service) throw new Error("Service not found.");

  const { data: requirements, error: reqErr } = await supabase
    .from("assistance_requirements")
    .select(CATALOG_SELECT.requirementsDetail)
    .eq("service_id", id);
  if (reqErr) throw reqErr;

  const requirementIds = (requirements ?? []).map((row) => row.id).filter(Boolean);
  let tips: Record<string, unknown>[] = [];
  if (requirementIds.length) {
    const { data: tipRows, error: tipErr } = await supabase
      .from("assistance_requirement_tips")
      .select(CATALOG_SELECT.tips)
      .in("requirement_id", requirementIds);
    if (tipErr) throw tipErr;
    tips = (tipRows ?? []) as Record<string, unknown>[];
  }

  return {
    ...service,
    assistance_requirements: stitchTipsOntoRequirements(
      (requirements ?? []) as Record<string, unknown>[],
      tips
    ),
  };
}

async function generateUniqueCategorySlug(supabase: ServiceClient, label: string) {
  const base = slugify(label) || "category";
  const { data: existing, error } = await supabase
    .from("assistance_categories")
    .select("slug")
    .like("slug", `${base}%`);
  if (error) throw error;
  const taken = new Set((existing ?? []).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

async function getNextCategorySortOrder(supabase: ServiceClient) {
  const { data, error } = await supabase
    .from("assistance_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  const top = Array.isArray(data) && data.length ? data[0]?.sort_order : null;
  const n = Number.isFinite(top) ? Number(top) : 0;
  return n + 1;
}

async function ensureAttachmentSlotMap(supabase: ServiceClient, serviceId: string) {
  const { data: svc, error } = await supabase
    .from("assistance_services")
    .select("attachment_slot_map")
    .eq("id", serviceId)
    .single();
  if (error) throw error;

  const { data: requirements, error: reqErr } = await supabase
    .from("assistance_requirements")
    .select("slot_key")
    .eq("service_id", serviceId);
  if (reqErr) throw reqErr;

  const map =
    svc?.attachment_slot_map && typeof svc.attachment_slot_map === "object"
      ? { ...(svc.attachment_slot_map as Record<string, unknown>) }
      : {};

  let changed = false;
  for (const row of requirements ?? []) {
    const slotKey = String(row?.slot_key ?? "").trim();
    if (!slotKey || map[slotKey]) continue;
    map[slotKey] = slotKey;
    changed = true;
  }
  if (!map[ADDITIONAL_ATTACHMENT_SLOT]) {
    map[ADDITIONAL_ATTACHMENT_SLOT] = DEFAULT_ADDITIONAL_FILE_TYPE;
    changed = true;
  }
  if (!changed) return;

  const { error: updateErr } = await supabase
    .from("assistance_services")
    .update({ attachment_slot_map: map })
    .eq("id", serviceId);
  if (updateErr) throw updateErr;
}

async function clearRequirementTips(supabase: ServiceClient, requirementId: string) {
  if (!requirementId) return;
  const { error } = await supabase
    .from("assistance_requirement_tips")
    .delete()
    .eq("requirement_id", requirementId);
  if (error) throw error;
}

async function ensureAdditionalAttachmentRequirement(
  supabase: ServiceClient,
  serviceId: string,
  additionalAttachment: Record<string, unknown> | null | undefined,
  sortOrder: number
) {
  const title =
    String(additionalAttachment?.title ?? "").trim() || DEFAULT_ADDITIONAL_TITLE;

  const { data: existing, error: fetchErr } = await supabase
    .from("assistance_requirements")
    .select("id")
    .eq("service_id", serviceId)
    .eq("slot_key", ADDITIONAL_ATTACHMENT_SLOT)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  let requirementId = existing?.id ?? null;

  if (requirementId) {
    const { error } = await supabase
      .from("assistance_requirements")
      .update({
        title,
        help: null,
        sort_order: sortOrder,
        required: true,
        metadata: {},
      })
      .eq("id", requirementId);
    if (error) throw error;
  } else {
    const { data: inserted, error } = await supabase
      .from("assistance_requirements")
      .insert({
        service_id: serviceId,
        slot_key: ADDITIONAL_ATTACHMENT_SLOT,
        title,
        help: null,
        sort_order: sortOrder,
        required: true,
        metadata: {},
      })
      .select("id")
      .single();
    if (error) throw error;
    requirementId = inserted.id;
  }

  await clearRequirementTips(supabase, requirementId);
  return requirementId;
}

async function saveRequirementsForService(
  supabase: ServiceClient,
  serviceId: string,
  requirements: unknown[],
  additionalAttachment: Record<string, unknown> | null | undefined
) {
  const cleaned = (requirements || [])
    .map((raw) => {
      const req = (raw ?? {}) as Record<string, unknown>;
      return {
        _id: (req._id as string | null) ?? null,
        _slotKey: (req._slotKey as string | null) ?? null,
        title: String(req.title ?? "").trim(),
        help: sanitizeRequirementHelpText(req.help ?? ""),
        sampleDocumentImage: String(req.sampleDocumentImage || ""),
        sampleDocumentName: String(req.sampleDocumentName || ""),
        tips: (Array.isArray(req.tips) ? req.tips : [])
          .map((tip) =>
            typeof tip === "string"
              ? { title: tip.trim(), description: "" }
              : {
                  title: String((tip as Record<string, unknown>)?.title ?? "").trim(),
                  description: String((tip as Record<string, unknown>)?.description ?? "").trim(),
                }
          )
          .filter((tip) => tip.title),
      };
    })
    .filter((req) => req.title);

  const { data: existingRows, error: existingErr } = await supabase
    .from("assistance_requirements")
    .select("id, slot_key")
    .eq("service_id", serviceId);
  if (existingErr) throw existingErr;

  const existingById = new Map((existingRows ?? []).map((r) => [r.id, r]));
  const submittedIds = new Set(cleaned.map((r) => r._id).filter(Boolean));

  const toDelete = (existingRows ?? [])
    .filter(
      (r) => !submittedIds.has(r.id) && r.slot_key !== ADDITIONAL_ATTACHMENT_SLOT
    )
    .map((r) => r.id);
  if (toDelete.length) {
    const { error } = await supabase.from("assistance_requirements").delete().in("id", toDelete);
    if (error) throw error;
  }

  const reservedSlotKeys = new Set(
    cleaned
      .filter((r) => r._id && existingById.has(r._id))
      .map((r) => r._slotKey)
      .filter(Boolean) as string[]
  );
  const reserveSlotKey = (rawTitle: string, index: number) => {
    let base = slugify(rawTitle) || `req-${index + 1}`;
    if (!reservedSlotKeys.has(base)) {
      reservedSlotKeys.add(base);
      return base;
    }
    let n = 2;
    while (reservedSlotKeys.has(`${base}-${n}`)) n += 1;
    const next = `${base}-${n}`;
    reservedSlotKeys.add(next);
    return next;
  };

  const resolvedIds: string[] = [];
  for (let index = 0; index < cleaned.length; index += 1) {
    const req = cleaned[index];
    if (req._id && existingById.has(req._id)) {
      const { error } = await supabase
        .from("assistance_requirements")
        .update({
          title: req.title,
          help: req.help || null,
          sort_order: index + 1,
          metadata: buildRequirementMetadata(req),
        })
        .eq("id", req._id);
      if (error) throw error;
      resolvedIds.push(req._id);
    } else {
      const slotKey = reserveSlotKey(req.title, index);
      const { data: inserted, error } = await supabase
        .from("assistance_requirements")
        .insert({
          service_id: serviceId,
          slot_key: slotKey,
          title: req.title,
          help: req.help || null,
          sort_order: index + 1,
          required: true,
          metadata: buildRequirementMetadata(req),
        })
        .select("id")
        .single();
      if (error) throw error;
      resolvedIds.push(inserted.id);
    }
  }

  for (let index = 0; index < cleaned.length; index += 1) {
    const requirementId = resolvedIds[index];
    const req = cleaned[index];
    const { error: tipDelErr } = await supabase
      .from("assistance_requirement_tips")
      .delete()
      .eq("requirement_id", requirementId);
    if (tipDelErr) throw tipDelErr;

    if (req.tips.length) {
      const tipRows = req.tips.map((tip, tipIndex) => ({
        requirement_id: requirementId,
        title: tip.title,
        description: tip.description,
        sort_order: tipIndex + 1,
      }));
      const { error: tipInsErr } = await supabase
        .from("assistance_requirement_tips")
        .insert(tipRows);
      if (tipInsErr) throw tipInsErr;
    }
  }

  await ensureAttachmentSlotMap(supabase, serviceId);
  await ensureAdditionalAttachmentRequirement(
    supabase,
    serviceId,
    additionalAttachment,
    cleaned.length + 1
  );
}

async function archiveCategory(supabase: ServiceClient, categoryId: string) {
  const id = String(categoryId || "").trim();
  if (!id) throw new Error("Category id is required.");

  const { error: servicesError } = await supabase
    .from("assistance_services")
    .update({ active: false })
    .eq("category_id", id)
    .eq("active", true);
  if (servicesError) throw servicesError;

  const { data: archived, error: categoryError } = await supabase
    .from("assistance_categories")
    .update({ active: false })
    .eq("id", id)
    .eq("active", true)
    .select("id")
    .maybeSingle();
  if (categoryError) throw categoryError;

  if (archived?.id) {
    return { archived: true, alreadyArchived: false };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("assistance_categories")
    .select("id, active")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error("Assistance category not found.");
  if (existing.active === false) {
    return { archived: true, alreadyArchived: true };
  }
  throw new Error("Could not archive assistance category.");
}

async function archiveService(supabase: ServiceClient, serviceId: string) {
  const id = String(serviceId || "").trim();
  if (!id) throw new Error("Service id is required.");

  const { data: archived, error } = await supabase
    .from("assistance_services")
    .update({ active: false })
    .eq("id", id)
    .eq("active", true)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (archived?.id) {
    return { archived: true, alreadyArchived: false };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("assistance_services")
    .select("id, active")
    .eq("id", id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing) throw new Error("Service not found.");
  if (existing.active === false) {
    return { archived: true, alreadyArchived: true };
  }
  throw new Error("Could not archive service.");
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

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = String(body.action ?? "").trim();

    if (action === "catalog.list") {
      const catalog = await listCatalog(supabase);
      return jsonResponse({ success: true, action, catalog });
    }

    if (action === "catalog.service.get") {
      const service = await getServiceDetail(supabase, String(body.serviceId ?? ""));
      return jsonResponse({ success: true, action, service });
    }

    if (action === "category.create") {
      const assistanceName = String(body.assistance_name ?? "").trim();
      if (!assistanceName) {
        return jsonResponse({ error: "assistance_name is required." }, 400);
      }
      const slug =
        String(body.slug ?? "").trim() ||
        (await generateUniqueCategorySlug(supabase, assistanceName));
      const sortOrder =
        body.sort_order != null && Number.isFinite(Number(body.sort_order))
          ? Number(body.sort_order)
          : await getNextCategorySortOrder(supabase);

      const { data: inserted, error } = await supabase
        .from("assistance_categories")
        .insert({
          slug,
          assistance_name: assistanceName,
          description: body.description == null || body.description === ""
            ? null
            : String(body.description),
          theme_json: body.theme_json ?? null,
          active: true,
          sort_order: sortOrder,
        })
        .select("slug")
        .single();
      if (error) throw error;
      return jsonResponse({
        success: true,
        action,
        slug: inserted?.slug || slug,
      });
    }

    if (action === "category.update") {
      const categoryId = String(body.categoryId ?? body.id ?? "").trim();
      if (!categoryId) {
        return jsonResponse({ error: "categoryId is required." }, 400);
      }
      const assistanceName = String(body.assistance_name ?? "").trim();
      if (!assistanceName) {
        return jsonResponse({ error: "assistance_name is required." }, 400);
      }

      const { data: updated, error } = await supabase
        .from("assistance_categories")
        .update({
          assistance_name: assistanceName,
          description: body.description == null || body.description === ""
            ? null
            : String(body.description),
          theme_json: body.theme_json ?? null,
        })
        .eq("id", categoryId)
        .eq("active", true)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated?.id) {
        return jsonResponse(
          { error: "This assistance is archived or no longer available to edit." },
          400
        );
      }
      return jsonResponse({ success: true, action, id: updated.id });
    }

    if (action === "category.archive") {
      const result = await archiveCategory(supabase, String(body.categoryId ?? body.id ?? ""));
      return jsonResponse({ success: true, action, ...result });
    }

    if (action === "service.save") {
      const servicePayload = (body.servicePayload ?? {}) as Record<string, unknown>;
      const serviceIdIncoming = String(body.serviceId ?? "").trim();
      const isUpdate = Boolean(serviceIdIncoming);
      const requirements = Array.isArray(body.requirements) ? body.requirements : [];
      const additionalAttachment =
        body.additionalAttachment && typeof body.additionalAttachment === "object"
          ? (body.additionalAttachment as Record<string, unknown>)
          : {};

      let serviceId = serviceIdIncoming;
      if (isUpdate) {
        const { error } = await supabase
          .from("assistance_services")
          .update(servicePayload)
          .eq("id", serviceId);
        if (error) throw error;
      } else {
        const displayName = String(servicePayload.display_name ?? "");
        const { data: inserted, error } = await supabase
          .from("assistance_services")
          .insert({
            ...servicePayload,
            request_code_token: slugify(displayName) || null,
            attachment_slot_map: {
              [ADDITIONAL_ATTACHMENT_SLOT]: DEFAULT_ADDITIONAL_FILE_TYPE,
            },
          })
          .select("id")
          .single();
        if (error) throw error;
        serviceId = inserted.id;
      }

      await saveRequirementsForService(
        supabase,
        serviceId,
        requirements,
        additionalAttachment
      );

      return jsonResponse({ success: true, action, serviceId });
    }

    if (action === "service.archive") {
      const result = await archiveService(supabase, String(body.serviceId ?? body.id ?? ""));
      return jsonResponse({ success: true, action, ...result });
    }

    return jsonResponse(
      {
        error:
          "Invalid action. Use catalog.list, catalog.service.get, category.create, category.update, category.archive, service.save, or service.archive.",
      },
      400
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
