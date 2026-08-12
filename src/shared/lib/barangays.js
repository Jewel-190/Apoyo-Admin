import { supabase } from "./supabaseClient";

/** Import aliases for legacy spreadsheet spellings (not a barangay master list). */
export const BARANGAY_NAME_ALIASES = new Map(
  Object.entries({
    "sta. cristina i": "Santa Cristina I",
    "sta. cristina ii": "Santa Cristina II",
    "sta cristina i": "Santa Cristina I",
    "sta cristina ii": "Santa Cristina II",
    "san miguel i": "San Miguel",
    "zone i-a": "Zone I",
    "zone i a": "Zone I",
  }).map(([key, value]) => [key.toLowerCase(), value])
);

export async function fetchBarangays() {
  const { data, error } = await supabase.functions.invoke("super-admin-voters-management", {
    body: { action: "listBarangays" },
  });

  if (error) {
    throw new Error(error.message || "Unable to load barangays.");
  }
  if (!data?.success) {
    throw new Error(data?.error || "Unable to load barangays.");
  }

  return (data.barangays || []).map((row) => ({
    id: row.id,
    name: row.name ?? "",
  }));
}

/**
 * @param {{ id: string, name: string }[]} barangays
 */
export function buildBarangayCatalog(barangays) {
  const list = [...barangays].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
  );
  const byId = new Map(list.map((b) => [b.id, b]));
  const byName = new Map(list.map((b) => [b.name, b]));
  const nameSet = new Set(list.map((b) => b.name));
  const idSet = new Set(list.map((b) => b.id));
  return { list, byId, byName, nameSet, idSet };
}

/**
 * @param {string} raw
 * @param {Set<string>} barangayNameSet
 */
export function resolveBarangayName(raw, barangayNameSet) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  if (barangayNameSet.has(trimmed)) return trimmed;
  const alias = BARANGAY_NAME_ALIASES.get(trimmed.toLowerCase());
  if (alias && barangayNameSet.has(alias)) return alias;
  return trimmed;
}

/**
 * @param {string} name
 * @param {Map<string, { id: string, name: string }>} barangaysByName
 */
export function barangayIdForName(name, barangaysByName) {
  if (!name) return "";
  return barangaysByName.get(name)?.id ?? "";
}
