import { formatDate } from "./requestData";

function buildApplicationDateSearchText(app) {
  const raw = app?.submittedAt || app?.createdAt || null;
  const parts = [app?.date];

  if (!raw) {
    return parts.filter(Boolean).join(" ");
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return parts.filter(Boolean).join(" ");
  }

  parts.push(
    formatDate(raw),
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    date.toISOString().slice(0, 10),
    `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
  );

  return parts.filter(Boolean).join(" ");
}

/**
 * Lightweight client-side search for small pipeline queues.
 * Matches application ID, applicant name, category, status, and application date.
 */
export function matchesPipelineApplicationSearch(app, searchTerm) {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    app?.id,
    app?.requestCode,
    app?.requestId,
    app?.name,
    app?.category,
    app?.status,
    buildApplicationDateSearchText(app),
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(query);
}

export const PIPELINE_SEARCH_PLACEHOLDER = "Search name, application ID, or date";
