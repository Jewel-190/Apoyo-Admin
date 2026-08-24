/**
 * Public website color theme.
 *
 * Stored as web_content page `global` → `{ theme: { primary_color } }`.
 * The CMS and ApoyoWeb derive the same palette / CSS variables in code —
 * only the hex is persisted.
 *
 * Keep this file in sync with ApoyoWeb/src/shared/lib/webTheme.js
 */

export const DEFAULT_WEB_PRIMARY = "#2e7d32";

/** Warm page canvas — surface, not brand. Stays constant across themes. */
export const WEB_PAPER = "#faf8f5";

/**
 * Hexes from the former hardcoded public-site green. Stored copy that still
 * uses these is treated as “follow the site theme” so the CMS picker wins.
 */
const LEGACY_SITE_BRAND_HEX = new Set([
  "#2e7d32",
  "#1b5e20",
  "#1f5a24",
  "#43a047",
  "#388e3c",
  "#66bb6a",
  "#4caf50",
  "#0f766e",
  "#14532d",
  "#0b3d2e",
  "#052e16",
  "#0c1914",
]);

/** localStorage key — keep in sync with the inline boot script in ApoyoWeb index.html */
export const WEB_THEME_STORAGE_KEY = "apoyo.webTheme.v1";

export const WEB_THEME_DEFAULTS = Object.freeze({
  primary_color: DEFAULT_WEB_PRIMARY,
});

/** Lightness stops around the chosen primary (treated as 600). */
const WEB_LIGHTNESS = Object.freeze({
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

const WEB_SATURATION_FACTOR = Object.freeze({
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

export const WEB_SCALE_STEPS = Object.freeze(Object.keys(WEB_LIGHTNESS));

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeHexColor(value, fallback = DEFAULT_WEB_PRIMARY) {
  const raw = String(value || "").trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(raw);
  if (full) return `#${full[1]}`.toLowerCase();
  return fallback.toLowerCase();
}

export function isLegacySiteBrandHex(value) {
  const hex = normalizeHexColor(value, "");
  return Boolean(hex) && LEGACY_SITE_BRAND_HEX.has(hex);
}

/** Empty / legacy brand hex → CSS variable so chrome follows the live theme. */
export function resolveSiteAccentColor(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "var(--web-primary)";
  if (isLegacySiteBrandHex(raw)) return "var(--web-primary)";
  if (raw.startsWith("var(")) return raw;
  return normalizeHexColor(raw);
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

function rgbChannels(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

/** Build 50…950 from a single primary (treated as the 600 stop). */
export function buildWebScale(primaryHex) {
  const primary = normalizeHexColor(primaryHex);
  const { h, s } = rgbToHsl(hexToRgb(primary));
  const scale = {};
  for (const [step, lightness] of Object.entries(WEB_LIGHTNESS)) {
    const sat = clamp(s * (WEB_SATURATION_FACTOR[step] ?? 1), 0, 1);
    scale[step] = rgbToHex(hslToRgb({ h, s: sat, l: lightness }));
  }
  scale[600] = primary;
  return scale;
}

/**
 * CSS custom properties for the public site.
 * `--color-brand*` are Tailwind v4 tokens (overwritten on :root at runtime).
 */
export function buildWebThemeCssVars(primaryHex) {
  const primary = normalizeHexColor(primaryHex);
  const scale = buildWebScale(primary);
  const ink = scale[800];
  const soft = scale[50];
  const wash = mixHex(scale[50], "#ffffff", 0.28);
  const muted = scale[100];
  const paper = WEB_PAPER;
  const pageTo = mixHex(paper, soft, 0.78);
  const pageVia = mixHex(paper, "#ffffff", 0.42);
  const softRgb = rgbChannels(soft);
  const deep = mixHex(scale[950], "#000000", 0.22);
  const deepMid = scale[900];
  const deepVia = scale[700];
  const onDeep = scale[200];
  const highlight = scale[400];

  return {
    "--web-primary": primary,
    "--web-primary-rgb": rgbChannels(primary),
    "--web-ink": ink,
    "--web-ink-rgb": rgbChannels(ink),
    "--web-soft": soft,
    "--web-soft-rgb": softRgb,
    "--web-wash": wash,
    "--web-muted": muted,
    "--web-accent": highlight,
    "--web-deep": deep,
    "--web-deep-mid": deepMid,
    "--web-deep-via": deepVia,
    "--web-on-deep": onDeep,
    "--web-highlight": highlight,
    "--web-page-from": paper,
    "--web-page-via": pageVia,
    "--web-page-to": pageTo,
    "--web-brand-gradient": `linear-gradient(to right, ${scale[700]}, ${scale[500]})`,
    "--web-deep-gradient": `linear-gradient(to bottom right, ${deep}, ${deepMid}, ${deepVia})`,
    "--web-nav-gradient": `linear-gradient(90deg, rgba(${softRgb}, 0.96) 0%, rgba(${softRgb}, 0.72) 18%, rgba(${softRgb}, 0.42) 50%, rgba(${softRgb}, 0.72) 82%, rgba(${softRgb}, 0.96) 100%)`,
    "--color-brand": primary,
    "--color-brand-ink": ink,
    "--color-brand-soft": soft,
    "--color-brand-wash": wash,
    "--color-brand-muted": muted,
    "--color-brand-deep": deep,
    "--color-brand-deep-mid": deepMid,
    "--color-brand-deep-via": deepVia,
    "--color-brand-on-deep": onDeep,
    "--color-brand-highlight": highlight,
    "--color-brand-page-from": paper,
    "--color-brand-page-via": pageVia,
    "--color-brand-page-to": pageTo,
  };
}

/** Persist only the chosen hex. Extra keys from older drafts are dropped. */
export function pickWebTheme(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    primary_color: normalizeHexColor(raw.primary_color),
  };
}

export function readCachedWebTheme() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WEB_THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const primary = normalizeHexColor(parsed?.primary_color, "");
    if (!primary) return null;
    const cssVars =
      parsed?.cssVars && typeof parsed.cssVars === "object"
        ? parsed.cssVars
        : buildWebThemeCssVars(primary);
    return { primary_color: primary, cssVars };
  } catch {
    return null;
  }
}

export function writeCachedWebTheme(primaryHex) {
  if (typeof window === "undefined") return buildWebThemeCssVars(primaryHex);
  const primary = normalizeHexColor(primaryHex);
  const cssVars = buildWebThemeCssVars(primary);
  try {
    window.localStorage.setItem(
      WEB_THEME_STORAGE_KEY,
      JSON.stringify({ v: 1, primary_color: primary, cssVars })
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
  return cssVars;
}

export function applyWebThemeCssVars(cssVars, { target = null } = {}) {
  if (typeof document === "undefined" || !cssVars) return;
  const el = target || document.documentElement;
  for (const [key, value] of Object.entries(cssVars)) {
    el.style.setProperty(key, value);
  }
}

export function applyWebTheme(primaryHex, { persist = true } = {}) {
  const primary = normalizeHexColor(primaryHex);
  const cssVars = persist ? writeCachedWebTheme(primary) : buildWebThemeCssVars(primary);
  applyWebThemeCssVars(cssVars);
  return { primary_color: primary, cssVars };
}
