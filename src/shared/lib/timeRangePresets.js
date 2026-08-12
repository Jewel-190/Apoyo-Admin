/**
 * Shared time-range presets for admin list pages (Activity Logs–style chips).
 * Bounds use UTC calendar day/week/month to match admin-activity-logs.
 */

export const TIME_PRESET_OPTIONS = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

const PRESET_RANGE_LABELS = {
  day: "Today",
  week: "This Week",
  month: "This Month",
  all_time: "All Time",
};

export function formatUtcDateInput(date) {
  return date.toISOString().slice(0, 10);
}

export function buildDefaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(to.getUTCDate() - 29);
  return {
    from: formatUtcDateInput(from),
    to: formatUtcDateInput(to),
  };
}

function startOfUtcDay(date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function endOfUtcDay(date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

function startOfUtcWeek(date) {
  const day = startOfUtcDay(date);
  // Monday-start week (ISO), matching admin-activity-logs
  const weekday = day.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  day.setUTCDate(day.getUTCDate() - daysFromMonday);
  return day;
}

function startOfUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseUtcDateOnly(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function formatUtcDateLabel(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * @param {"day"|"week"|"month"|"all_time"|"custom"} preset
 * @param {string|null} [customFrom] YYYY-MM-DD when preset is custom
 * @param {string|null} [customTo] YYYY-MM-DD when preset is custom
 * @returns {{ preset: string, from: string|null, to: string|null, label: string }}
 */
export function resolveTimeRangePreset(preset, customFrom = null, customTo = null) {
  const key = String(preset || "day").trim().toLowerCase();
  const now = new Date();
  const todayEnd = endOfUtcDay(now);

  if (key === "all_time") {
    return {
      preset: "all_time",
      from: null,
      to: null,
      label: PRESET_RANGE_LABELS.all_time,
    };
  }

  if (key === "custom") {
    const from = parseUtcDateOnly(customFrom);
    const to = parseUtcDateOnly(customTo);
    if (!from || !to) {
      throw new Error("Select both a start and end date.");
    }
    const toEnd = endOfUtcDay(to);
    if (from.getTime() > toEnd.getTime()) {
      throw new Error("Start date must be on or before end date.");
    }
    return {
      preset: "custom",
      from: from.toISOString(),
      to: toEnd.toISOString(),
      label: `${formatUtcDateLabel(from)} – ${formatUtcDateLabel(to)}`,
    };
  }

  if (key === "week") {
    const from = startOfUtcWeek(now);
    return {
      preset: "week",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_RANGE_LABELS.week} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (key === "month") {
    const from = startOfUtcMonth(now);
    return {
      preset: "month",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `${PRESET_RANGE_LABELS.month} · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  const from = startOfUtcDay(now);
  return {
    preset: "day",
    from: from.toISOString(),
    to: todayEnd.toISOString(),
    label: `${PRESET_RANGE_LABELS.day} · ${formatUtcDateLabel(from)}`,
  };
}
