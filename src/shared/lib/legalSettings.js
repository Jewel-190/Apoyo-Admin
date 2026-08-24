/**
 * Hardcoded public Legal pages.
 *
 * Page identity (title, slug, URL) lives in code.
 * public.settings (system / legal) stores section heading + body per page slug.
 */

import { supabase } from "./supabaseClient";
import { invalidateSettingsCache } from "./settingsStore";
import { upsertPlatformSetting } from "./superAdminSettingsApi";

export const LEGAL_SCOPE = "system";
export const LEGAL_KEY = "legal";
export const LEGAL_PAGE_PREFIX = "/legal";

export const LEGAL_PAGES = Object.freeze([
  Object.freeze({
    slug: "terms-and-conditions",
    title: "Terms and Conditions",
    showInWebQuickLinks: true,
  }),
  Object.freeze({
    slug: "user-acceptance",
    title: "User Acceptance",
    showInWebQuickLinks: false,
  }),
]);

export const LEGAL_DEFAULT_PAGE = LEGAL_PAGES[0];
export const LEGAL_PAGE_TITLE = LEGAL_DEFAULT_PAGE.title;
export const LEGAL_PAGE_SLUG = LEGAL_DEFAULT_PAGE.slug;
export const LEGAL_PAGE_PATH = `${LEGAL_PAGE_PREFIX}/${LEGAL_DEFAULT_PAGE.slug}`;

function emptyPageRecord() {
  return { sections: [] };
}

export const LEGAL_DEFAULTS = Object.freeze(
  Object.fromEntries(LEGAL_PAGES.map((page) => [page.slug, Object.freeze(emptyPageRecord())]))
);

export function legalPagePath(slug) {
  return `${LEGAL_PAGE_PREFIX}/${String(slug || "").trim()}`;
}

export function getHardcodedLegalPage(slug) {
  const needle = String(slug ?? "").trim().toLowerCase();
  if (!needle || needle === "legal" || needle === "terms" || needle === "page") {
    return LEGAL_DEFAULT_PAGE;
  }
  return LEGAL_PAGES.find((page) => page.slug === needle) ?? null;
}

function normalizeSection(section) {
  const src = section && typeof section === "object" ? section : {};
  return {
    heading: String(src.heading ?? ""),
    body: String(src.body ?? ""),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matchesPage(entry, page) {
  if (!isPlainObject(entry)) return false;
  const slug = String(entry.slug ?? "").trim().toLowerCase();
  const title = String(entry.title ?? "").trim().toLowerCase();
  if (slug === page.slug) return true;
  if (page.slug === "terms-and-conditions") {
    return slug === "legal" || slug === "terms" || title.includes("terms");
  }
  if (page.slug === "user-acceptance") {
    return title.includes("user acceptance") || title.includes("acceptance");
  }
  return title === page.title.toLowerCase();
}

function pickPageSections(value, page) {
  const src = isPlainObject(value) ? value : {};
  const named = src[page.slug];
  if (isPlainObject(named) && Array.isArray(named.sections)) return named.sections;
  if (Array.isArray(src.pages) && src.pages.length) {
    const match = src.pages.find((entry) => matchesPage(entry, page));
    if (match && Array.isArray(match.sections)) return match.sections;
  }
  if (page.slug === "terms-and-conditions") {
    if (Array.isArray(src.sections)) return src.sections;
    if (isPlainObject(src.terms) && Array.isArray(src.terms.sections)) return src.terms.sections;
  }
  if (page.slug === "user-acceptance" && isPlainObject(src.userAcceptance) && Array.isArray(src.userAcceptance.sections)) {
    return src.userAcceptance.sections;
  }
  return [];
}

/** Whitelist document written to public.settings. No title, slug, or flags. */
export function toStoredLegalValue(value) {
  const next = {};
  for (const page of LEGAL_PAGES) {
    next[page.slug] = {
      sections: pickPageSections(value, page).map(normalizeSection),
    };
  }
  return next;
}

export function normalizeLegalSettings(value) {
  return toStoredLegalValue(value);
}

export function getLegalPageSections(value, slug) {
  const page = getHardcodedLegalPage(slug);
  if (!page) return [];
  const stored = toStoredLegalValue(value)[page.slug];
  return Array.isArray(stored?.sections) ? stored.sections : [];
}

export async function fetchLegalSettings() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("scope", LEGAL_SCOPE)
    .eq("key", LEGAL_KEY)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return toStoredLegalValue(data?.value);
}

export async function saveLegalSettings(value) {
  const next = toStoredLegalValue(value);
  const result = await upsertPlatformSetting({
    scope: LEGAL_SCOPE,
    key: LEGAL_KEY,
    value: next,
    description: "Public Legal page section copy.",
    visibility: "public",
  });
  invalidateSettingsCache(LEGAL_SCOPE);
  return {
    value: toStoredLegalValue(result?.setting?.value ?? next),
    version: result?.setting?.version ?? null,
  };
}
