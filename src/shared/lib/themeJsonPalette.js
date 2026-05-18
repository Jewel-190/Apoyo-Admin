/**
 * Derive admin shell colors from assistance_categories.theme_json.
 * DB stores raw hex (including gradient arrays); blending happens only here.
 */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Returns `#rrggbb` or null if not a valid hex color string. */
export function normalizeThemeJsonHex(input) {
  return normalizeHex(input);
}

function normalizeHex(input) {
  if (typeof input !== "string") {
    return null;
  }
  let s = input.trim();
  if (!s) {
    return null;
  }
  if (!s.startsWith("#") && HEX_RE.test(s)) {
    s = `#${s}`;
  }
  if (!HEX_RE.test(s)) {
    return null;
  }
  if (s.length === 4) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (s.length === 9) {
    return s.slice(0, 7).toLowerCase();
  }
  return s.toLowerCase();
}

function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h || h.length !== 7) {
    return null;
  }
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Linear RGB mix: t=0 → a, t=1 → b */
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) {
    return normalizeHex(a) || normalizeHex(b);
  }
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex(
    A.r + (B.r - A.r) * u,
    A.g + (B.g - A.g) * u,
    A.b + (B.b - A.b) * u
  );
}

function lightenTowardWhite(hex, amount) {
  return mixHex(hex, "#ffffff", Math.max(0, Math.min(1, amount)));
}

function darkenTowardBlack(hex, amount) {
  return mixHex(hex, "#000000", Math.max(0, Math.min(1, amount)));
}

function pushUniqueSeeds(list, seen, value) {
  const n = normalizeHex(value);
  if (n && !seen.has(n)) {
    seen.add(n);
    list.push(n);
  }
}

/**
 * Prefer known mobile gradient keys (stable order), then any other hex in JSON.
 */
export function extractThemeJsonHexSeeds(themeObj) {
  if (!themeObj || typeof themeObj !== "object") {
    return [];
  }
  const ordered = [];
  const seen = new Set();

  const gradientKeys = [
    "home_card_stripe_gradient",
    "home_chip_active_gradient",
    "status_card_header_gradient",
  ];

  for (const key of gradientKeys) {
    const arr = themeObj[key];
    if (!Array.isArray(arr)) {
      continue;
    }
    for (const el of arr) {
      if (typeof el === "string") {
        pushUniqueSeeds(ordered, seen, el);
      }
    }
  }

  const walk = (node) => {
    if (node == null) {
      return;
    }
    if (typeof node === "string") {
      pushUniqueSeeds(ordered, seen, node);
      return;
    }
    if (Array.isArray(node)) {
      for (const el of node) {
        walk(el);
      }
      return;
    }
    if (typeof node === "object") {
      for (const v of Object.values(node)) {
        walk(v);
      }
    }
  };

  walk(themeObj);
  return ordered;
}

/**
 * Build admin UI palette from 1+ seed hexes (all blending is local).
 * @returns {Record<'primary'|'secondary'|'tertiary'|'accent'|'ring', string>|null}
 */
export function buildBlendedAdminPaletteFromSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return null;
  }

  const p0 = normalizeHex(seeds[0]);
  if (!p0) {
    return null;
  }
  const p1 = seeds[1] ? normalizeHex(seeds[1]) : null;

  const secondary = p1 ? mixHex(p0, p1, 0.52) : lightenTowardWhite(p0, 0.18);
  const tertiary = p1 ? mixHex(p1, p0, 0.35) : lightenTowardWhite(p0, 0.28);
  const accent = lightenTowardWhite(mixHex(p0, p1 || p0, 0.22), 0.32);
  const ring = darkenTowardBlack(mixHex(p0, p1 || p0, 0.6), 0.14);

  return {
    primary: p0,
    secondary,
    tertiary,
    accent,
    ring,
  };
}
