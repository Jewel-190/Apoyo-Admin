/**
 * Temporary client-side patches for For Approval flows (e.g. until reload syncs).
 * DB truth for interviews: status `scheduled` + column case_study_date — Case Study module reads those.
 * Keyed by merged row `key`
 * (see fetchApplicationsBySources).
 */
const STORAGE_KEY = "apoyo_admin_for_approval_row_overrides_v1";

export function readOverrideMap() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOverrideMap(map) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function patchRowOverride(rowKey, partial) {
  const map = readOverrideMap();
  map[rowKey] = { ...(map[rowKey] || {}), ...partial };
  writeOverrideMap(map);
}

export function mergeRequestRow(row) {
  const extra = readOverrideMap()[row.key];
  return extra ? { ...row, ...extra } : row;
}
