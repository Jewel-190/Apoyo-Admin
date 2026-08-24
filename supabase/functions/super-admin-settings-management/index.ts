import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

/**
 * POST /functions/v1/super-admin-settings-management
 *
 * Superadmin platform settings CRUD against public.settings.
 * Auth: JWT user must pass is_superadmin().
 *
 * Actions:
 *  - listSettings
 *  - getSetting
 *  - upsertSetting
 *  - deleteSetting   (soft by default; hardDelete=true for hard remove)
 *  - resetSetting
 *  - listScopes
 */

const SETTINGS_SELECT =
  "id, scope, key, value, description, visibility, is_secret, is_active, version, metadata, created_at, created_by, updated_at, updated_by";

const SETTINGS_SCOPES = ["system", "admin", "user"] as const;
const VISIBILITY_VALUES = ["public", "authenticated", "admin", "superadmin"] as const;

type Scope = (typeof SETTINGS_SCOPES)[number];
type Visibility = (typeof VISIBILITY_VALUES)[number];

type Payload = {
  action?: string;
  scope?: string;
  key?: string;
  value?: unknown;
  description?: string | null;
  visibility?: string;
  isSecret?: boolean;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  expectedVersion?: number;
  hardDelete?: boolean;
};

/** Canonical defaults — keep in sync with src/shared/lib/settingsStore.js */
const SETTINGS_DEFAULTS: Record<Scope, Record<string, Record<string, unknown>>> = {
  system: {
    "logo-and-banner": {
      dasma_logo_url: "",
      dasma_banner_url: "",
    },
    "system-theme": {
      primary_color: "#0b8f8b",
    },
    legal: {
      "terms-and-conditions": { sections: [] },
      "user-acceptance": { sections: [] },
    },
  },
  admin: {
    "interview-scheduling": {
      title: "Instructions",
      subtitle: "Applicant briefing",
      officeHours: {
        days: "Monday - Friday",
        start: "08:00",
        end: "17:00",
      },
      steps: [
        {
          id: "step-visit",
          kind: "text",
          body: "Visit the Socio-Economic and Multi-Purpose Building Barangay Burol Main, City of Dasmariñas, Cavite",
        },
        {
          id: "application-number",
          kind: "application_number",
          body: "Present your Application Number:",
        },
        {
          id: "step-valid-id",
          kind: "text",
          body: "Bring one (1) Original Valid ID for verification.",
        },
      ],
    },
  },
  user: {},
};

const DEFAULT_VISIBILITY: Record<Scope, Visibility> = {
  system: "authenticated",
  admin: "admin",
  user: "authenticated",
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message || "");
  }
  return String(error ?? "");
}

async function ensureSuperAdminCaller(
  supabase: ReturnType<typeof getServiceClient>,
  callerUserId: string
) {
  const { data, error } = await supabase.rpc("is_superadmin", { uid: callerUserId });
  if (error) throw error;
  if (data !== true) {
    return { ok: false as const, response: jsonResponse({ error: "Forbidden" }, 403) };
  }
  return { ok: true as const };
}

function assertScope(value: unknown): Scope {
  const scope = String(value ?? "").trim();
  if (!(SETTINGS_SCOPES as readonly string[]).includes(scope)) {
    throw new Error(`Invalid scope. Expected one of: ${SETTINGS_SCOPES.join(", ")}.`);
  }
  return scope as Scope;
}

function assertKey(value: unknown): string {
  const key = String(value ?? "").trim();
  if (!key) throw new Error("A settings key (group id) is required.");
  if (key.length > 128) throw new Error("Settings key is too long.");
  return key;
}

function assertVisibility(value: unknown, fallback: Visibility): Visibility {
  if (value == null || value === "") return fallback;
  const visibility = String(value).trim();
  if (!(VISIBILITY_VALUES as readonly string[]).includes(visibility)) {
    throw new Error(
      `Invalid visibility. Expected one of: ${VISIBILITY_VALUES.join(", ")}.`
    );
  }
  return visibility as Visibility;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const LEGAL_PAGE_SLUGS = ["terms-and-conditions", "user-acceptance"] as const;

function mapLegalSections(raw: unknown): { heading: string; body: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((section) => {
    const item = isPlainObject(section) ? section : {};
    return {
      heading: String(item.heading ?? ""),
      body: String(item.body ?? ""),
    };
  });
}

function legalPageSectionsFrom(value: unknown, slug: string): { heading: string; body: string }[] {
  const src = isPlainObject(value) ? value : {};
  const named = isPlainObject(src[slug]) ? src[slug] : null;
  if (named && Array.isArray(named.sections)) return mapLegalSections(named.sections);
  if (Array.isArray(src.pages) && src.pages.length) {
    const pages = src.pages.filter(isPlainObject);
    const match = pages.find((page) => {
      const pageSlug = String(page.slug ?? "").trim().toLowerCase();
      const title = String(page.title ?? "").trim().toLowerCase();
      if (pageSlug === slug) return true;
      if (slug === "terms-and-conditions") {
        return pageSlug === "legal" || pageSlug === "terms" || title.includes("terms");
      }
      if (slug === "user-acceptance") {
        return title.includes("user acceptance") || title.includes("acceptance");
      }
      return false;
    });
    if (match && Array.isArray(match.sections)) return mapLegalSections(match.sections);
  }
  if (slug === "terms-and-conditions") {
    if (Array.isArray(src.sections)) return mapLegalSections(src.sections);
    if (isPlainObject(src.terms) && Array.isArray(src.terms.sections)) {
      return mapLegalSections(src.terms.sections);
    }
  }
  if (slug === "user-acceptance" && isPlainObject(src.userAcceptance) && Array.isArray(src.userAcceptance.sections)) {
    return mapLegalSections(src.userAcceptance.sections);
  }
  return [];
}

const INTERVIEW_SCHEDULING_MAX_STEPS = 10;
const APPLICATION_NUMBER_STEP_ID = "application-number";

function clipSettingText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function clipSettingMultiline(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function normalizeTimeHm(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function canonicalizeInterviewScheduling(value: unknown) {
  const defaults = SETTINGS_DEFAULTS.admin["interview-scheduling"] as {
    title: string;
    subtitle: string;
    officeHours: { days: string; start: string; end: string };
    steps: Array<{ id: string; kind: string; body: string }>;
  };
  const src = isPlainObject(value) ? value : {};
  const hoursSrc = isPlainObject(src.officeHours) ? src.officeHours : {};
  const rawSteps = Array.isArray(src.steps) ? src.steps : defaults.steps;
  const steps: Array<{ id: string; kind: string; body: string }> = [];
  let locked: { id: string; kind: string; body: string } | null = null;
  for (const raw of rawSteps) {
    const item = isPlainObject(raw) ? raw : {};
    const isLocked =
      String(item.kind ?? "") === "application_number" ||
      String(item.id ?? "") === APPLICATION_NUMBER_STEP_ID;
    if (isLocked) {
      if (locked) continue;
      locked = {
        id: APPLICATION_NUMBER_STEP_ID,
        kind: "application_number",
        body:
          clipSettingMultiline(item.body, 400) ||
          String(defaults.steps[1]?.body ?? "Present your Application Number:"),
      };
      steps.push(locked);
      continue;
    }
    steps.push({
      id: clipSettingText(item.id, 80) || `step-${steps.length + 1}`,
      kind: "text",
      body: clipSettingMultiline(item.body, 400),
    });
  }
  if (!locked) {
    const insertAt = Math.min(1, steps.length);
    steps.splice(insertAt, 0, {
      id: APPLICATION_NUMBER_STEP_ID,
      kind: "application_number",
      body: String(defaults.steps[1]?.body ?? "Present your Application Number:"),
    });
  }
  while (steps.length > INTERVIEW_SCHEDULING_MAX_STEPS) {
    const dropIndex = [...steps]
      .map((step, index) => ({ step, index }))
      .reverse()
      .find((entry) => entry.step.kind === "text")?.index;
    if (dropIndex == null) break;
    steps.splice(dropIndex, 1);
  }
  const start = normalizeTimeHm(hoursSrc.start) || defaults.officeHours.start;
  const end = normalizeTimeHm(hoursSrc.end) || defaults.officeHours.end;
  const hoursValid = end > start;
  return {
    title: clipSettingText(src.title, 80) || defaults.title,
    subtitle: clipSettingText(src.subtitle, 80) || defaults.subtitle,
    officeHours: {
      days: clipSettingText(hoursSrc.days, 80) || defaults.officeHours.days,
      start: hoursValid ? start : defaults.officeHours.start,
      end: hoursValid ? end : defaults.officeHours.end,
    },
    steps,
  };
}

/** Drop identity fields for Legal. Only section copy per hardcoded page is stored. */
function canonicalizeSettingValue(scope: string, key: string, value: unknown) {
  if (scope === "system" && key === "legal") {
    const next: Record<string, { sections: { heading: string; body: string }[] }> = {};
    for (const slug of LEGAL_PAGE_SLUGS) {
      next[slug] = { sections: legalPageSectionsFrom(value, slug) };
    }
    return next;
  }
  if (scope === "admin" && key === "interview-scheduling") {
    return canonicalizeInterviewScheduling(value);
  }
  return value;
}

function mapSettingRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  return {
    id: row.id,
    scope: row.scope,
    key: row.key,
    value: row.value ?? {},
    description: row.description ?? null,
    visibility: row.visibility,
    isSecret: Boolean(row.is_secret),
    isActive: row.is_active !== false,
    version: Number(row.version || 1),
    metadata: row.metadata ?? {},
    createdAt: row.created_at ?? null,
    createdBy: row.created_by ?? null,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

function listScopesPayload() {
  return SETTINGS_SCOPES.map((scope) => ({
    scope,
    defaultVisibility: DEFAULT_VISIBILITY[scope],
    groups: Object.keys(SETTINGS_DEFAULTS[scope]).map((key) => ({
      key,
      defaultValue: SETTINGS_DEFAULTS[scope][key],
    })),
  }));
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getServiceClient();

    const auth = await authorizeRequest(req, supabase);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    if (auth.viaSecret || !auth.userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const superAdminCheck = await ensureSuperAdminCaller(supabase, auth.userId);
    if (!superAdminCheck.ok) {
      return superAdminCheck.response;
    }

    let body: Payload;
    try {
      body = (await req.json()) as Payload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = String(body.action ?? "").trim();

    if (action === "listScopes") {
      return jsonResponse({
        success: true,
        action,
        scopes: listScopesPayload(),
      });
    }

    if (action === "listSettings") {
      // deno-lint-ignore no-explicit-any
      let query: any = supabase
        .from("settings")
        .select(SETTINGS_SELECT)
        .order("scope", { ascending: true })
        .order("key", { ascending: true });

      if (body.scope) {
        query = query.eq("scope", assertScope(body.scope));
      }
      if (body.key) {
        query = query.eq("key", assertKey(body.key));
      }
      if (typeof body.isActive === "boolean") {
        query = query.eq("is_active", body.isActive);
      }

      const { data, error } = await query;
      if (error) throw error;

      return jsonResponse({
        success: true,
        action,
        settings: (data || []).map((row: Record<string, unknown>) => mapSettingRow(row)),
        total: (data || []).length,
      });
    }

    if (action === "getSetting") {
      const scope = assertScope(body.scope);
      const key = assertKey(body.key);
      const { data, error } = await supabase
        .from("settings")
        .select(SETTINGS_SELECT)
        .eq("scope", scope)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return jsonResponse(
          {
            success: true,
            action,
            setting: null,
            defaultValue: SETTINGS_DEFAULTS[scope][key] ?? null,
          },
          200
        );
      }
      return jsonResponse({
        success: true,
        action,
        setting: mapSettingRow(data as Record<string, unknown>),
        defaultValue: SETTINGS_DEFAULTS[scope][key] ?? null,
      });
    }

    if (action === "upsertSetting") {
      const scope = assertScope(body.scope);
      const key = assertKey(body.key);
      if (body.value === undefined) {
        return jsonResponse({ success: false, error: "value is required." }, 400);
      }
      if (!isPlainObject(body.value) && body.value !== null) {
        // Allow arrays/scalars for versatility, but prefer objects for groups.
        // No hard reject — store as-is in jsonb.
      }

      const value = canonicalizeSettingValue(scope, key, body.value);
      let visibility = assertVisibility(body.visibility, DEFAULT_VISIBILITY[scope]);
      if (scope === "admin" && key === "interview-scheduling") {
        visibility = "authenticated";
      }
      const metadata = isPlainObject(body.metadata) ? body.metadata : {};

      const { data: existing, error: existingError } = await supabase
        .from("settings")
        .select("id, version")
        .eq("scope", scope)
        .eq("key", key)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing) {
        if (
          body.expectedVersion != null &&
          Number(existing.version) !== Number(body.expectedVersion)
        ) {
          return jsonResponse(
            {
              success: false,
              error: `Version conflict. Expected ${body.expectedVersion}, found ${existing.version}.`,
            },
            409
          );
        }

        const patch: Record<string, unknown> = {
          value,
          version: Number(existing.version || 1) + 1,
          is_active: body.isActive !== false,
          visibility,
          is_secret: Boolean(body.isSecret),
          metadata,
        };
        if (body.description !== undefined) {
          patch.description = body.description;
        }

        const { data, error } = await supabase
          .from("settings")
          .update(patch)
          .eq("id", existing.id)
          .select(SETTINGS_SELECT)
          .maybeSingle();
        if (error) throw error;

        return jsonResponse({
          success: true,
          action,
          setting: mapSettingRow(data as Record<string, unknown>),
        });
      }

      const insertRow: Record<string, unknown> = {
        scope,
        key,
        value: value ?? {},
        description: body.description ?? null,
        visibility,
        is_secret: Boolean(body.isSecret),
        is_active: body.isActive !== false,
        version: 1,
        metadata,
        created_by: auth.userId,
      };

      const { data, error } = await supabase
        .from("settings")
        .insert(insertRow)
        .select(SETTINGS_SELECT)
        .maybeSingle();
      if (error) throw error;

      return jsonResponse({
        success: true,
        action,
        setting: mapSettingRow(data as Record<string, unknown>),
      });
    }

    if (action === "deleteSetting") {
      const scope = assertScope(body.scope);
      const key = assertKey(body.key);
      const hardDelete = Boolean(body.hardDelete);

      const { data: existing, error: findError } = await supabase
        .from("settings")
        .select("id, version")
        .eq("scope", scope)
        .eq("key", key)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) {
        return jsonResponse({ success: false, error: "Setting not found." }, 404);
      }

      if (hardDelete) {
        const { data, error } = await supabase
          .from("settings")
          .delete()
          .eq("id", existing.id)
          .select(SETTINGS_SELECT)
          .maybeSingle();
        if (error) throw error;
        return jsonResponse({
          success: true,
          action,
          deleted: true,
          hardDelete: true,
          setting: mapSettingRow(data as Record<string, unknown>),
        });
      }

      const { data, error } = await supabase
        .from("settings")
        .update({
          is_active: false,
          version: Number(existing.version || 1) + 1,
        })
        .eq("id", existing.id)
        .select(SETTINGS_SELECT)
        .maybeSingle();
      if (error) throw error;

      return jsonResponse({
        success: true,
        action,
        deleted: true,
        hardDelete: false,
        setting: mapSettingRow(data as Record<string, unknown>),
      });
    }

    if (action === "resetSetting") {
      const scope = assertScope(body.scope);
      const key = assertKey(body.key);
      const defaultValue = SETTINGS_DEFAULTS[scope][key];
      if (defaultValue === undefined) {
        return jsonResponse(
          {
            success: false,
            error: `No canonical default for ${scope}.${key}.`,
          },
          400
        );
      }

      const visibility = assertVisibility(body.visibility, DEFAULT_VISIBILITY[scope]);
      const { data: existing, error: existingError } = await supabase
        .from("settings")
        .select("id, version")
        .eq("scope", scope)
        .eq("key", key)
        .maybeSingle();
      if (existingError) throw existingError;

      if (existing) {
        const { data, error } = await supabase
          .from("settings")
          .update({
            value: defaultValue,
            is_active: true,
            is_secret: false,
            visibility,
            version: Number(existing.version || 1) + 1,
          })
          .eq("id", existing.id)
          .select(SETTINGS_SELECT)
          .maybeSingle();
        if (error) throw error;
        return jsonResponse({
          success: true,
          action,
          setting: mapSettingRow(data as Record<string, unknown>),
          reset: true,
        });
      }

      const { data, error } = await supabase
        .from("settings")
        .insert({
          scope,
          key,
          value: defaultValue,
          visibility,
          is_secret: false,
          is_active: true,
          version: 1,
          metadata: {},
          created_by: auth.userId,
        })
        .select(SETTINGS_SELECT)
        .maybeSingle();
      if (error) throw error;

      return jsonResponse({
        success: true,
        action,
        setting: mapSettingRow(data as Record<string, unknown>),
        reset: true,
      });
    }

    return jsonResponse(
      {
        error:
          "Invalid action. Use listSettings, getSetting, upsertSetting, deleteSetting, resetSetting, or listScopes.",
      },
      400
    );
  } catch (error) {
    const message = errorMessage(error) || "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
