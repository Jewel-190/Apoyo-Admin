/**
 * Attachment field labels and display order from `assistance_requirements` (per service).
 */

function sortBySortOrder(rows) {
  return [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Normalize catalog slot_key / DB file_type to a stable field key (e.g. letter_file). */
export function normalizeAttachmentFieldKey(raw) {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");

  if (!value) {
    return "";
  }

  if (value.endsWith("_file")) {
    return value;
  }

  if (value === "attachment" || value === "attachments") {
    return "attachment_file";
  }

  return `${value}_file`;
}

function humanizeFieldKey(fieldKey) {
  return String(fieldKey || "")
    .replace(/_file$/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {Array<{ id?: string, assistance_requirements?: Array<{ slot_key?: string, title?: string, sort_order?: number }> }>} services
 */
export function buildAttachmentCatalogMaps(services) {
  const labelsByServiceId = {};
  const orderByServiceId = {};
  const globalLabels = {};

  for (const svc of services ?? []) {
    const serviceId = String(svc.id ?? "").trim();
    if (!serviceId) {
      continue;
    }

    const labels = {};
    const order = [];

    for (const req of sortBySortOrder(svc.assistance_requirements)) {
      const fieldKey = normalizeAttachmentFieldKey(req.slot_key);
      if (!fieldKey) {
        continue;
      }
      const label = String(req.title ?? "").trim() || humanizeFieldKey(fieldKey);
      labels[fieldKey] = label;
      order.push(fieldKey);
      if (!globalLabels[fieldKey]) {
        globalLabels[fieldKey] = label;
      }
    }

    labelsByServiceId[serviceId] = labels;
    orderByServiceId[serviceId] = order;
  }

  return { labelsByServiceId, orderByServiceId, globalLabels };
}

export function resolveAttachmentLabelFromCatalog(catalog, serviceId, fieldKey, fallbackName = "") {
  const key = normalizeAttachmentFieldKey(fieldKey);
  if (!key) {
    return fallbackName || "Attachment";
  }

  const byService = catalog?.labelsByServiceId?.[serviceId]?.[key];
  if (byService) {
    return byService;
  }

  const global = catalog?.globalLabels?.[key];
  if (global) {
    return global;
  }

  return fallbackName || humanizeFieldKey(key);
}

export function attachmentHierarchyRank(catalog, serviceId, fieldKey, label) {
  if (fieldKey === "attachment_file" || /attachments?\s*\(optional\)/i.test(String(label || ""))) {
    return 999;
  }

  const order = catalog?.orderByServiceId?.[serviceId] ?? [];
  const key = normalizeAttachmentFieldKey(fieldKey);
  const idx = order.indexOf(key);
  return idx >= 0 ? idx : 500;
}
