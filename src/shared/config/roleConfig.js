/**
 * Admin shell helpers and loading placeholders.
 * Final access model: `admins.is_super_admin` + `admins.category_id`.
 */

export const ADMIN_ROLES = {
  super_admin: "super_admin",
};

export const DEFAULT_ADMIN_THEME = {
  primary: "#0f766e",
  secondary: "#14b8a6",
  tertiary: "#5eead4",
  accent: "#ccfbf1",
  ring: "#0d9488",
};

export const DEFAULT_SUPER_ADMIN_THEME = {
  primary: "#111827",
  secondary: "#374151",
  tertiary: "#6B7280",
  accent: "#2563EB",
  ring: "#3B82F6",
};

export function normalizeRawRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function normalizeRoleKey(value) {
  return normalizeRawRole(value);
}

/**
 * UI helper: treat both `financial` and `financial_admin` as equivalent.
 * This is intentionally presentation-only and not used for auth decisions.
 */
export function adminLineMatchesCategorySlug(lineRaw, categorySlug) {
  const line = normalizeRoleKey(lineRaw);
  const slug = normalizeRoleKey(categorySlug);
  if (!line || !slug) {
    return false;
  }
  if (line === slug) {
    return true;
  }
  if (line === `${slug}_admin` || slug === `${line}_admin`) {
    return true;
  }
  const stripAdmin = (k) => k.replace(/_admin$/, "");
  return stripAdmin(line) === slug && slug.length > 0;
}

/** @deprecated Backward-compat alias for older callers. */
export function lineRoleMatchesCatalogAdminKey(lineRaw, categoryKeyOrSlug) {
  return adminLineMatchesCategorySlug(lineRaw, categoryKeyOrSlug);
}

/** @deprecated Legacy no-op shim kept to avoid breaking stale imports. */
export function resolveAdminRole(adminProfile) {
  if (!adminProfile) {
    return null;
  }
  if (adminProfile.is_super_admin === true) {
    return "super_admin";
  }
  return null;
}

/** @deprecated Legacy no-op shim kept to avoid breaking stale imports. */
export function isAdminsRoleLinePlaceholder(role) {
  void role;
  return true;
}

const PLACEHOLDER_LINE = {
  role: "admin",
  title: "Admin",
  sessionLabel: "Admin",
  requestSources: [],
  serviceIds: [],
  catalogServices: [],
  attachmentCatalog: { labelsByServiceId: {}, orderByServiceId: {}, globalLabels: {} },
  dashboardTitle: "Command Center",
  dashboardSubtitle: "",
  theme: { ...DEFAULT_ADMIN_THEME },
};

const SUPER_PLACEHOLDER = {
  role: "super_admin",
  title: "Super Admin",
  sessionLabel: "Super Admin",
  requestSources: [],
  serviceIds: [],
  catalogServices: [],
  attachmentCatalog: { labelsByServiceId: {}, orderByServiceId: {}, globalLabels: {} },
  dashboardTitle: "Super Admin",
  dashboardSubtitle: "",
  theme: { ...DEFAULT_SUPER_ADMIN_THEME },
};

/** Shell used until catalog-derived config is available. */
export function getRoleConfig(scopeKey) {
  const key = normalizeRawRole(scopeKey);
  if (key === "super_admin") {
    return { ...SUPER_PLACEHOLDER };
  }
  return { ...PLACEHOLDER_LINE, role: key || PLACEHOLDER_LINE.role };
}

export function isSupportedAdminRole(role) {
  return Boolean(normalizeRawRole(role));
}
