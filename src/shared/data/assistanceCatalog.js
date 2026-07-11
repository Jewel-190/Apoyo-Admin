/**
 * Loads assistance catalog (categories → services → requirements → tips)
 * for ContentManagement / future mobile config consumers.
 */

import {
  CATALOG_SELECT,
  fetchStitchedAssistanceCatalog,
  sortCatalogRows,
} from "../lib/catalogFetch.js";
import { formatAssistanceLineTitle, normalizeAssistanceName } from "../lib/assistanceCategoryDisplay.js";

/**
 * @returns {Promise<{ data: unknown, error: Error | null }>}
 */
export async function fetchAssistanceCatalogRows({ includeInactive = false } = {}) {
  try {
    const data = await fetchStitchedAssistanceCatalog({
      includeInactiveCategories: includeInactive,
      filterActiveServices: !includeInactive,
      categoriesSelect: CATALOG_SELECT.categoriesMobile,
      servicesSelect: CATALOG_SELECT.servicesMobile,
      requirementsSelect: CATALOG_SELECT.requirementsMobile,
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Maps catalog rows into the shape used by ContentManagement `Services.jsx`.
 *
 * @param {Array<object>} categories raw rows from Supabase
 * @param {{ fallbackImg: string }} assets bundled default image URL from caller (Vite)
 */
export function mapCatalogToMobileAssistances(categories, { fallbackImg }) {
  if (!Array.isArray(categories) || categories.length === 0) return [];

  return sortCatalogRows(categories)
    .filter((cat) => cat.active !== false)
    .map((cat) => {
      const services = sortCatalogRows(cat.assistance_services)
        .filter((svc) => svc.active !== false)
        .map((svc) => {
          const requirements = sortCatalogRows(svc.assistance_requirements).map((req) => ({
            title: req.title ?? "",
            tips: sortCatalogRows(req.assistance_requirement_tips).map((tip) => ({
              title: tip.title ?? "",
              description: tip.description ?? "",
            })),
          }));

          return {
            id: svc.id,
            name: svc.display_name ?? "",
            description: svc.description_html ?? "",
            image: svc.mobile_image_url || fallbackImg,
            requirements,
          };
        });

      const assistanceName = normalizeAssistanceName(cat.assistance_name);
      return {
        id: cat.slug,
        assistanceName,
        displayTitle: formatAssistanceLineTitle(assistanceName),
        services,
      };
    });
}
