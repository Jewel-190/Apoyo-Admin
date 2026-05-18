/** yyyy-mm-dd in the browser's local calendar (for `<input type="date" min="...">`). */
export function todayYmdLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Combine HTML date (yyyy-mm-dd) and time (HH:mm) in the browser's local timezone
 * and return an ISO-8601 string suitable for Postgres timestamptz via Supabase.
 */
export function localDateAndTimeToIso(dateYmd, timeHm) {
  const dPart = String(dateYmd || "").trim();
  const tPart = String(timeHm || "").trim();
  if (!dPart || !tPart) return null;

  const normalizedTime = tPart.length === 5 ? `${tPart}:00` : tPart;
  const parsed = new Date(`${dPart}T${normalizedTime}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Display timestamptz / ISO strings for interview scheduling (Philippines-style locale OK via browser). */
export function formatCaseStudyDateTimeDisplay(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
