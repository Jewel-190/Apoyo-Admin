/**
 * Canonical web_content payloads.
 *
 * The public site and Superadmin CMS persist through the `web` edge function.
 * This module is the write/read whitelist: locked product chrome is stripped,
 * legacy keys are migrated, and only known pages are returned.
 */

export const WEB_PAGES = ["global", "home", "services", "about"] as const;
export type WebPage = (typeof WEB_PAGES)[number];

export const DEFAULT_WEB_PRIMARY = "#2e7d32";
export const MAX_CONTENT_BYTES = 1_500_000;

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

const LEGAL_PAGE_SLUGS = ["terms-and-conditions", "user-acceptance"] as const;

export function isWebPage(value: unknown): value is WebPage {
  return typeof value === "string" && (WEB_PAGES as readonly string[]).includes(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertContentSize(value: unknown) {
  const size = new TextEncoder().encode(JSON.stringify(value ?? {})).length;
  if (size > MAX_CONTENT_BYTES) {
    throw new Error("Page content is too large to publish.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function normalizeHexColor(value: unknown, fallback = DEFAULT_WEB_PRIMARY): string {
  const raw = str(value).trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(raw);
  if (full) return `#${full[1]}`.toLowerCase();
  return fallback.toLowerCase();
}

function isLegacySiteBrandHex(value: unknown): boolean {
  const hex = normalizeHexColor(value, "");
  return Boolean(hex) && LEGACY_SITE_BRAND_HEX.has(hex);
}

function pickWebTheme(value: unknown): { primary_color: string } {
  const raw = asRecord(value);
  return { primary_color: normalizeHexColor(raw.primary_color) };
}

function normalizeNavbar(value: unknown): Record<string, string> {
  const next = asRecord(value);
  return {
    dasmaLogo: str(next.dasmaLogo || next.logoSecondary).trim(),
    dasmaLogoAlt: str(next.dasmaLogoAlt || next.logoSecondaryAlt).trim(),
    dasmaBanner: str(next.dasmaBanner).trim(),
    dasmaBannerAlt: str(next.dasmaBannerAlt).trim(),
  };
}

function normalizeFooter(value: unknown): Record<string, unknown> {
  const next = asRecord(value);
  return {
    dasmaLogo: str(next.dasmaLogo || next.logo).trim(),
    dasmaLogoAlt: str(next.dasmaLogoAlt || next.logoAlt).trim(),
    dasmaBanner: str(next.dasmaBanner).trim(),
    dasmaBannerAlt: str(next.dasmaBannerAlt).trim(),
    tagline: next.tagline ?? "",
    copyright: str(next.copyright),
  };
}

function canonicalizeGlobal(value: unknown): Record<string, unknown> {
  const src = asRecord(value);
  const site = asRecord(src.site);
  return {
    theme: pickWebTheme(src.theme),
    site: { title: str(site.title) },
    navbar: normalizeNavbar(src.navbar),
    footer: normalizeFooter(src.footer),
  };
}

function canonicalizeHomeDownload(download: unknown): Record<string, unknown> {
  const src = asRecord(download);
  const existingLinks = Array.isArray(src.links) ? src.links : [];
  const hasLinks = existingLinks.some((link) => {
    const row = asRecord(link);
    return str(row.href).trim() || str(row.image).trim() || str(row.label).trim();
  });
  let links = existingLinks;
  if (!hasLinks && (src.badgeImage || src.storeHref)) {
    links = [
      {
        label: "App store",
        image: src.badgeImage || "",
        alt: src.badgeAlt || "",
        href: src.storeHref || "",
      },
    ];
  }
  const next = { ...src, links };
  delete next.badgeImage;
  delete next.badgeAlt;
  delete next.storeHref;
  return next;
}

function canonicalizeHomeQuickLinks(quickLinks: unknown): Record<string, unknown> {
  const src = asRecord(quickLinks);
  const items = Array.isArray(src.items)
    ? src.items.map((item) => {
      if (!isPlainObject(item)) return item;
      const accent = str(item.accent).trim();
      if (!accent || isLegacySiteBrandHex(accent)) return { ...item, accent: "" };
      return item;
    })
    : src.items;
  return { ...src, items };
}

function canonicalizeHome(value: unknown): Record<string, unknown> {
  const src = asRecord(value);
  const next: Record<string, unknown> = { ...src };
  if (src.download) next.download = canonicalizeHomeDownload(src.download);
  if (src.quickLinks) next.quickLinks = canonicalizeHomeQuickLinks(src.quickLinks);
  delete next.contacts;
  return next;
}

const EMPTY_PRESENTATION = {
  catalogSlug: "",
  infoLink: "",
  infoLabel: "",
  locationLabel: "",
  locationAddress: "",
  lat: "",
  lng: "",
  imagesSide: "left",
  imageMain: "",
  imageSub1: "",
  imageSub2: "",
};

function presentationFromLegacy(row: unknown): Record<string, unknown> {
  const cat = asRecord(row);
  return {
    ...EMPTY_PRESENTATION,
    catalogSlug: str(cat.catalogSlug ?? cat.id).trim(),
    infoLink: cat.infoLink ?? "",
    infoLabel: cat.infoLabel ?? "",
    locationLabel: cat.locationLabel ?? "",
    locationAddress: cat.locationAddress ?? "",
    lat: cat.lat ?? "",
    lng: cat.lng ?? "",
    imagesSide: str(cat.imagesSide) === "right" ? "right" : "left",
    imageMain: cat.imageMain ?? "",
    imageSub1: cat.imageSub1 ?? "",
    imageSub2: cat.imageSub2 ?? "",
  };
}

function canonicalizeServices(value: unknown): { presentations: Record<string, unknown>[] } {
  const src = asRecord(value);
  const fromPresentations = Array.isArray(src.presentations)
    ? src.presentations.map(presentationFromLegacy)
    : [];
  const fromLegacy = Array.isArray(src.categories)
    ? src.categories.map(presentationFromLegacy)
    : [];
  const bySlug = new Map<string, Record<string, unknown>>();
  for (const row of [...fromLegacy, ...fromPresentations]) {
    const slug = str(row.catalogSlug).trim();
    if (!slug) continue;
    bySlug.set(slug, { ...row, catalogSlug: slug });
  }
  return { presentations: [...bySlug.values()] };
}

function isQuickLinksGroup(group: Record<string, unknown>): boolean {
  if (group.id === "quickLinks") return true;
  return /^quick\s*links$/i.test(str(group.title).trim());
}

function channelEntry(entry: unknown): Record<string, string> {
  const rawObj = asRecord(entry);
  const raw = isPlainObject(rawObj.jsonb_build_object)
    ? asRecord(rawObj.jsonb_build_object)
    : rawObj;
  const kind = ["text", "phone", "email", "link", "route"].includes(str(raw.kind))
    ? str(raw.kind)
    : "text";
  const style = ["card", "primary", "secondary"].includes(str(raw.style))
    ? str(raw.style)
    : "card";
  return {
    kind,
    label: str(raw.label),
    body: str(raw.body),
    href: str(raw.href),
    style,
  };
}

function normalizeChannelGroup(group: unknown): Record<string, unknown> {
  const src = asRecord(group);
  const quick = isQuickLinksGroup(src);
  return {
    ...(quick ? { id: "quickLinks" } : src.id ? { id: src.id } : {}),
    title: src.title ?? "",
    entries: Array.isArray(src.entries) ? src.entries.map(channelEntry) : [],
  };
}

function canonicalizeAbout(value: unknown): Record<string, unknown> {
  const src = asRecord(value);
  const ch = asRecord(src.channels);
  const hasGroups = Array.isArray(ch.groups);
  const groups = (hasGroups ? ch.groups.map(normalizeChannelGroup) : [])
    .filter((group) => !isQuickLinksGroup(asRecord(group)));
  return {
    ...src,
    channels: {
      heading: ch.heading ?? "",
      intro: ch.intro ?? "",
      groups,
    },
  };
}

export function canonicalizePageContent(page: WebPage, value: unknown): Record<string, unknown> {
  if (page === "global") return canonicalizeGlobal(value);
  if (page === "home") return canonicalizeHome(value);
  if (page === "services") return canonicalizeServices(value);
  return canonicalizeAbout(value);
}

function mapLegalSections(raw: unknown): { heading: string; body: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((section) => {
    const item = asRecord(section);
    return { heading: str(item.heading), body: str(item.body) };
  });
}

function legalPageSectionsFrom(value: unknown, slug: string): { heading: string; body: string }[] {
  const src = asRecord(value);
  const named = asRecord(src[slug]);
  if (Array.isArray(named.sections)) return mapLegalSections(named.sections);
  if (Array.isArray(src.pages) && src.pages.length) {
    const pages = src.pages.filter(isPlainObject);
    const match = pages.find((page) => {
      const pageSlug = str(page.slug).trim().toLowerCase();
      const title = str(page.title).trim().toLowerCase();
      if (pageSlug === slug) return true;
      if (slug === "terms-and-conditions") {
        return pageSlug === "legal" || pageSlug === "terms" || title.includes("terms");
      }
      if (slug === "user-acceptance") {
        return title.includes("user acceptance") || title.includes("acceptance");
      }
      return false;
    });
    if (match && Array.isArray(match.sections)) return mapLegalSections(match.sections);
  }
  if (slug === "terms-and-conditions") {
    if (Array.isArray(src.sections)) return mapLegalSections(src.sections);
    if (isPlainObject(src.terms) && Array.isArray(src.terms.sections)) {
      return mapLegalSections(src.terms.sections);
    }
  }
  if (
    slug === "user-acceptance" &&
    isPlainObject(src.userAcceptance) &&
    Array.isArray(src.userAcceptance.sections)
  ) {
    return mapLegalSections(src.userAcceptance.sections);
  }
  return [];
}

export function canonicalizeLegal(value: unknown): Record<string, { sections: { heading: string; body: string }[] }> {
  const next: Record<string, { sections: { heading: string; body: string }[] }> = {};
  for (const slug of LEGAL_PAGE_SLUGS) {
    next[slug] = { sections: legalPageSectionsFrom(value, slug) };
  }
  return next;
}

export const EMPTY_LEGAL = canonicalizeLegal(null);
