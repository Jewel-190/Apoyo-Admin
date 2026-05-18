/**
 * Loads assistance catalog (categories → services → requirements → tips)
 * for ContentManagement / future mobile config consumers.
 */

import { supabase } from "../lib/supabaseClient.js";

const CATALOG_SELECT = `
  slug,
  label,
  headline,
  sort_order,
  active,
  assistance_services (
    id,
    display_name,
    description_html,
    mobile_image_url,
    sort_order,
    active,
    assistance_requirements (
      slot_key,
      title,
      sort_order,
      assistance_requirement_tips (
        title,
        description,
        sort_order
      )
    )
  )
`;

function sortBySortOrder(rows) {
  return [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * @returns {Promise<{ data: unknown, error: Error | null }>}
 */
export async function fetchAssistanceCatalogRows({ includeInactive = false } = {}) {
  let q = supabase.from("assistance_categories").select(CATALOG_SELECT).order("sort_order", { ascending: true });

  if (!includeInactive) {
    q = q.eq("active", true);
  }

  const { data, error } = await q;
  return { data, error };
}

/**
 * Maps catalog rows into the shape used by ContentManagement `Services.jsx`.
 *
 * @param {Array<object>} categories raw rows from Supabase
 * @param {{ fallbackImg: string }} assets bundled default image URL from caller (Vite)
 */
export function mapCatalogToMobileAssistances(categories, { fallbackImg }) {
  if (!Array.isArray(categories) || categories.length === 0) return [];

  return sortBySortOrder(categories)
    .filter((cat) => cat.active !== false)
    .map((cat) => {
      const services = sortBySortOrder(cat.assistance_services)
        .filter((svc) => svc.active !== false)
        .map((svc) => {
          const requirements = sortBySortOrder(svc.assistance_requirements).map((req) => ({
            title: req.title ?? "",
            tips: sortBySortOrder(req.assistance_requirement_tips).map((tip) => ({
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

      return {
        id: cat.slug,
        label: cat.label ?? "",
        headline: cat.headline ?? "",
        services,
      };
    });
}
