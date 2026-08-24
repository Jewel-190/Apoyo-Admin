/**
 * Platform settings access layer.
 *
 * Unified store: public.settings (scope + key → jsonb value).
 * Scopes:
 *   - "system"  platform-wide config
 *   - "admin"   admin-console behavior
 *   - "user"    user/mobile-app capabilities
 *
 * Reads go through Supabase + RLS. Superadmin writes go through
 * `super-admin-settings-management` for consistent auth and versioning.
 *
 * Consumers should read through {@link fetchScopeSettings} or
 * {@link fetchSettingsGroup} so defaults are always applied.
 */

import { supabase } from "./supabaseClient";
import {
  getSessionCachedQuery,
  invalidateSessionCacheByPrefix,
} from "./querySessionCache";
import { upsertPlatformSetting } from "./superAdminSettingsApi";

export const SETTINGS_TABLE = "settings";

/** Known scopes (order matters for UI). */
export const SETTINGS_SCOPES = Object.freeze(["system", "admin", "user"]);

/**
 * Canonical default values for implemented settings groups only.
 * Add a group here when its UI module ships (keep in sync with the edge function).
 */
export const SETTINGS_DEFAULTS = Object.freeze({
  system: {
    "logo-and-banner": {
      dasma_logo_url: "",
      dasma_banner_url: "",
    },
    "system-theme": {
      // Cold-start seed only; live color is stored in public.settings.
      primary_color: "#0b8f8b",
    },
    legal: {
      // Persist section copy per hardcoded page slug. Title/URL stay in code.
      "terms-and-conditions": { sections: [] },
      "user-acceptance": { sections: [] },
    },
  },
  admin: {
    "interview-scheduling": {
      title: "Instructions",
      subtitle: "Applicant briefing",
      officeHours: {
        days: "Monday - Friday",
        start: "08:00",
        end: "17:00",
      },
      steps: [
        {
          id: "step-visit",
          kind: "text",
          body: "Visit the Socio-Economic and Multi-Purpose Building Barangay Burol Main, City of Dasmariñas, Cavite",
        },
        {
          id: "application-number",
          kind: "application_number",
          body: "Present your Application Number:",
        },
        {
          id: "step-valid-id",
          kind: "text",
          body: "Bring one (1) Original Valid ID for verification.",
        },
      ],
    },
  },
  user: {},
});

const CACHE_PREFIX = "platform-settings";
const CACHE_TTL_MS = 60_000;

function assertScope(scope) {
  if (!SETTINGS_SCOPES.includes(scope)) {
    throw new Error(
      `Unknown settings scope "${scope}". Expected one of: ${SETTINGS_SCOPES.join(", ")}.`
    );
  }
  return scope;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep-merges a stored value on top of its default so newly added default
 * fields are always present. Arrays and scalars are replaced wholesale.
 */
export function mergeWithDefault(defaultValue, storedValue) {
  if (storedValue === undefined || storedValue === null) {
    return defaultValue;
  }
  if (!isPlainObject(defaultValue) || !isPlainObject(storedValue)) {
    return storedValue;
  }
  const merged = { ...defaultValue };
  for (const key of Object.keys(storedValue)) {
    merged[key] = mergeWithDefault(defaultValue[key], storedValue[key]);
  }
  return merged;
}

/** Returns the default map for a scope (deep-cloned to avoid mutation). */
export function getScopeDefaults(scope) {
  assertScope(scope);
  return structuredClone(SETTINGS_DEFAULTS[scope] ?? {});
}

/**
 * Loads every settings group for a scope, merged over defaults.
 * @param {"system"|"admin"|"user"} scope
 * @param {{ forceRefresh?: boolean }} [options]
 * @returns {Promise<Record<string, any>>} map of groupId -> value
 */
export async function fetchScopeSettings(scope, { forceRefresh = false } = {}) {
  assertScope(scope);
  const defaults = SETTINGS_DEFAULTS[scope] ?? {};

  const rows = await getSessionCachedQuery(
    `${CACHE_PREFIX}:${scope}`,
    async () => {
      const { data, error } = await supabase
        .from(SETTINGS_TABLE)
        .select("key, value, updated_at, is_active, version")
        .eq("scope", scope)
        .eq("is_active", true);
      if (error) {
        throw error;
      }
      return data ?? [];
    },
    { ttlMs: CACHE_TTL_MS, forceRefresh }
  );

  const stored = new Map(rows.map((row) => [row.key, row.value]));
  const result = {};
  const groupIds = new Set([...Object.keys(defaults), ...stored.keys()]);
  for (const groupId of groupIds) {
    result[groupId] = mergeWithDefault(defaults[groupId], stored.get(groupId));
    if (groupId === "legal") {
      const merged = result[groupId] ?? {};
      const sectionList = (raw) =>
        (Array.isArray(raw) ? raw : []).map((section) => ({
          heading: String(section?.heading ?? ""),
          body: String(section?.body ?? ""),
        }));
      const termsFromLegacy = () => {
        if (Array.isArray(merged.pages) && merged.pages.length) {
          const match =
            merged.pages.find((page) => {
              const slug = String(page?.slug ?? "").trim().toLowerCase();
              const title = String(page?.title ?? "").trim().toLowerCase();
              return (
                slug === "terms-and-conditions" ||
                slug === "legal" ||
                slug === "terms" ||
                title.includes("terms")
              );
            }) ?? merged.pages[0];
          return match?.sections;
        }
        if (Array.isArray(merged.sections)) return merged.sections;
        return merged.terms?.sections;
      };
      const acceptanceFromLegacy = () => {
        if (Array.isArray(merged.pages) && merged.pages.length) {
          const match = merged.pages.find((page) => {
            const slug = String(page?.slug ?? "").trim().toLowerCase();
            const title = String(page?.title ?? "").trim().toLowerCase();
            return slug === "user-acceptance" || title.includes("acceptance");
          });
          return match?.sections;
        }
        return merged.userAcceptance?.sections;
      };
      result[groupId] = {
        "terms-and-conditions": {
          sections: sectionList(
            merged["terms-and-conditions"]?.sections ?? termsFromLegacy()
          ),
        },
        "user-acceptance": {
          sections: sectionList(
            merged["user-acceptance"]?.sections ?? acceptanceFromLegacy()
          ),
        },
      };
    }
  }
  return result;
}

/**
 * Loads a single settings group, merged over its default.
 * @param {"system"|"admin"|"user"} scope
 * @param {string} groupId
 */
export async function fetchSettingsGroup(scope, groupId, { forceRefresh = false } = {}) {
  const all = await fetchScopeSettings(scope, { forceRefresh });
  if (all[groupId] !== undefined) {
    return all[groupId];
  }
  return getScopeDefaults(scope)[groupId] ?? null;
}

/**
 * Upserts a settings group value via the superadmin edge function.
 * Invalidates the scope cache so subsequent reads are fresh.
 * @param {"system"|"admin"|"user"} scope
 * @param {string} groupId
 * @param {any} value
 */
export async function saveSettingsGroup(scope, groupId, value) {
  assertScope(scope);
  const key = String(groupId ?? "").trim();
  if (!key) {
    throw new Error("A settings group id is required.");
  }

  const result = await upsertPlatformSetting({
    scope,
    key,
    value,
  });

  invalidateSessionCacheByPrefix(`${CACHE_PREFIX}:${scope}`);

  const setting = result?.setting;
  return {
    key: setting?.key ?? key,
    value: setting?.value ?? value,
    updated_at: setting?.updatedAt ?? null,
    version: setting?.version ?? null,
  };
}

/** Invalidate cached reads for a scope (or all scopes when omitted). */
export function invalidateSettingsCache(scope) {
  if (scope) {
    invalidateSessionCacheByPrefix(`${CACHE_PREFIX}:${scope}`);
    return;
  }
  invalidateSessionCacheByPrefix(CACHE_PREFIX);
}

/** @deprecated Use SETTINGS_TABLE; kept so older imports don't break mid-refactor. */
export const SETTINGS_TABLES = Object.freeze({
  system: SETTINGS_TABLE,
  admin: SETTINGS_TABLE,
  user: SETTINGS_TABLE,
});
