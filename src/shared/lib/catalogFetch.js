/**
 * Split-query assistance catalog fetch.
 *
 * Avoids nested PostgREST joins (slow / fragile) and keeps list payloads free of
 * heavy CMS fields (base64 images, requirement metadata, cms_metadata).
 */

import { supabase as defaultClient } from "./supabaseClient.js";
import { getSessionCachedQuery, invalidateSessionCacheByPrefix } from "./querySessionCache.js";

export const CATALOG_SELECT = {
  categoriesFull: "id,slug,assistance_name,description,sort_order,active,theme_json",
  categoriesAdmin: "id,slug,assistance_name,sort_order,active,theme_json",
  categoriesMobile: "slug,assistance_name,sort_order,active",

  servicesList:
    "id,category_id,display_name,request_code,description_html,mobile_image_url,sort_order,active,attachment_slot_map",
  servicesDetail:
    "id,category_id,display_name,request_code,description_html,about_html,who_bullets,mobile_image_url,reminder_text,web_intro_html,cms_metadata,radio_selection,attachment_slot_map,sort_order,active",
  servicesAdmin: "id,category_id,display_name,sort_order,active",
  servicesMobile: "id,category_id,display_name,description_html,mobile_image_url,sort_order,active",

  requirementsList: "id,service_id,slot_key,title,help,sort_order",
  requirementsDetail: "id,service_id,slot_key,title,help,sort_order,metadata",
  requirementsAdmin: "id,service_id,slot_key,title,sort_order",
  requirementsMobile: "id,service_id,slot_key,title,sort_order",

  tips: "id,requirement_id,title,description,sort_order",
};

export function sortCatalogRows(rows) {
  return [...(rows ?? [])].sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0));
}

async function runQuery(label, queryFactory) {
  try {
    const result = await queryFactory();
    if (result?.error) throw result.error;
    return result;
  } catch (error) {
    throw new Error(`[Catalog:${label}] failed: ${error?.message || "unknown error"}`);
  }
}

function stitchTipsOntoRequirements(requirements, tips) {
  const tipsByRequirementId = new Map();
  for (const tip of tips ?? []) {
    const key = tip.requirement_id;
    if (!tipsByRequirementId.has(key)) tipsByRequirementId.set(key, []);
    tipsByRequirementId.get(key).push(tip);
  }

  return sortCatalogRows(requirements).map((req) => ({
    ...req,
    assistance_requirement_tips: sortCatalogRows(tipsByRequirementId.get(req.id) ?? []),
  }));
}

export function stitchCatalogRows({ categories, services, requirements = [], tips = [] }) {
  const requirementsWithTips = stitchTipsOntoRequirements(requirements, tips);

  const requirementsByServiceId = new Map();
  for (const req of requirementsWithTips) {
    const key = req.service_id;
    if (!requirementsByServiceId.has(key)) requirementsByServiceId.set(key, []);
    requirementsByServiceId.get(key).push(req);
  }

  const servicesByCategoryId = new Map();
  for (const svc of services ?? []) {
    const key = svc.category_id;
    if (!servicesByCategoryId.has(key)) servicesByCategoryId.set(key, []);
    servicesByCategoryId.get(key).push({
      ...svc,
      assistance_requirements: sortCatalogRows(requirementsByServiceId.get(svc.id) ?? []),
    });
  }

  return sortCatalogRows(categories).map((cat) => ({
    ...cat,
    assistance_services: sortCatalogRows(servicesByCategoryId.get(cat.id) ?? []),
  }));
}

/**
 * @param {object} [options]
 * @param {import("@supabase/supabase-js").SupabaseClient} [options.supabase]
 * @param {boolean} [options.includeInactiveCategories]
 * @param {boolean} [options.filterActiveServices]
 * @param {string} [options.categoriesSelect]
 * @param {string} [options.servicesSelect]
 * @param {string|null} [options.requirementsSelect] Pass null to skip requirements/tips.
 * @param {string} [options.tipsSelect]
 * @param {string[]|null} [options.categoryIdsFilter]
 * @param {string[]|null} [options.serviceIdsFilter]
 */
export async function fetchStitchedAssistanceCatalog({
  supabase = defaultClient,
  includeInactiveCategories = false,
  filterActiveServices = true,
  categoriesSelect = CATALOG_SELECT.categoriesFull,
  servicesSelect = CATALOG_SELECT.servicesList,
  requirementsSelect = CATALOG_SELECT.requirementsList,
  tipsSelect = CATALOG_SELECT.tips,
  categoryIdsFilter = null,
  serviceIdsFilter = null,
} = {}) {
  let categoryQuery = supabase
    .from("assistance_categories")
    .select(categoriesSelect)
    .order("sort_order", { ascending: true });

  if (!includeInactiveCategories) {
    categoryQuery = categoryQuery.eq("active", true);
  }
  if (Array.isArray(categoryIdsFilter) && categoryIdsFilter.length) {
    categoryQuery = categoryQuery.in("id", categoryIdsFilter);
  }

  const categoriesRes = await runQuery("categories", () => categoryQuery);
  const categories = categoriesRes.data ?? [];
  const categoryIds = categories.map((row) => row.id).filter(Boolean);

  let services = [];
  if (categoryIds.length) {
    let servicesQuery = supabase.from("assistance_services").select(servicesSelect).in("category_id", categoryIds);
    if (filterActiveServices) {
      servicesQuery = servicesQuery.eq("active", true);
    }
    if (Array.isArray(serviceIdsFilter) && serviceIdsFilter.length) {
      servicesQuery = servicesQuery.in("id", serviceIdsFilter);
    }
    const servicesRes = await runQuery("services", () => servicesQuery);
    services = servicesRes.data ?? [];
  }

  let requirements = [];
  let tips = [];
  const serviceIds = services.map((row) => row.id).filter(Boolean);

  if (requirementsSelect && serviceIds.length) {
    const requirementsRes = await runQuery("requirements", () =>
      supabase.from("assistance_requirements").select(requirementsSelect).in("service_id", serviceIds)
    );
    requirements = requirementsRes.data ?? [];

    const requirementIds = requirements.map((row) => row.id).filter(Boolean);
    if (requirementIds.length) {
      const tipsRes = await runQuery("tips", () =>
        supabase.from("assistance_requirement_tips").select(tipsSelect).in("requirement_id", requirementIds)
      );
      tips = tipsRes.data ?? [];
    }
  }

  return stitchCatalogRows({ categories, services, requirements, tips });
}

export function invalidateCmsCatalogListCache() {
  invalidateSessionCacheByPrefix("cms-catalog-list:");
}

/**
 * CMS list payload for Services.jsx — cached for the session to avoid refetch on route remount.
 */
export async function fetchCmsCatalogList({
  supabase = defaultClient,
  forceRefresh = false,
} = {}) {
  return getSessionCachedQuery(
    "cms-catalog-list:active",
    () =>
      fetchStitchedAssistanceCatalog({
        supabase,
        includeInactiveCategories: false,
        filterActiveServices: true,
        categoriesSelect: CATALOG_SELECT.categoriesFull,
        servicesSelect: CATALOG_SELECT.servicesList,
        requirementsSelect: null,
      }),
    { forceRefresh, ttlMs: 120_000 }
  );
}

/**
 * Fetch one service with full CMS payload (used when opening the edit modal).
 */
export async function fetchServiceCatalogDetail(serviceId, { supabase = defaultClient } = {}) {
  const id = String(serviceId ?? "").trim();
  if (!id) {
    throw new Error("Service id is required.");
  }

  const serviceRes = await runQuery("service", () =>
    supabase.from("assistance_services").select(CATALOG_SELECT.servicesDetail).eq("id", id).maybeSingle()
  );
  if (!serviceRes.data) {
    throw new Error("Service not found.");
  }

  const requirementsRes = await runQuery("requirements", () =>
    supabase.from("assistance_requirements").select(CATALOG_SELECT.requirementsDetail).eq("service_id", id)
  );
  const requirements = requirementsRes.data ?? [];
  const requirementIds = requirements.map((row) => row.id).filter(Boolean);

  let tips = [];
  if (requirementIds.length) {
    const tipsRes = await runQuery("tips", () =>
      supabase.from("assistance_requirement_tips").select(CATALOG_SELECT.tips).in("requirement_id", requirementIds)
    );
    tips = tipsRes.data ?? [];
  }

  return {
    ...serviceRes.data,
    assistance_requirements: stitchTipsOntoRequirements(requirements, tips),
  };
}
