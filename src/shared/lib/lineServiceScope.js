/**
 * Line-admin scope from catalog-backed roleConfig.
 * `serviceIds` / `querySources` include archived catalog rows so historical
 * requests stay queryable. `requestSources` stays active-only for new-work tabs.
 */

export function collectAllowedServiceIds(roleConfig) {
  const fromIds = Array.isArray(roleConfig?.serviceIds) ? roleConfig.serviceIds : [];
  if (fromIds.length) {
    return [...new Set(fromIds.map((id) => String(id || "").trim()).filter(Boolean))];
  }
  const rows = [
    ...(Array.isArray(roleConfig?.querySources) ? roleConfig.querySources : []),
    ...(Array.isArray(roleConfig?.requestSources) ? roleConfig.requestSources : []),
  ];
  const set = new Set();
  for (const r of rows) {
    if (r?.serviceId) {
      set.add(r.serviceId);
    }
  }
  return [...set];
}

export function collectApplicationQuerySources(roleConfig) {
  if (Array.isArray(roleConfig?.querySources) && roleConfig.querySources.length) {
    return roleConfig.querySources;
  }
  return Array.isArray(roleConfig?.requestSources) ? roleConfig.requestSources : [];
}
