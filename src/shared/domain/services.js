/**
 * Catalog-backed service lookups (UUID service id from assistance_services).
 */

/**
 * @param {Array<{ id?: string, serviceId?: string, display_name?: string, displayName?: string }>} catalogServices
 * @param {string} serviceId
 */
export function findCatalogService(catalogServices, serviceId) {
  const id = String(serviceId ?? "").trim();
  if (!id || !Array.isArray(catalogServices)) {
    return null;
  }
  return (
    catalogServices.find((s) => s.id === id || s.serviceId === id) ?? null
  );
}

export function catalogServiceDisplayName(catalogServices, serviceId) {
  const hit = findCatalogService(catalogServices, serviceId);
  return hit?.display_name || hit?.displayName || "Service";
}
