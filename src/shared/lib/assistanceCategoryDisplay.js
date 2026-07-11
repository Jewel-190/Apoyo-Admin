/**
 * Display helpers for assistance_categories.assistance_name.
 * Full line titles append a fixed "Assistance" suffix in the UI.
 */

const ASSISTANCE_SUFFIX = "Assistance";

export function normalizeAssistanceName(value) {
  return String(value ?? "").trim();
}

/** e.g. "Medical" → "Medical Assistance" (avoids doubling if name already ends with Assistance). */
export function formatAssistanceLineTitle(assistanceName) {
  const name = normalizeAssistanceName(assistanceName);
  if (!name) {
    return ASSISTANCE_SUFFIX;
  }
  if (name.toLowerCase().endsWith(` ${ASSISTANCE_SUFFIX.toLowerCase()}`)) {
    return name;
  }
  return `${name} ${ASSISTANCE_SUFFIX}`;
}
