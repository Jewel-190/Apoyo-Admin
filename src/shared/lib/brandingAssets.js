/**
 * Logo & Banner branding assets (system settings mini-CMS).
 *
 * Stored as public URLs in settings scope=system key=logo-and-banner.
 * Binary files upload to the public `web-content` bucket under branding/.
 */

import { supabase } from "./supabaseClient";
import {
  SETTINGS_TABLE,
  mergeWithDefault,
  invalidateSettingsCache,
} from "./settingsStore";
import { upsertPlatformSetting } from "./superAdminSettingsApi";

export const LOGO_BANNER_SCOPE = "system";
export const LOGO_BANNER_KEY = "logo-and-banner";

export const LOGO_BANNER_DEFAULTS = Object.freeze({
  apoyo_logo_url: "",
  apoyo_banner_url: "",
  dasma_logo_url: "",
  dasma_banner_url: "",
});

export const LOGO_BANNER_FIELDS = Object.freeze([
  {
    key: "apoyo_logo_url",
    label: "Apoyo Logo",
    hint: "Used in Admin and Super Admin navbars.",
  },
  {
    key: "apoyo_banner_url",
    label: "Apoyo Banner",
    hint: "Used in the Login page header.",
  },
  {
    key: "dasma_logo_url",
    label: "Dasmarinas Logo",
    hint: "Used in Admin, Super Admin, and Login chrome.",
  },
  {
    key: "dasma_banner_url",
    label: "Dasmarinas Banner",
    hint: "Used in Admin, Super Admin, and Login chrome.",
  },
]);

const BRANDING_BUCKET = "web-content";
const BRANDING_MAX_BYTES = 10 * 1024 * 1024;

function inferImageContentType(file) {
  if (file?.type?.startsWith("image/")) return file.type;
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

/** Upload a branding image; returns a public URL. */
export async function uploadBrandingAsset(file) {
  if (!file) {
    throw new Error("Choose an image file to upload.");
  }
  if (!String(file.type || "").startsWith("image/") && !/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || "")) {
    throw new Error("Only image files are allowed.");
  }
  if (file.size > BRANDING_MAX_BYTES) {
    throw new Error(
      `Image is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max is 10 MB.`
    );
  }

  const contentType = inferImageContentType(file);
  const safeName = String(file.name || "image.png").replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `branding/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  const { error } = await supabase.storage.from(BRANDING_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Fetch logo/banner settings. Works for anon (public visibility) and authenticated.
 */
export async function fetchLogoAndBanner() {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select("value")
    .eq("scope", LOGO_BANNER_SCOPE)
    .eq("key", LOGO_BANNER_KEY)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return mergeWithDefault(LOGO_BANNER_DEFAULTS, data?.value);
}

/** Persist logo/banner settings as a public system group (login can read). */
export async function saveLogoAndBanner(value) {
  const next = mergeWithDefault(LOGO_BANNER_DEFAULTS, value);
  const result = await upsertPlatformSetting({
    scope: LOGO_BANNER_SCOPE,
    key: LOGO_BANNER_KEY,
    value: next,
    description: "Platform logo and banner assets for admin, superadmin, and login chrome.",
    visibility: "public",
  });
  invalidateSettingsCache(LOGO_BANNER_SCOPE);
  return {
    value: result?.setting?.value ?? next,
    version: result?.setting?.version ?? null,
  };
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

/**
 * Resolve display URLs with optional local fallbacks for missing CMS values.
 * @param {Record<string, string>} stored
 * @param {{ apoyoLogo?: string, apoyoBanner?: string, dasmaLogo?: string, dasmaBanner?: string }} [fallbacks]
 */
export function resolveLogoAndBanner(stored, fallbacks = {}) {
  const value = mergeWithDefault(LOGO_BANNER_DEFAULTS, stored);
  const pick = (url, fallback) => {
    const trimmed = String(url || "").trim();
    if (trimmed && isHttpUrl(trimmed)) return trimmed;
    if (trimmed && trimmed.startsWith("/")) return trimmed;
    return fallback || "";
  };

  return {
    apoyoLogo: pick(value.apoyo_logo_url, fallbacks.apoyoLogo),
    apoyoBanner: pick(value.apoyo_banner_url, fallbacks.apoyoBanner),
    dasmaLogo: pick(value.dasma_logo_url, fallbacks.dasmaLogo),
    dasmaBanner: pick(value.dasma_banner_url, fallbacks.dasmaBanner),
    raw: value,
  };
}
