/** Shared helpers for read-only request / applicant detail panels (Review UI parity). */

export function formatDateLong(dateValue) {
  if (!dateValue) {
    return "N/A";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "N/A";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function getFirstValue(record, fields, fallback = "N/A") {
  if (!record || typeof record !== "object") {
    return fallback;
  }

  for (const field of fields) {
    const value = record[field];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return fallback;
}

export function buildDisplayName(user, fallbackName = "Unknown Applicant") {
  if (!user) {
    return fallbackName;
  }

  const nameParts = [
    user.first_name,
    user.middle_name,
    user.last_name,
    user.suffix,
  ].filter((part) => part && String(part).trim() !== "");

  return nameParts.length > 0 ? nameParts.join(" ") : fallbackName;
}

export function resolveAdditionalInfoText(requestData) {
  const value = getFirstValue(
    requestData,
    [
      "additional_info",
      "additional_information",
      "other_info",
      "other_information",
      "remarks",
      "notes",
      "note",
      "comment",
      "comments",
      "description",
      "details",
      "message",
    ],
    ""
  );

  const text = typeof value === "string" ? value.trim() : String(value || "").trim();
  return text || "No additional info provided.";
}

function formatCoverageLabel(rawLabel) {
  const normalized = String(rawLabel || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return "Coverage";
  }

  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function splitCoverageTextEntries(text) {
  const lines = String(text || "")
    .split(/\r?\n|;+|\|+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (
    lines.length === 1 &&
    lines[0].includes(":") &&
    lines[0].includes(",")
  ) {
    return lines[0]
      .split(/,(?=[^,]+:)/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return lines;
}

function normalizeCoverageRows(value) {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeCoverageRows(item));
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, rowValue]) => {
        const normalizedValue =
          rowValue === null || rowValue === undefined
            ? ""
            : typeof rowValue === "string"
              ? rowValue.trim()
              : String(rowValue).trim();

        if (!normalizedValue) {
          return null;
        }

        return {
          label: formatCoverageLabel(key),
          value: normalizedValue,
        };
      })
      .filter(Boolean);
  }

  const text = String(value).trim();
  if (!text) {
    return [];
  }

  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    try {
      return normalizeCoverageRows(JSON.parse(text));
    } catch {
      // Fallback to plain text parsing.
    }
  }

  return splitCoverageTextEntries(text)
    .map((entry, index) => {
      const separatorIndex = entry.indexOf(":");

      if (separatorIndex === -1) {
        return {
          label: index === 0 ? "Coverage" : `Coverage ${index + 1}`,
          value: entry,
        };
      }

      const label = entry.slice(0, separatorIndex).trim();
      const rowValue = entry.slice(separatorIndex + 1).trim();

      if (!rowValue) {
        return null;
      }

      return {
        label: formatCoverageLabel(label),
        value: rowValue,
      };
    })
    .filter(Boolean);
}

export function resolveCoverageRows(requestData) {
  const rawCoverage = getFirstValue(
    requestData,
    ["coverage", "coverage_info", "coverage_details"],
    ""
  );

  return normalizeCoverageRows(rawCoverage);
}
