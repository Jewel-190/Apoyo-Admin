/**
 * Interview scheduling briefing (Admin → For Approval → Scheduling).
 *
 * Stored as: scope=admin key=interview-scheduling visibility=authenticated
 * (signed-in applicants can read; only superadmin writes).
 * The Application Number step is locked: always present, never removable.
 */

import { invalidateSettingsCache } from "./settingsStore";
import { upsertPlatformSetting } from "./superAdminSettingsApi";

export const INTERVIEW_SCHEDULING_SCOPE = "admin";
export const INTERVIEW_SCHEDULING_KEY = "interview-scheduling";
export const APPLICATION_NUMBER_STEP_ID = "application-number";
export const STEP_KIND_TEXT = "text";
export const STEP_KIND_APPLICATION_NUMBER = "application_number";

export const INTERVIEW_SCHEDULING_SAMPLE_APPLICATION_NUMBER = "APP-SAMPLE-0001";

const MAX_STEPS = 10;
const MAX_TITLE = 80;
const MAX_SUBTITLE = 80;
const MAX_DAYS = 80;
const MAX_BODY = 400;

export const INTERVIEW_SCHEDULING_DEFAULTS = Object.freeze({
  title: "Instructions",
  subtitle: "Applicant briefing",
  officeHours: Object.freeze({
    days: "Monday - Friday",
    start: "08:00",
    end: "17:00",
  }),
  steps: Object.freeze([
    Object.freeze({
      id: "step-visit",
      kind: STEP_KIND_TEXT,
      body: "Visit the Socio-Economic and Multi-Purpose Building Barangay Burol Main, City of Dasmariñas, Cavite",
    }),
    Object.freeze({
      id: APPLICATION_NUMBER_STEP_ID,
      kind: STEP_KIND_APPLICATION_NUMBER,
      body: "Present your Application Number:",
    }),
    Object.freeze({
      id: "step-valid-id",
      kind: STEP_KIND_TEXT,
      body: "Bring one (1) Original Valid ID for verification.",
    }),
  ]),
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clip(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clipBody(value, max) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function newStepId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Accepts "08:00", "8:00", or "08:00:00"; returns "HH:MM" or "". */
export function normalizeTimeHm(value) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime12h(value) {
  const hm = normalizeTimeHm(value);
  if (!hm) return "";
  const [hourRaw, minute] = hm.split(":").map(Number);
  const suffix = hourRaw >= 12 ? "PM" : "AM";
  const hour = hourRaw % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function formatOfficeHoursLabel(config) {
  const hours = config?.officeHours || INTERVIEW_SCHEDULING_DEFAULTS.officeHours;
  const days = clip(hours.days, MAX_DAYS) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.days;
  const start = formatTime12h(hours.start) || formatTime12h(INTERVIEW_SCHEDULING_DEFAULTS.officeHours.start);
  const end = formatTime12h(hours.end) || formatTime12h(INTERVIEW_SCHEDULING_DEFAULTS.officeHours.end);
  return `Office Hours: ${days}, ${start} to ${end}.`;
}

function defaultLockedStep() {
  return {
    id: APPLICATION_NUMBER_STEP_ID,
    kind: STEP_KIND_APPLICATION_NUMBER,
    body: INTERVIEW_SCHEDULING_DEFAULTS.steps[1].body,
  };
}

function normalizeStep(step) {
  const src = isPlainObject(step) ? step : {};
  const kind =
    src.kind === STEP_KIND_APPLICATION_NUMBER || src.id === APPLICATION_NUMBER_STEP_ID
      ? STEP_KIND_APPLICATION_NUMBER
      : STEP_KIND_TEXT;
  if (kind === STEP_KIND_APPLICATION_NUMBER) {
    return {
      id: APPLICATION_NUMBER_STEP_ID,
      kind: STEP_KIND_APPLICATION_NUMBER,
      body: clipBody(src.body, MAX_BODY) || defaultLockedStep().body,
    };
  }
  return {
    id: String(src.id || "").trim() || newStepId(),
    kind: STEP_KIND_TEXT,
    body: clipBody(src.body, MAX_BODY),
  };
}

function ensureApplicationNumberStep(steps) {
  const normalized = [];
  let locked = null;
  for (const step of steps) {
    const next = normalizeStep(step);
    if (next.kind === STEP_KIND_APPLICATION_NUMBER) {
      if (locked) continue;
      locked = next;
      normalized.push(next);
      continue;
    }
    normalized.push(next);
  }
  if (!locked) {
    const insertAt = Math.min(1, normalized.length);
    normalized.splice(insertAt, 0, defaultLockedStep());
  }
  while (normalized.length > MAX_STEPS) {
    const dropIndex = [...normalized]
      .map((step, index) => ({ step, index }))
      .reverse()
      .find((entry) => entry.step.kind === STEP_KIND_TEXT)?.index;
    if (dropIndex == null) break;
    normalized.splice(dropIndex, 1);
  }
  return normalized;
}

export function createInterviewTextStep() {
  return {
    id: newStepId(),
    kind: STEP_KIND_TEXT,
    body: "",
  };
}

export function isApplicationNumberStep(step) {
  return step?.kind === STEP_KIND_APPLICATION_NUMBER || step?.id === APPLICATION_NUMBER_STEP_ID;
}

export function normalizeInterviewScheduling(value) {
  const src = isPlainObject(value) ? value : {};
  const hoursSrc = isPlainObject(src.officeHours) ? src.officeHours : {};
  const rawSteps = Array.isArray(src.steps) ? src.steps : INTERVIEW_SCHEDULING_DEFAULTS.steps;
  return {
    title: clip(src.title, MAX_TITLE) || INTERVIEW_SCHEDULING_DEFAULTS.title,
    subtitle: clip(src.subtitle, MAX_SUBTITLE) || INTERVIEW_SCHEDULING_DEFAULTS.subtitle,
    officeHours: {
      days: clip(hoursSrc.days, MAX_DAYS) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.days,
      start: normalizeTimeHm(hoursSrc.start) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.start,
      end: normalizeTimeHm(hoursSrc.end) || INTERVIEW_SCHEDULING_DEFAULTS.officeHours.end,
    },
    steps: ensureApplicationNumberStep(rawSteps),
  };
}

export function validateInterviewScheduling(value) {
  const next = normalizeInterviewScheduling(value);
  if (next.officeHours.start >= next.officeHours.end) {
    return "Office end time must be after the start time.";
  }
  if (!next.steps.some(isApplicationNumberStep)) {
    return "The Application Number step cannot be removed.";
  }
  if (next.steps.some((step) => step.kind === STEP_KIND_TEXT && !step.body)) {
    return "Each instruction step needs a description.";
  }
  return "";
}

export function moveInterviewStep(steps, index, direction) {
  const list = [...steps];
  const target = index + direction;
  if (index < 0 || target < 0 || index >= list.length || target >= list.length) return list;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  return ensureApplicationNumberStep(list);
}

export function removeInterviewStep(steps, index) {
  const current = steps[index];
  if (!current || isApplicationNumberStep(current)) return steps;
  return ensureApplicationNumberStep(steps.filter((_, i) => i !== index));
}

export function addInterviewStep(steps) {
  if (steps.length >= MAX_STEPS) return steps;
  return ensureApplicationNumberStep([...steps, createInterviewTextStep()]);
}

export async function saveInterviewScheduling(value) {
  const next = normalizeInterviewScheduling(value);
  const invalid = validateInterviewScheduling(next);
  if (invalid) throw new Error(invalid);
  const result = await upsertPlatformSetting({
    scope: INTERVIEW_SCHEDULING_SCOPE,
    key: INTERVIEW_SCHEDULING_KEY,
    value: next,
    description: "Interview scheduling briefing shown in Admin For Approval → Scheduling and on the applicant app.",
    visibility: "authenticated",
  });
  invalidateSettingsCache(INTERVIEW_SCHEDULING_SCOPE);
  return {
    value: normalizeInterviewScheduling(result?.setting?.value ?? next),
    version: result?.setting?.version ?? null,
  };
}
