import { supabase } from "./supabaseClient";

const FUNCTION_NAME = "super-admin-voters-management";

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

export function normalizeBarangayName(raw) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function stringifyErrorField(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (value.error != null) return stringifyErrorField(value.error);
    try {
      return JSON.stringify(value);
    } catch {
      return "Barangay request failed.";
    }
  }
  return String(value);
}

async function readInvokeErrorDetail(error, data) {
  const fromData = stringifyErrorField(data?.error) || stringifyErrorField(data?.message);
  if (fromData) return fromData;

  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      const fromPayload =
        stringifyErrorField(payload?.error) || stringifyErrorField(payload?.message);
      if (fromPayload) return fromPayload;
    } catch {
      // ignore
    }
  }

  return stringifyErrorField(error?.message) || "Barangay request failed.";
}

function mapBarangay(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    isActive: row.isActive !== false,
    voterCount: Number(row.voterCount ?? 0) || 0,
  };
}

async function invokeBarangays(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Barangay request failed.");
  }
  return data;
}

export async function fetchBarangays() {
  const data = await invokeBarangays({ action: "listBarangays" });
  return (data.barangays || []).map(mapBarangay).filter((row) => row?.id);
}

export async function createBarangay(name) {
  const data = await invokeBarangays({
    action: "createBarangay",
    name: normalizeBarangayName(name),
  });
  return mapBarangay(data.barangay);
}

export async function updateBarangay(barangayId, name) {
  const data = await invokeBarangays({
    action: "updateBarangay",
    barangayId,
    name: normalizeBarangayName(name),
  });
  return mapBarangay(data.barangay);
}

export async function deleteBarangay(barangayId) {
  const data = await invokeBarangays({
    action: "deleteBarangay",
    barangayId,
  });
  return mapBarangay(data.barangay);
}

export async function restoreBarangay(barangayId) {
  const data = await invokeBarangays({
    action: "restoreBarangay",
    barangayId,
  });
  return mapBarangay(data.barangay);
}

/**
 * @param {{ id: string, name: string, isActive?: boolean, voterCount?: number }[]} barangays
 */
export function buildBarangayCatalog(barangays) {
  const list = [...barangays].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" })
  );
  const activeList = list.filter((b) => b.isActive !== false);
  const byId = new Map(list.map((b) => [b.id, b]));
  const byName = new Map();
  for (const barangay of activeList) {
    byName.set(barangay.name, barangay);
    const lower = barangay.name.toLowerCase();
    if (!byName.has(lower)) byName.set(lower, barangay);
  }
  const nameSet = new Set(activeList.map((b) => b.name));
  const idSet = new Set(list.map((b) => b.id));
  const activeIdSet = new Set(activeList.map((b) => b.id));
  return { list, activeList, byId, byName, nameSet, idSet, activeIdSet };
}

/**
 * @param {string} raw
 * @param {Set<string>} barangayNameSet
 */
export function resolveBarangayName(raw, barangayNameSet) {
  const trimmed = normalizeBarangayName(raw);
  if (!trimmed) return "";
  if (barangayNameSet.has(trimmed)) return trimmed;
  const alias = BARANGAY_NAME_ALIASES.get(trimmed.toLowerCase());
  if (alias && barangayNameSet.has(alias)) return alias;
  const needle = trimmed.toLowerCase();
  for (const name of barangayNameSet) {
    if (name.toLowerCase() === needle) return name;
  }
  return trimmed;
}

/**
 * @param {string} name
 * @param {Map<string, { id: string, name: string }>} barangaysByName
 */
export function barangayIdForName(name, barangaysByName) {
  if (!name) return "";
  return barangaysByName.get(name)?.id ?? barangaysByName.get(name.toLowerCase())?.id ?? "";
}
