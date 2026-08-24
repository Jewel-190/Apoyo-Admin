/**
 * Loads assistance_categories + assistance_services (+ requirements) from the database.
 * All admin line scope, themes, and attachment metadata are catalog-driven.
 */

import { supabase } from "../lib/supabaseClient";
import {
  getRoleConfig,
} from "../config/roleConfig";
import { buildAttachmentCatalogMaps } from "../lib/attachmentCatalog";
import {
  CATALOG_SELECT,
  fetchStitchedAssistanceCatalog,
  sortCatalogRows,
} from "../lib/catalogFetch";
import {
  buildBlendedAdminPaletteFromSeeds,
  extractThemeJsonHexSeeds,
  normalizeThemeJsonHex,
} from "../lib/themeJsonPalette";
import { formatAssistanceLineTitle, normalizeAssistanceName } from "../lib/assistanceCategoryDisplay";
import { getSessionCachedQuery, invalidateSessionCacheByPrefix } from "../lib/querySessionCache";

function sortBySortOrder(rows) {
  return sortCatalogRows(rows);
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
export async function fetchAssistanceCatalogSnapshot({
  forceRefresh = false,
  cacheScopeKey = "global",
} = {}) {
  const scope = String(cacheScopeKey || "global").trim() || "global";
  return getSessionCachedQuery(
    `admin-catalog:retention:${scope}`,
    async () => {
      const categories = await fetchStitchedAssistanceCatalog({
        supabase,
        includeInactiveCategories: true,
        filterActiveServices: false,
        categoriesSelect: CATALOG_SELECT.categoriesAdmin,
        servicesSelect: CATALOG_SELECT.servicesAdmin,
        requirementsSelect: CATALOG_SELECT.requirementsAdmin,
      });

      const services = flattenCatalogServices(categories);

      return {
        categories,
        services,
      };
    },
    { forceRefresh, ttlMs: 120_000 }
  );
}

export function invalidateAdminCatalogSnapshotCache() {
  invalidateSessionCacheByPrefix("admin-catalog:");
}

/**
 * Category ids this admin may operate on (must stay in sync with theme resolution).
 */
function resolveScopeCategoryIds(adminProfile, snapshot) {
  const cats = snapshot?.categories ?? [];
  if (!Array.isArray(cats) || cats.length === 0) {
    return [];
  }
  if (adminProfile?.category_id) {
    return [adminProfile.category_id];
  }
  return [];
}

function resolveThemeCategoryRow(
  snapshot,
  adminProfile,
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
 * @param {string|null} scopeKey — UI scope key (e.g. financial_admin)
 * @param {{ categories: Array, services: Array }} snapshot
 */
export function buildCatalogRoleConfig(adminProfile, scopeKey, snapshot) {
  const fallback = getRoleConfig(scopeKey);

  if (!snapshot?.categories?.length) {
    return fallback;
  }

  const scopeCategoryIds = resolveScopeCategoryIds(adminProfile, snapshot);

  const allCatServices = (snapshot.services ?? []).filter((s) =>
    scopeCategoryIds.includes(s.category_id)
  );
  const catServices = allCatServices.filter((s) => s.active !== false);

  const themeCategory = resolveThemeCategoryRow(
    snapshot,
    adminProfile,
    scopeCategoryIds,
    allCatServices
  );

  const toSource = (s) => ({
    serviceId: s.id,
    category: s.display_name,
    displayName: s.display_name,
  });
  const requestSources = catServices.map(toSource);
  const querySources = allCatServices.map(toSource);

  const attachmentCatalog = buildAttachmentCatalogMaps(allCatServices);

  return {
    ...fallback,
    title: normalizeAssistanceName(themeCategory?.assistance_name) || fallback.title,
    sessionLabel: normalizeAssistanceName(themeCategory?.assistance_name) || fallback.sessionLabel,
    requestSources,
    querySources,
    serviceIds: querySources.map((r) => r.serviceId).filter(Boolean),
    catalogServices: allCatServices.map((s) => ({
      serviceId: s.id,
      displayName: s.display_name,
      categoryId: s.category_id,
      active: s.active !== false,
    })),
    attachmentCatalog,
    theme: applyThemeFromCategory(fallback.theme, themeCategory),
    dashboardTitle:
      formatAssistanceLineTitle(themeCategory?.assistance_name) || fallback.dashboardTitle,
    dashboardSubtitle:
      formatAssistanceLineTitle(themeCategory?.assistance_name) || fallback.dashboardSubtitle,
    catalogCategoryId: themeCategory?.id ?? null,
    catalogSlug: themeCategory?.slug ?? null,
  };
}

/**
 * Superadmin / global catalog helpers.
 * `services` stays live-only for UI pickers; `serviceIds` includes archived rows.
 */
export function buildGlobalCatalogView(snapshot) {
  const all = snapshot?.services ?? [];
  const live = all.filter((s) => s.active !== false);
  return {
    services: live.map((s) => ({
      serviceId: s.id,
      displayName: s.display_name,
      categoryId: s.category_id,
    })),
    querySources: all.map((s) => ({
      serviceId: s.id,
      category: s.display_name,
      displayName: s.display_name,
    })),
    serviceIds: all.map((s) => s.id).filter(Boolean),
    attachmentCatalog: buildAttachmentCatalogMaps(all),
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
