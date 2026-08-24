/**
 * System Theme — single primary color in settings; codebase derives the palette.
 *
 * Stored as: scope=system key=system-theme value={ primary_color }
 * Runtime: CSS variables override Tailwind `--color-ocean-*` on :root
 * (Superadmin + Login). Cache + blocking boot script prevent theme FOUC.
 */

import { supabase } from "./supabaseClient";
import {
  SETTINGS_TABLE,
  mergeWithDefault,
  invalidateSettingsCache,
} from "./settingsStore";
import { upsertPlatformSetting } from "./superAdminSettingsApi";

export const SYSTEM_THEME_SCOPE = "system";
export const SYSTEM_THEME_KEY = "system-theme";

/** localStorage key — keep in sync with the inline boot script in index.html */
export const SYSTEM_THEME_STORAGE_KEY = "apoyo.systemTheme.v2";

/** Cold-start / invalid-hex fallback. Live color lives in public.settings. */
export const DEFAULT_SYSTEM_PRIMARY = "#0b8f8b";

export const SYSTEM_THEME_DEFAULTS = Object.freeze({
  primary_color: DEFAULT_SYSTEM_PRIMARY,
});

/**
 * Tight ocean scale around the primary (600). Stops stay in the same hue —
 * Superadmin chrome and Login gradients share this palette (no lime shift).
 */
const OCEAN_LIGHTNESS = Object.freeze({
  50: 0.955,
  100: 0.9,
  200: 0.8,
  300: 0.68,
  400: 0.52,
  500: 0.4,
  600: 0.3,
  700: 0.26,
  800: 0.22,
  900: 0.185,
  950: 0.145,
});

const OCEAN_SATURATION_FACTOR = Object.freeze({
  50: 0.4,
  100: 0.5,
  200: 0.62,
  300: 0.75,
  400: 0.88,
  500: 0.96,
  600: 1,
  700: 0.98,
  800: 0.94,
  900: 0.9,
  950: 0.86,
});

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** Returns a lowercase `#rrggbb` hex, or null if the value is not a complete color. */
export function tryParseHexColor(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  const short = /^#([0-9a-fA-F]{3})$/.exec(hex);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (full) return `#${full[1]}`.toLowerCase();
  return null;
}

export function normalizeHexColor(value, fallback = DEFAULT_SYSTEM_PRIMARY) {
  return tryParseHexColor(value) ?? String(fallback ?? DEFAULT_SYSTEM_PRIMARY).toLowerCase();
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const to = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsl({ r, g, b }) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rr:
      h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
      break;
    case gg:
      h = ((bb - rr) / d + 2) / 6;
      break;
    default:
      h = ((rr - gg) / d + 4) / 6;
      break;
  }
  return { h: h * 360, s, l };
}

function hue2rgb(p, q, t) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb({ h, s, l }) {
  const hh = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = hh / 360;
  return {
    r: hue2rgb(p, q, hk + 1 / 3) * 255,
    g: hue2rgb(p, q, hk) * 255,
    b: hue2rgb(p, q, hk - 1 / 3) * 255,
  };
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex({
    r: A.r + (B.r - A.r) * t,
    g: A.g + (B.g - A.g) * t,
    b: A.b + (B.b - A.b) * t,
  });
}

/** Build ocean-50…950 from a single primary (treated as ocean-600). */
export function buildOceanScale(primaryHex) {
  const primary = normalizeHexColor(primaryHex);
  const { h, s } = rgbToHsl(hexToRgb(primary));
  const scale = {};
  for (const [step, lightness] of Object.entries(OCEAN_LIGHTNESS)) {
    const sat = clamp(s * (OCEAN_SATURATION_FACTOR[step] ?? 1), 0, 1);
    scale[step] = rgbToHex(hslToRgb({ h, s: sat, l: lightness }));
  }
  // Keep the exact chosen primary on the 600 stop.
  scale[600] = primary;
  return scale;
}

/**
 * Accent stays in the same hue as primary (slightly lighter) so Login and
 * Superadmin share one color family — no complementary lime shift.
 */
export function buildAccentColor(primaryHex) {
  const ocean = buildOceanScale(primaryHex);
  return ocean[400];
}

/** CSS custom properties for a themed scope / :root. */
export function buildSystemThemeCssVars(primaryHex) {
  const primary = normalizeHexColor(primaryHex);
  const ocean = buildOceanScale(primary);
  const accent = buildAccentColor(primary);
  const { r, g, b } = hexToRgb(primary);
  const vars = {
    "--system-primary": primary,
    "--system-primary-rgb": `${r}, ${g}, ${b}`,
    "--system-accent": accent,
    // Tight monochromatic gradient (700 → 500), shared by Login + Superadmin CTAs.
    "--system-brand-gradient": `linear-gradient(to right, ${ocean[700]}, ${ocean[500]})`,
    "--system-sidebar-deep": mixHex(ocean[950], "#000000", 0.22),
  };
  for (const [step, hex] of Object.entries(ocean)) {
    vars[`--color-ocean-${step}`] = hex;
  }
  return vars;
}

export function pickSystemTheme(value) {
  const merged = mergeWithDefault(SYSTEM_THEME_DEFAULTS, value);
  return {
    primary_color: normalizeHexColor(merged.primary_color),
  };
}

export function readCachedSystemTheme() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SYSTEM_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const primary = normalizeHexColor(parsed?.primary_color, "");
    if (!primary || primary === "") return null;
    const cssVars =
      parsed?.cssVars && typeof parsed.cssVars === "object"
        ? parsed.cssVars
        : buildSystemThemeCssVars(primary);
    return { primary_color: primary, cssVars };
  } catch {
    return null;
  }
}

export function writeCachedSystemTheme(primaryHex) {
  if (typeof window === "undefined") return;
  const primary = normalizeHexColor(primaryHex);
  const cssVars = buildSystemThemeCssVars(primary);
  try {
    window.localStorage.setItem(
      SYSTEM_THEME_STORAGE_KEY,
      JSON.stringify({ v: 1, primary_color: primary, cssVars })
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
  return cssVars;
}

export function applySystemThemeCssVars(
  cssVars,
  { markReady = true, target = null } = {}
) {
  if (typeof document === "undefined" || !cssVars) return;
  const el = target || document.documentElement;
  for (const [key, value] of Object.entries(cssVars)) {
    el.style.setProperty(key, value);
  }
  if (markReady) {
    document.documentElement.setAttribute("data-system-theme", "ready");
  }
}

/** Apply primary everywhere: CSS vars + optional localStorage cache. */
export function applySystemTheme(primaryHex, { persist = true, markReady = true } = {}) {
  const primary = normalizeHexColor(primaryHex);
  const cssVars = persist
    ? writeCachedSystemTheme(primary)
    : buildSystemThemeCssVars(primary);
  applySystemThemeCssVars(cssVars, { markReady });
  if (markReady) {
    notifySystemThemeListeners(primary);
  } else {
    runtimePrimary = primary;
  }
  return { primary_color: primary, cssVars };
}

/* -------------------------------------------------------------------------- */
/* Runtime store (useSyncExternalStore) — hydrate from cache, then network    */
/* -------------------------------------------------------------------------- */

let runtimePrimary =
  typeof window !== "undefined"
    ? readCachedSystemTheme()?.primary_color || DEFAULT_SYSTEM_PRIMARY
    : DEFAULT_SYSTEM_PRIMARY;
let runtimeReady =
  typeof window !== "undefined" &&
  document.documentElement.getAttribute("data-system-theme") === "ready";
let runtimeSnapshot = null;
let bootstrapPromise = null;
const listeners = new Set();

function buildSnapshot() {
  return {
    primaryColor: runtimePrimary,
    cssVars: buildSystemThemeCssVars(runtimePrimary),
    ready: runtimeReady,
  };
}

function notifySystemThemeListeners(primary) {
  runtimePrimary = normalizeHexColor(primary);
  runtimeReady = true;
  runtimeSnapshot = buildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

export function getSystemThemeSnapshot() {
  if (!runtimeSnapshot) {
    runtimeSnapshot = buildSnapshot();
  }
  return runtimeSnapshot;
}

export function subscribeSystemTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Sync cache → :root, then reconcile with public settings row.
 * Safe to call multiple times; concurrent callers share one fetch.
 */
export function bootstrapSystemTheme() {
  if (typeof window === "undefined") {
    return Promise.resolve(getSystemThemeSnapshot());
  }

  const cached = readCachedSystemTheme();
  if (cached) {
    // Cached theme → paint immediately with the last known color (no FOUC).
    applySystemThemeCssVars(cached.cssVars, { markReady: true });
    runtimePrimary = cached.primary_color;
    runtimeReady = true;
    notifySystemThemeListeners(cached.primary_color);
  } else {
    // Cold start: hold #root until the public settings row resolves
    // (index.html hides #root until data-system-theme="ready").
    runtimePrimary = DEFAULT_SYSTEM_PRIMARY;
    runtimeReady = false;
  }

  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = fetchSystemTheme()
    .then((value) => {
      applySystemTheme(value.primary_color, { persist: true, markReady: true });
      return getSystemThemeSnapshot();
    })
    .catch(() => {
      // Network failure: unblock with cache/default so the app remains usable.
      applySystemTheme(runtimePrimary, {
        persist: Boolean(cached),
        markReady: true,
      });
      return getSystemThemeSnapshot();
    });

  return bootstrapPromise;
}

export async function fetchSystemTheme() {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select("value")
    .eq("scope", SYSTEM_THEME_SCOPE)
    .eq("key", SYSTEM_THEME_KEY)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return pickSystemTheme(data?.value);
}

export async function saveSystemTheme(value) {
  const next = pickSystemTheme(value);
  const result = await upsertPlatformSetting({
    scope: SYSTEM_THEME_SCOPE,
    key: SYSTEM_THEME_KEY,
    value: next,
    description: "System primary color for Superadmin and Login chrome.",
    visibility: "public",
  });
  invalidateSettingsCache(SYSTEM_THEME_SCOPE);
  const saved = pickSystemTheme(result?.setting?.value ?? next);
  applySystemTheme(saved.primary_color, { persist: true });
  return {
    value: saved,
    version: result?.setting?.version ?? null,
  };
}
