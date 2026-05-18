/**
 * Admin role helpers and loading shells.
 * Service lists, themes, and attachment metadata come from the DB catalog (`adminCatalog.js`).
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
 * Match `admins.role` / `service_type` to `assistance_categories.admin_role_key`
 * when one side uses a short key (e.g. financial) and the other financial_admin.
 */
export function lineRoleMatchesCatalogAdminKey(lineRaw, categoryAdminRoleKey) {
  const line = normalizeRoleKey(lineRaw);
  const cat = normalizeRoleKey(categoryAdminRoleKey);
  if (!line || !cat) {
    return false;
  }
  if (line === cat) {
    return true;
  }
  if (cat === `${line}_admin` || line === `${cat}_admin`) {
    return true;
  }
  const strip = (k) => k.replace(/_admin$/, "");
  return strip(line) === strip(cat) && strip(line).length > 0;
}

/** `public.admins.role` only; service-type → line is resolved in AuthContext using catalog slugs. */
export function resolveAdminRole(adminProfile) {
  if (!adminProfile) {
    return null;
  }
  const explicit = normalizeRawRole(adminProfile.role);
  return explicit || null;
}

/**
 * When `admins.role` is a generic placeholder, the real line key and theme must come from
 * `category_id` / `service_type` + `assistance_categories` (see AuthContext `lineAdminRole`).
 */
export function isAdminsRoleLinePlaceholder(role) {
  const k = normalizeRawRole(role);
  if (!k) {
    return true;
  }
  return (
    k === "admin" ||
    k === "staff" ||
    k === "operator" ||
    k === "line_admin" ||
    k === "moderator"
  );
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

/** Shell used until `buildCatalogRoleConfig` fills from the database. */
export function getRoleConfig(role) {
  const key = normalizeRawRole(role);
  if (key === "super_admin") {
    return { ...SUPER_PLACEHOLDER };
  }
  return { ...PLACEHOLDER_LINE, role: key || PLACEHOLDER_LINE.role };
}

export function isSupportedAdminRole(role) {
  return Boolean(normalizeRawRole(role));
}
