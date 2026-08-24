/**
 * Logo & Banner branding.
 *
 * Apoyo assets are fixed local files (not client-editable).
 * Dasmariñas logo/banner are managed via settings (system / logo-and-banner)
 * and uploaded to the public `web-content` bucket under branding/.
 *
 * Runtime: localStorage cache + early bootstrap (same pattern as System Theme)
 * so Login / Admin / Superadmin chrome paint without empty-logo flash.
 */

import { APOYO_BANNER_URL, APOYO_LOGO_URL } from "./staticAssets";
import { supabase } from "./supabaseClient";
import {
  SETTINGS_TABLE,
  mergeWithDefault,
  invalidateSettingsCache,
} from "./settingsStore";
import { upsertPlatformSetting } from "./superAdminSettingsApi";

export const LOGO_BANNER_SCOPE = "system";
export const LOGO_BANNER_KEY = "logo-and-banner";

/** Keep in sync if you ever need a boot-script consumer. */
export const LOGO_BANNER_STORAGE_KEY = "apoyo.logoAndBanner.v1";

export { APOYO_LOGO_URL, APOYO_BANNER_URL };

export const LOGO_BANNER_DEFAULTS = Object.freeze({
  dasma_logo_url: "",
  dasma_banner_url: "",
});

export const LOGO_BANNER_FIELDS = Object.freeze([
  {
    key: "dasma_logo_url",
    label: "Dasmariñas Logo",
    hint: "Shown in Admin nav, Superadmin nav, and the Login header.",
  },
  {
    key: "dasma_banner_url",
    label: "Dasmariñas Banner",
    hint: "Shown in the Login header alongside the Dasmariñas logo.",
  },
]);

const BRANDING_BUCKET = "web-content";
const BRANDING_MAX_BYTES = 10 * 1024 * 1024;
/** Unique object paths → safe long-lived CDN cache. */
const BRANDING_CACHE_CONTROL = "31536000";

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

export function pickDasmaFields(value) {
  const merged = mergeWithDefault(LOGO_BANNER_DEFAULTS, value);
  return {
    dasma_logo_url: String(merged.dasma_logo_url || "").trim(),
    dasma_banner_url: String(merged.dasma_banner_url || "").trim(),
  };
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function isDisplayableAssetUrl(value) {
  const trimmed = String(value || "").trim();
  return Boolean(trimmed) && (isHttpUrl(trimmed) || trimmed.startsWith("/"));
}

/** Upload a branding image; returns a public URL (immutable path). */
export async function uploadBrandingAsset(file) {
  if (!file) {
    throw new Error("Choose an image file to upload.");
  }
  if (
    !String(file.type || "").startsWith("image/") &&
    !/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || "")
  ) {
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
    cacheControl: BRANDING_CACHE_CONTROL,
    upsert: false,
    contentType,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BRANDING_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

/**
 * Resolve display URLs. Apoyo assets are always the hardcoded constants.
 * @param {Record<string, string>} stored
 * @param {{ dasmaLogo?: string, dasmaBanner?: string }} [fallbacks]
 */
export function resolveLogoAndBanner(stored, fallbacks = {}) {
  const value = pickDasmaFields(stored);
  const pick = (url, fallback) => {
    const trimmed = String(url || "").trim();
    if (isDisplayableAssetUrl(trimmed)) return trimmed;
    const fb = String(fallback || "").trim();
    if (isDisplayableAssetUrl(fb)) return fb;
    return "";
  };

  return {
    apoyoLogo: APOYO_LOGO_URL,
    apoyoBanner: APOYO_BANNER_URL,
    dasmaLogo: pick(value.dasma_logo_url, fallbacks.dasmaLogo),
    dasmaBanner: pick(value.dasma_banner_url, fallbacks.dasmaBanner),
    raw: value,
  };
}

export function readCachedLogoAndBanner() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOGO_BANNER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return pickDasmaFields(parsed);
  } catch {
    return null;
  }
}

export function writeCachedLogoAndBanner(value) {
  if (typeof window === "undefined") return;
  const next = pickDasmaFields(value);
  try {
    window.localStorage.setItem(
      LOGO_BANNER_STORAGE_KEY,
      JSON.stringify({ v: 1, ...next })
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
  return next;
}

function preloadImage(url) {
  if (typeof window === "undefined" || !isDisplayableAssetUrl(url)) return;
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  } catch {
    // Ignore preload failures.
  }
}

function preloadBrandingAssets(value) {
  const resolved = resolveLogoAndBanner(value);
  preloadImage(resolved.dasmaLogo);
  preloadImage(resolved.dasmaBanner);
}

/* -------------------------------------------------------------------------- */
/* Runtime store (useSyncExternalStore) — hydrate from cache, then network    */
/* -------------------------------------------------------------------------- */

let runtimeValue = (() => {
  if (typeof window === "undefined") return { ...LOGO_BANNER_DEFAULTS };
  return pickDasmaFields(readCachedLogoAndBanner() || LOGO_BANNER_DEFAULTS);
})();
let runtimeReady =
  typeof window !== "undefined" && Boolean(readCachedLogoAndBanner());
let runtimeSnapshot = null;
let bootstrapPromise = null;
const listeners = new Set();

function buildSnapshot() {
  return {
    raw: runtimeValue,
    assets: resolveLogoAndBanner(runtimeValue),
    ready: runtimeReady,
  };
}

function notifyLogoAndBannerListeners(value) {
  runtimeValue = pickDasmaFields(value);
  runtimeReady = true;
  runtimeSnapshot = buildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

export function getLogoAndBannerSnapshot() {
  if (!runtimeSnapshot) {
    runtimeSnapshot = buildSnapshot();
  }
  return runtimeSnapshot;
}

export function subscribeLogoAndBanner(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply branding everywhere: runtime listeners + optional localStorage cache. */
export function applyLogoAndBanner(value, { persist = true } = {}) {
  const next = pickDasmaFields(value);
  if (persist) {
    writeCachedLogoAndBanner(next);
  }
  preloadBrandingAssets(next);
  notifyLogoAndBannerListeners(next);
  return next;
}

/**
 * Fetch Dasmariñas logo/banner settings. Works for anon and authenticated.
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
  return pickDasmaFields(data?.value);
}

/**
 * Sync cache → runtime, then reconcile with the public settings row.
 * Safe to call multiple times; concurrent callers share one fetch.
 */
export function bootstrapLogoAndBanner() {
  if (typeof window === "undefined") {
    return Promise.resolve(getLogoAndBannerSnapshot());
  }

  const cached = readCachedLogoAndBanner();
  if (cached) {
    // Cached URLs → chrome can paint immediately (no empty-logo flash).
    applyLogoAndBanner(cached, { persist: false });
  } else {
    runtimeValue = { ...LOGO_BANNER_DEFAULTS };
    runtimeReady = false;
    runtimeSnapshot = buildSnapshot();
  }

  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = fetchLogoAndBanner()
    .then((value) => {
      applyLogoAndBanner(value, { persist: true });
      return getLogoAndBannerSnapshot();
    })
    .catch(() => {
      // Network failure: unblock with cache/defaults so chrome stays usable.
      applyLogoAndBanner(runtimeValue, { persist: Boolean(cached) });
      return getLogoAndBannerSnapshot();
    });

  return bootstrapPromise;
}

/** Persist Dasmariñas logo/banner settings only (Apoyo branding is code-locked). */
export async function saveLogoAndBanner(value) {
  const next = pickDasmaFields(value);
  const result = await upsertPlatformSetting({
    scope: LOGO_BANNER_SCOPE,
    key: LOGO_BANNER_KEY,
    value: next,
    description: "Dasmariñas logo and banner assets for admin, superadmin, and login chrome.",
    visibility: "public",
  });
  invalidateSettingsCache(LOGO_BANNER_SCOPE);
  const saved = pickDasmaFields(result?.setting?.value ?? next);
  applyLogoAndBanner(saved, { persist: true });
  return {
    value: saved,
    version: result?.setting?.version ?? null,
  };
}
