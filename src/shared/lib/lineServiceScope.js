/**
 * Line-admin scope from catalog-backed roleConfig.requestSources.
 */

export function collectAllowedServiceIds(roleConfig) {
  const rows = roleConfig?.requestSources;
  if (!Array.isArray(rows)) {
    return [];
  }
  const set = new Set();
  for (const r of rows) {
    if (r?.serviceId) {
      set.add(r.serviceId);
    }
  }
  return [...set];
}
