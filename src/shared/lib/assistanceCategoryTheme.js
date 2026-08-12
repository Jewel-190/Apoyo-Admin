/**
 * Mobile-style gradients from `assistance_categories.theme_json`.
 * Matches ApoyoMobile `AssistanceCategoryTheme.ts` (accent + derived stripe).
 * Also accepts admin CMS palette objects with `primary`, `secondary`, etc.
 */

import { normalizeThemeJsonHex } from "./themeJsonPalette";

function isHex6(input) {
  return Boolean(normalizeThemeJsonHex(input));
}

function hexToRgb(hex) {
  const h = normalizeThemeJsonHex(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

function adjustHsl(hex, dh, ds, dl) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const o = hslToRgb(h + dh, s + ds, l + dl);
  return rgbToHex(o.r, o.g, o.b);
}

function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return normalizeThemeJsonHex(a) || normalizeThemeJsonHex(b) || a;
  return rgbToHex(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t);
}

export function defaultAccentHexForSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (s === "medical") return "#12B4D8";
  if (s === "financial") return "#F6D34D";
  if (s === "burial") return "#7C3AED";
  return "#6B7280";
}

function legacyGradientPair(raw) {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const a = normalizeThemeJsonHex(raw[0]);
  const b = normalizeThemeJsonHex(raw[1]);
  if (!a || !b) return null;
  return [a, b];
}

function readAccentFromObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const primary = normalizeThemeJsonHex(obj.primary);
  if (primary) return primary;

  const stripe =
    legacyGradientPair(obj.home_card_stripe_gradient) ??
    legacyGradientPair(obj.homeCardStripeGradient);
  if (stripe) return stripe[0];

  const status =
    legacyGradientPair(obj.status_card_header_gradient) ??
    legacyGradientPair(obj.statusCardHeaderGradient);
  if (status) return status[0];

  const secondary = normalizeThemeJsonHex(obj.secondary);
  if (secondary) return secondary;

  return null;
}

export function parseThemeAccentFromDb(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (isHex6(t)) return normalizeThemeJsonHex(t);
    try {
      const parsed = JSON.parse(t);
      return readAccentFromObject(parsed);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    if (Array.isArray(raw)) {
      const pair = legacyGradientPair(raw);
      return pair ? pair[0] : null;
    }
    return readAccentFromObject(raw);
  }
  return null;
}

export function buildAssistanceCategoryTheme(slug, accentHex) {
  const base = normalizeThemeJsonHex(accentHex) || defaultAccentHexForSlug(slug);
  const s = String(slug || "").trim().toLowerCase();
  const stripeEnd = s === "financial" ? adjustHsl(base, 0, 4, -9) : adjustHsl(base, 0, 6, 10);
  const stripe = [base, stripeEnd];
  const statusStripe =
    s === "burial"
      ? [mixHex(base, "#FF2DF7", 0.42), mixHex(base, "#7B61FF", 0.52)]
      : stripe;

  return {
    homeCardStripeGradient: stripe,
    statusCardHeaderGradient: statusStripe,
    homeChipActiveGradient: stripe,
    accent: base,
  };
}

export function parseAssistanceCategoryTheme(slug, themeJson) {
  let parsed =
    typeof themeJson === "object" && themeJson !== null && !Array.isArray(themeJson)
      ? themeJson
      : null;
  if (!parsed && typeof themeJson === "string") {
    try {
      const o = JSON.parse(themeJson);
      if (o && typeof o === "object" && !Array.isArray(o)) parsed = o;
    } catch {
      /* ignore */
    }
  }

  const explicitStripe =
    legacyGradientPair(parsed?.home_card_stripe_gradient) ??
    legacyGradientPair(parsed?.homeCardStripeGradient);

  if (explicitStripe) {
    const accent = explicitStripe[0];
    const built = buildAssistanceCategoryTheme(slug, accent);
    return { ...built, homeCardStripeGradient: explicitStripe };
  }

  const accent = parseThemeAccentFromDb(themeJson) ?? defaultAccentHexForSlug(slug);
  return buildAssistanceCategoryTheme(slug, accent);
}

/** `[from, to]` hex stops for the service title card stripe in mobile Request Info. */
export function getHomeCardStripeGradient(slug, themeJson) {
  return parseAssistanceCategoryTheme(slug, themeJson).homeCardStripeGradient;
}
