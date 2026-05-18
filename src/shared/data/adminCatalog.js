/**
 * Loads assistance_categories + assistance_services (+ requirements) from the database.
 * All admin line scope, themes, and attachment metadata are catalog-driven.
 */

import { supabase } from "../lib/supabaseClient";
import {
  getRoleConfig,
  lineRoleMatchesCatalogAdminKey,
  normalizeRoleKey,
} from "../config/roleConfig";
import { buildAttachmentCatalogMaps } from "../lib/attachmentCatalog";
import {
  buildBlendedAdminPaletteFromSeeds,
  extractThemeJsonHexSeeds,
  normalizeThemeJsonHex,
} from "../lib/themeJsonPalette";

const ADMIN_CATALOG_SELECT = `
  id,
  slug,
  label,
  headline,
  sort_order,
  active,
  admin_role_key,
  theme_json,
  assistance_services (
    id,
    display_name,
    description_html,
    sort_order,
    active,
    assistance_requirements (
      slot_key,
      title,
      sort_order
    )
  )
`;

function sortBySortOrder(rows) {
  return [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function parseThemeJson(themeJson) {
  if (themeJson == null) {
    return null;
  }
  if (typeof themeJson === "string") {
    try {
      const o = JSON.parse(themeJson);
      return typeof o === "object" && o ? o : null;
    } catch {
      return null;
    }
  }
  if (typeof themeJson === "object") {
    return themeJson;
  }
  return null;
}

function isThemeJsonEmpty(themeJson) {
  const p = parseThemeJson(themeJson);
  if (p == null || Array.isArray(p)) {
    return true;
  }
  return Object.keys(p).length === 0;
}

function applyThemeFromCategory(baseTheme, themeCategory) {
  if (!themeCategory || isThemeJsonEmpty(themeCategory.theme_json)) {
    return baseTheme;
  }
  return mergeThemeJson(baseTheme, themeCategory.theme_json);
}

/**
 * Flatten nested category → services for RLS-aligned queries and attachment maps.
 */
export function flattenCatalogServices(categories) {
  const services = [];
  for (const cat of categories ?? []) {
    for (const svc of cat.assistance_services ?? []) {
      services.push({
        ...svc,
        category_id: cat.id,
      });
    }
  }
  return sortBySortOrder(services);
}

/**
 * @returns {Promise<{ categories: Array, services: Array }>}
 */
export async function fetchAssistanceCatalogSnapshot() {
  const { data: categories, error } = await supabase
    .from("assistance_categories")
    .select(ADMIN_CATALOG_SELECT)
    .eq("active", true)
    .order("sort_order");

  if (error) {
    throw error;
  }

  const cats = categories || [];
  const services = flattenCatalogServices(cats).filter((s) => s.active !== false);

  return {
    categories: cats,
    services,
  };
}

/**
 * Category ids this admin may operate on (must stay in sync with theme resolution).
 */
function resolveScopeCategoryIds(adminProfile, lineAdminRole, snapshot) {
  const cats = snapshot?.categories ?? [];
  if (!Array.isArray(cats) || cats.length === 0) {
    return [];
  }
  if (adminProfile?.category_id) {
    return [adminProfile.category_id];
  }
  if (lineAdminRole) {
    return cats
      .filter(
        (c) =>
          c.admin_role_key &&
          lineRoleMatchesCatalogAdminKey(lineAdminRole, c.admin_role_key)
      )
      .map((c) => c.id);
  }
  const st = normalizeRoleKey(adminProfile?.service_type);
  if (st) {
    const bySlug = cats.find((x) => normalizeRoleKey(x.slug) === st);
    const byRole = cats.find(
      (x) =>
        x.admin_role_key &&
        lineRoleMatchesCatalogAdminKey(adminProfile.service_type, x.admin_role_key)
    );
    const c = bySlug || byRole;
    if (c) {
      return [c.id];
    }
  }
  return [];
}

function resolveThemeCategoryRow(
  snapshot,
  adminProfile,
  lineAdminRole,
  scopeCategoryIds,
  catServices
) {
  const cats = snapshot?.categories ?? [];
  if (adminProfile?.category_id) {
    const hit = cats.find((c) => c.id === adminProfile.category_id);
    if (hit) {
      return hit;
    }
  }
  if (lineAdminRole) {
    const hit = cats.find(
      (c) =>
        c.admin_role_key &&
        lineRoleMatchesCatalogAdminKey(lineAdminRole, c.admin_role_key)
    );
    if (hit) {
      return hit;
    }
  }
  if (scopeCategoryIds.length === 1) {
    const hit = cats.find((c) => c.id === scopeCategoryIds[0]);
    if (hit) {
      return hit;
    }
  }
  if (Array.isArray(catServices) && catServices.length > 0) {
    const cid = catServices[0].category_id;
    const hit = cats.find((c) => c.id === cid);
    if (hit) {
      return hit;
    }
  }
  return null;
}

function mergeThemeJson(baseTheme, themeJson) {
  const parsed = parseThemeJson(themeJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return baseTheme;
  }

  const next = { ...(baseTheme || {}) };
  const seeds = extractThemeJsonHexSeeds(parsed);
  const blended = buildBlendedAdminPaletteFromSeeds(seeds);

  const SLOT_KEYS = ["primary", "secondary", "tertiary", "accent", "ring"];
  for (const key of SLOT_KEYS) {
    const raw = parsed[key];
    const override =
      typeof raw === "string" ? normalizeThemeJsonHex(raw.trim()) : null;
    const fromBlend = blended?.[key];
    if (override) {
      next[key] = override;
    } else if (fromBlend) {
      next[key] = fromBlend;
    }
  }

  return next;
}

/**
 * @param {object|null} adminProfile — row from public.admins
 * @param {string|null} lineAdminRole — resolved line key (e.g. financial_admin)
 * @param {{ categories: Array, services: Array }} snapshot
 */
export function buildCatalogRoleConfig(adminProfile, lineAdminRole, snapshot) {
  const fallback = getRoleConfig(lineAdminRole);

  if (!snapshot?.categories?.length || !snapshot?.services?.length) {
    return fallback;
  }

  const scopeCategoryIds = resolveScopeCategoryIds(
    adminProfile,
    lineAdminRole,
    snapshot
  );

  const catServices = snapshot.services.filter(
    (s) => scopeCategoryIds.includes(s.category_id) && s.active !== false
  );

  if (!catServices.length) {
    return fallback;
  }

  const themeCategory = resolveThemeCategoryRow(
    snapshot,
    adminProfile,
    lineAdminRole,
    scopeCategoryIds,
    catServices
  );

  const requestSources = catServices.map((s) => ({
    serviceId: s.id,
    category: s.display_name,
    displayName: s.display_name,
  }));

  const attachmentCatalog = buildAttachmentCatalogMaps(catServices);

  return {
    ...fallback,
    title: themeCategory?.label || fallback.title,
    sessionLabel: themeCategory?.label || fallback.sessionLabel,
    requestSources,
    serviceIds: requestSources.map((r) => r.serviceId).filter(Boolean),
    catalogServices: catServices.map((s) => ({
      serviceId: s.id,
      displayName: s.display_name,
      categoryId: s.category_id,
    })),
    attachmentCatalog,
    theme: applyThemeFromCategory(fallback.theme, themeCategory),
    dashboardTitle:
      themeCategory?.label ||
      themeCategory?.headline ||
      fallback.dashboardTitle,
    dashboardSubtitle: themeCategory?.headline || fallback.dashboardSubtitle,
    catalogCategoryId: themeCategory?.id ?? null,
    catalogSlug: themeCategory?.slug ?? null,
  };
}

/**
 * Superadmin / global catalog helpers (all active services).
 */
export function buildGlobalCatalogView(snapshot) {
  const services = (snapshot?.services ?? []).filter((s) => s.active !== false);
  return {
    services: services.map((s) => ({
      serviceId: s.id,
      displayName: s.display_name,
      categoryId: s.category_id,
    })),
    attachmentCatalog: buildAttachmentCatalogMaps(services),
  };
}

export function findCatalogServiceDisplayName(snapshot, serviceId) {
  const id = String(serviceId ?? "").trim();
  if (!id) {
    return "";
  }
  const hit = (snapshot?.services ?? []).find((s) => s.id === id);
  return hit?.display_name || "Service";
}
