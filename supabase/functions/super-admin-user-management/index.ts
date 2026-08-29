import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { AUDIT_MODULES, createAuditor, formatPersonAuditLabel } from "../_shared/auditTrail.ts";
import { normalizePhMobile, phoneValidationMessage } from "../_shared/phMobile.ts";

/**
 * POST /functions/v1/super-admin-user-management
 *
 * Superadmin applicant-user directory, profile edit, Auth disable/enable,
 * and request pipeline detail. No new tables — uses public.users + Auth Admin
 * + assistance_requests.
 *
 * Auth: JWT user must pass is_superadmin().
 *
 * Actions:
 *  - listUsers
 *  - getUser
 *  - updateUser
 *  - setUserDisabled
 *  - exportUsers
 */

/** Prefer star so we don't fail when optional profile columns differ by schema. */
const USER_SELECT = "*";
const USER_SELECT_MINIMAL = "id, first_name, middle_name, last_name, suffix, sex";

const USER_UPDATE_ALLOWLIST = new Set([
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "sex",
  "birth_date",
  "email",
  "contact_number",
  "address",
  "barangay",
  "voter_id_number",
]);

function isUniqueViolation(error: unknown) {
  const err = error as { code?: string; message?: string };
  return err?.code === "23505" || /duplicate|unique/i.test(String(err?.message ?? ""));
}

const VOTER_ID_PATTERN = /^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$/;

function formatVoterId(value: unknown) {
  const raw = String(value ?? "")
    .replace(/[^0-9A-Za-z]/gi, "")
    .toUpperCase()
    .slice(0, 23);
  if (raw.length <= 4) return raw;
  if (raw.length <= 9) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  if (raw.length <= 22) return `${raw.slice(0, 4)}-${raw.slice(4, 9)}-${raw.slice(9)}`;
  return `${raw.slice(0, 4)}-${raw.slice(4, 9)}-${raw.slice(9, 22)}-${raw.slice(22)}`;
}

function normalizeProfileVoterId(value: unknown) {
  const formatted = formatVoterId(value);
  if (!formatted) return null;
  if (!VOTER_ID_PATTERN.test(formatted)) {
    throw new Error("VIN must use format 0000-00000-0000000000000-0.");
  }
  return formatted;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message || "");
  }
  return String(error ?? "");
}

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;
const EXPORT_CAP = 5000;
const AUTH_LIST_PAGE_SIZE = 200;
const AUTH_LIST_MAX_PAGES = 25;
const DISABLE_BAN_DURATION = "876000h"; // ~100 years

type Payload = {
  action?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  sex?: string;
  accountStatus?: string;
  preset?: string;
  from?: string;
  to?: string;
  userId?: string;
  profile?: Record<string, unknown>;
  disabled?: boolean;
};

type DateRange = {
  preset: string;
  from: string | null;
  to: string | null;
  label: string;
};

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

function isUuidLike(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

function scalarString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (obj.name != null) return scalarString(obj.name);
    if (obj.label != null) return scalarString(obj.label);
    if (obj.value != null) return scalarString(obj.value);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

function buildFullName(row: Record<string, unknown>) {
  const parts = [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .map((p) => scalarString(p))
    .filter(Boolean);
  return parts.join(" ") || "—";
}

function normalizeSexLabel(value: unknown) {
  const raw = scalarString(value);
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper === "M" || upper === "MALE") return "Male";
  if (upper === "F" || upper === "FEMALE") return "Female";
  if (raw === "[object Object]") return "";
  return raw;
}

/** public.users.sex is char(1). Persist M/F; API still returns Male/Female. */
function normalizeSexStorage(value: unknown) {
  const raw = scalarString(value);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "M" || upper === "MALE") return "M";
  if (upper === "F" || upper === "FEMALE") return "F";
  throw new Error("Sex must be Male or Female.");
}

function formatUtcDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999)
  );
}

function startOfUtcWeek(date: Date) {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  dayStart.setUTCDate(dayStart.getUTCDate() - diff);
  return dayStart;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseUtcDateOnly(value: unknown) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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

function resolveDateRange(presetInput: unknown, customFrom?: unknown, customTo?: unknown): DateRange {
  const preset = String(presetInput || "all_time").trim().toLowerCase() || "all_time";
  const now = new Date();
  const todayEnd = endOfUtcDay(now);

  if (preset === "all_time") {
    return { preset: "all_time", from: null, to: null, label: "All Time" };
  }

  if (preset === "custom") {
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

  if (preset === "week") {
    const from = startOfUtcWeek(now);
    return {
      preset: "week",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `This Week · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (preset === "month") {
    const from = startOfUtcMonth(now);
    return {
      preset: "month",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `This Month · ${formatUtcDateLabel(from)} – ${formatUtcDateLabel(todayEnd)}`,
    };
  }

  if (preset === "day") {
    const from = startOfUtcDay(now);
    return {
      preset: "day",
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: `Today · ${formatUtcDateLabel(from)}`,
    };
  }

  return { preset: "all_time", from: null, to: null, label: "All Time" };
}

function isAuthUserDisabled(authUser: { banned_until?: string | null } | null | undefined) {
  if (!authUser?.banned_until) return false;
  const bannedUntil = new Date(authUser.banned_until);
  if (Number.isNaN(bannedUntil.getTime())) return false;
  return bannedUntil.getTime() > Date.now();
}

const MAPPED_PROFILE_KEYS = new Set([
  "id",
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "sex",
  "birth_date",
  "email",
  "contact_no",
  "contact_number",
  "address",
  "barangay",
  "voter_id",
  "voter_id_number",
  "age",
  "created_at",
  "updated_at",
]);

const SKIP_EXTRA_KEYS = new Set(["verified"]);

function mapUserRow(
  row: Record<string, unknown>,
  auth?: { email?: string | null; banned_until?: string | null } | null
) {
  const profileEmail = scalarString(row.email);
  const authEmail = scalarString(auth?.email);
  const disabled = isAuthUserDisabled(auth);
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (MAPPED_PROFILE_KEYS.has(key) || SKIP_EXTRA_KEYS.has(key)) continue;
    extras[key] = value;
  }
  const voterId = scalarString(
    row.voter_id ?? row.vin ?? row.voter_id_number ?? row.voters_id ?? ""
  );
  return {
    id: scalarString(row.id),
    firstName: scalarString(row.first_name),
    middleName: scalarString(row.middle_name),
    lastName: scalarString(row.last_name),
    suffix: scalarString(row.suffix),
    fullName: buildFullName(row),
    sex: normalizeSexLabel(row.sex),
    sexRaw: scalarString(row.sex),
    birthDate: scalarString(row.birth_date),
    age: scalarString(row.age),
    email: authEmail || profileEmail || "",
    profileEmail: profileEmail || "",
    contactNo: scalarString(
      row.contact_no ?? row.contact_number ?? row.phone_number ?? row.mobile_number
    ),
    address: scalarString(row.address),
    barangay: scalarString(row.barangay),
    voterId,
    createdAt: row.created_at ? scalarString(row.created_at) : null,
    updatedAt: row.updated_at ? scalarString(row.updated_at) : null,
    disabled,
    bannedUntil: auth?.banned_until ? scalarString(auth.banned_until) : null,
    hasAuthAccount: Boolean(auth),
    extras,
  };
}

function formatAssistanceName(value: unknown) {
  const name = scalarString(value);
  if (!name) return "";
  if (name.toLowerCase().endsWith(" assistance")) return name;
  return `${name} Assistance`;
}

async function resolveServiceMetaByIds(
  supabase: ReturnType<typeof getServiceClient>,
  serviceIds: unknown[]
) {
  const ids = [...new Set(serviceIds.filter(Boolean).map(String))];
  const metaByServiceId: Record<
    string,
    { serviceName: string; assistanceName: string; categoryId: string | null }
  > = {};

  if (ids.length === 0) return metaByServiceId;

  const { data: services, error: servicesError } = await supabase
    .from("assistance_services")
    .select("id, display_name, category_id")
    .in("id", ids);

  if (servicesError) {
    const retry = await supabase
      .from("assistance_services")
      .select("id, display_name")
      .in("id", ids);
    if (retry.error) throw retry.error;
    for (const service of retry.data || []) {
      metaByServiceId[String(service.id)] = {
        serviceName: scalarString(service.display_name) || "Service",
        assistanceName: "",
        categoryId: null,
      };
    }
    return metaByServiceId;
  }

  const categoryIds = [
    ...new Set(
      (services || [])
        .map((service) => service.category_id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  let categoriesById: Record<string, string> = {};
  if (categoryIds.length > 0) {
    const { data: categories, error: categoriesError } = await supabase
      .from("assistance_categories")
      .select("id, assistance_name")
      .in("id", categoryIds);
    if (!categoriesError) {
      categoriesById = Object.fromEntries(
        (categories || []).map((category) => [
          String(category.id),
          formatAssistanceName(category.assistance_name),
        ])
      );
    }
  }

  for (const service of services || []) {
    const categoryId = service.category_id ? String(service.category_id) : null;
    metaByServiceId[String(service.id)] = {
      serviceName: scalarString(service.display_name) || "Service",
      assistanceName: categoryId ? categoriesById[categoryId] || "" : "",
      categoryId,
    };
  }

  return metaByServiceId;
}

async function fetchRequestsForUserIds(
  supabase: ReturnType<typeof getServiceClient>,
  userIds: string[]
) {
  if (userIds.length === 0) return [] as Record<string, unknown>[];

  const chunkSize = 200;
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("assistance_requests")
      .select("*")
      .in("user_id", chunk)
      .order("submitted_at", { ascending: false, nullsFirst: false });

    if (error) {
      const retry = await supabase
        .from("assistance_requests")
        .select(
          "id, request_code, status, service_id, user_id, submitted_at, created_at, updated_at, case_study_date"
        )
        .in("user_id", chunk)
        .order("created_at", { ascending: false });
      if (retry.error) throw retry.error;
      rows.push(...((retry.data || []) as Record<string, unknown>[]));
    } else {
      rows.push(...((data || []) as Record<string, unknown>[]));
    }
  }

  const metaByServiceId = await resolveServiceMetaByIds(
    supabase,
    rows.map((row) => row.service_id)
  );

  return rows.map((row) => {
    const meta = metaByServiceId[String(row.service_id)] || {
      serviceName: "Service",
      assistanceName: "",
      categoryId: null,
    };
    const known = {
      id: row.id,
      userId: row.user_id,
      requestCode: row.request_code || row.id,
      status: normalizeStatusLabel(row.status),
      statusRaw: row.status ?? "",
      serviceId: row.service_id || null,
      serviceName: meta.serviceName,
      assistanceName: meta.assistanceName,
      categoryId: meta.categoryId,
      submittedAt: row.submitted_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      caseStudyDate: row.case_study_date || null,
    };
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (
        ![
          "id",
          "user_id",
          "request_code",
          "status",
          "service_id",
          "submitted_at",
          "created_at",
          "updated_at",
          "case_study_date",
        ].includes(key)
      ) {
        extras[key] = value;
      }
    }
    return { ...known, extras };
  });
}

function normalizeStatusLabel(raw: unknown) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (["action required", "action_required", "requires_action"].includes(key)) {
    return "Action Required";
  }
  if (["in progress", "in_progress"].includes(key)) return "In Progress";
  if (["for approval", "for_approval"].includes(key)) return "For Approval";
  if (key === "resubmitted") return "Resubmitted";
  if (key === "scheduled") return "Scheduled";
  if (key === "approved") return "Approved";
  if (["declined", "denied", "rejected"].includes(key)) return "Declined";
  if (key === "pending") return "Pending";
  if (key === "draft") return "Draft";
  if (!key) return "Pending";
  return String(raw).trim();
}

async function fetchAuthByIds(
  supabase: ReturnType<typeof getServiceClient>,
  ids: string[]
) {
  const map = new Map<string, { email?: string | null; banned_until?: string | null }>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const { data, error } = await supabase.auth.admin.getUserById(id);
        if (error || !data?.user) return;
        map.set(id, {
          email: data.user.email ?? null,
          banned_until: (data.user as { banned_until?: string | null }).banned_until ?? null,
        });
      } catch {
        // Auth row may be missing for orphaned profile rows.
      }
    })
  );
  return map;
}

async function findAuthUserIdsByEmail(
  supabase: ReturnType<typeof getServiceClient>,
  emailQuery: string
) {
  const needle = emailQuery.trim().toLowerCase();
  if (!needle) return [] as string[];

  const matches: string[] = [];
  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    });
    if (error) throw error;
    const users = data?.users || [];
    for (const user of users) {
      const email = String(user.email || "").trim().toLowerCase();
      if (email.includes(needle)) {
        matches.push(user.id);
      }
    }
    if (users.length < AUTH_LIST_PAGE_SIZE) break;
  }
  return matches;
}

async function collectAuthUserIdsByDisabled(
  supabase: ReturnType<typeof getServiceClient>,
  wantDisabled: boolean
) {
  const matches: string[] = [];
  for (let page = 1; page <= AUTH_LIST_MAX_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: AUTH_LIST_PAGE_SIZE,
    });
    if (error) throw error;
    const users = data?.users || [];
    for (const user of users) {
      const disabled = isAuthUserDisabled(
        user as { banned_until?: string | null }
      );
      if (disabled === wantDisabled) {
        matches.push(user.id);
      }
    }
    if (users.length < AUTH_LIST_PAGE_SIZE) break;
  }
  return matches;
}

function applyProfileFilters(
  // deno-lint-ignore no-explicit-any
  query: any,
  {
    search,
    sex,
    range,
    idFilter,
    includeOptionalSearchCols = true,
  }: {
    search: string;
    sex: string;
    range: DateRange;
    idFilter: string[] | null;
    includeOptionalSearchCols?: boolean;
  }
) {
  let next = query;

  if (idFilter) {
    if (idFilter.length === 0) {
      return { empty: true as const, query: next };
    }
    next = next.in("id", idFilter);
  }

  if (range.from) {
    next = next.gte("created_at", range.from);
  }
  if (range.to) {
    next = next.lte("created_at", range.to);
  }

  const sexFilter = String(sex || "").trim();
  if (sexFilter) {
    if (sexFilter.toLowerCase() === "male") {
      next = next.or("sex.ilike.Male,sex.eq.M,sex.eq.m");
    } else if (sexFilter.toLowerCase() === "female") {
      next = next.or("sex.ilike.Female,sex.eq.F,sex.eq.f");
    } else {
      next = next.ilike("sex", sexFilter);
    }
  }

  const q = String(search || "").trim();
  if (q && !q.includes("@") && !isUuidLike(q)) {
    const safe = q.replace(/[%_,.()]/g, " ").replace(/\s+/g, " ").trim();
    if (safe) {
      // PostgREST requires quoted values when wildcards are used.
      const pattern = `"%${safe.replace(/"/g, "")}%"`;
      const parts = [
        `first_name.ilike.${pattern}`,
        `middle_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `suffix.ilike.${pattern}`,
      ];
      if (includeOptionalSearchCols) {
        parts.push(
          `email.ilike.${pattern}`,
          `contact_number.ilike.${pattern}`,
          `voter_id_number.ilike.${pattern}`,
          `barangay.ilike.${pattern}`
        );
      }
      next = next.or(parts.join(","));
    }
  }

  if (q && isUuidLike(q)) {
    next = next.eq("id", q);
  }

  return { empty: false as const, query: next };
}

async function listOrExportUsers(
  supabase: ReturnType<typeof getServiceClient>,
  body: Payload,
  { forExport }: { forExport: boolean }
) {
  const range = resolveDateRange(body.preset, body.from, body.to);
  const search = String(body.search ?? "").trim();
  const sex = String(body.sex ?? "").trim();
  const accountStatus = String(body.accountStatus ?? "").trim().toLowerCase();
  const pageSize = forExport
    ? EXPORT_CAP
    : Math.min(
        PAGE_SIZE_MAX,
        Math.max(1, Math.floor(Number(body.pageSize) || PAGE_SIZE_DEFAULT))
      );
  const page = forExport ? 1 : Math.max(1, Math.floor(Number(body.page) || 1));

  let idFilter: string[] | null = null;

  if (search.includes("@")) {
    idFilter = await findAuthUserIdsByEmail(supabase, search);
  }

  if (accountStatus === "disabled" || accountStatus === "active") {
    const disabledIds = await collectAuthUserIdsByDisabled(
      supabase,
      accountStatus === "disabled"
    );
    idFilter = idFilter
      ? idFilter.filter((id) => disabledIds.includes(id))
      : disabledIds;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  async function runSelect(selectCols: string, includeOptionalSearchCols: boolean) {
    let orderCol = "created_at";
    const attempt = async () => {
      const base = supabase
        .from("users")
        .select(selectCols, { count: "exact" })
        .order(orderCol, { ascending: false });

      const filtered = applyProfileFilters(base, {
        search,
        sex,
        range: orderCol === "created_at" ? range : { preset: "all_time", from: null, to: null, label: "All Time" },
        idFilter,
        includeOptionalSearchCols,
      });
      if (filtered.empty) {
        return { users: [] as ReturnType<typeof mapUserRow>[], total: 0, page: 1, pageSize, range };
      }
      const { data, error, count } = await filtered.query.range(from, to);
      if (error) throw error;
      const rows = (data || []) as Record<string, unknown>[];
      const authMap = await fetchAuthByIds(
        supabase,
        rows.map((row) => String(row.id))
      );
      return {
        users: rows.map((row) => mapUserRow(row, authMap.get(String(row.id)))),
        total: Number(count || 0),
        page,
        pageSize,
        range,
      };
    };

    try {
      return await attempt();
    } catch (error) {
      const message = errorMessage(error);
      if (/created_at/i.test(message) && orderCol === "created_at") {
        orderCol = "id";
        return await attempt();
      }
      throw error;
    }
  }

  try {
    // Live schema uses email / contact_number / voter_id_number. Fall back to names-only.
    return await runSelect(USER_SELECT, true);
  } catch (error) {
    const message = errorMessage(error);
    const base = supabase
      .from("users")
      .select(USER_SELECT_MINIMAL, { count: "exact" })
      .order("id", { ascending: false });
    const filtered = applyProfileFilters(base, {
      search,
      sex,
      range: { preset: "all_time", from: null, to: null, label: "All Time" },
      idFilter,
      includeOptionalSearchCols: false,
    });
    if (filtered.empty) {
      return { users: [], total: 0, page: 1, pageSize, range };
    }
    const { data, error: lastError, count } = await filtered.query.range(from, to);
    if (lastError) {
      throw new Error(
        `users query failed: ${errorMessage(lastError)} (earlier: ${message})`
      );
    }
    const rows = (data || []) as Record<string, unknown>[];
    const authMap = await fetchAuthByIds(
      supabase,
      rows.map((row) => String(row.id))
    );
    return {
      users: rows.map((row) => mapUserRow(row, authMap.get(String(row.id)))),
      total: Number(count || 0),
      page,
      pageSize,
      range,
    };
  }
}

async function getUserDetail(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
) {
  if (!isUuidLike(userId)) {
    throw new Error("userId is required.");
  }

  let profile: Record<string, unknown> | null = null;
  {
    const { data, error } = await supabase
      .from("users")
      .select(USER_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      const retry = await supabase
        .from("users")
        .select(USER_SELECT_MINIMAL)
        .eq("id", userId)
        .maybeSingle();
      if (retry.error) throw new Error(errorMessage(retry.error));
      profile = (retry.data as Record<string, unknown>) || null;
    } else {
      profile = (data as Record<string, unknown>) || null;
    }
  }

  if (!profile) {
    throw new Error("User not found.");
  }

  const authMap = await fetchAuthByIds(supabase, [userId]);
  const user = mapUserRow(profile, authMap.get(userId));

  const { data: requestRows, error: requestError } = await supabase
    .from("assistance_requests")
    .select(
      "id, request_code, status, service_id, service_name, assistance_name, category_id, submitted_at, created_at, updated_at, case_study_date"
    )
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (requestError) throw requestError;

  const resolvedRequestRows = requestRows || [];
  const metaByServiceId = await resolveServiceMetaByIds(
    supabase,
    resolvedRequestRows.map((row) => row.service_id)
  );

  const requests = resolvedRequestRows.map((row) => {
    const snapshotService = scalarString(row.service_name);
    const snapshotAssistance = scalarString(row.assistance_name);
    const meta = metaByServiceId[String(row.service_id)] || {
      serviceName: "Service",
      assistanceName: "",
      categoryId: null,
    };
    return {
      id: row.id,
      requestCode: scalarString(row.request_code) || scalarString(row.id),
      status: normalizeStatusLabel(row.status),
      statusRaw: scalarString(row.status),
      serviceId: row.service_id || null,
      serviceName: snapshotService || meta.serviceName,
      assistanceName: snapshotAssistance
        ? formatAssistanceName(snapshotAssistance)
        : meta.assistanceName,
      categoryId: row.category_id || meta.categoryId,
      submittedAt: row.submitted_at || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      caseStudyDate: row.case_study_date || null,
    };
  });

  const statusCounts: Record<string, number> = {};
  for (const request of requests) {
    const key = request.status || "Pending";
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }

  return {
    user,
    requests,
    statusCounts,
    requestTotal: requests.length,
  };
}

function buildUpdatePayload(profile: Record<string, unknown> | undefined) {
  const input = profile && typeof profile === "object" ? profile : {};
  const payload: Record<string, unknown> = {};

  const fieldMap: Record<string, string> = {
    firstName: "first_name",
    middleName: "middle_name",
    lastName: "last_name",
    suffix: "suffix",
    sex: "sex",
    birthDate: "birth_date",
    email: "email",
    contactNo: "contact_number",
    address: "address",
    barangay: "barangay",
    voterId: "voter_id_number",
  };

  const emptyStringColumns = new Set([
    "first_name",
    "middle_name",
    "last_name",
    "suffix",
    "email",
    "contact_number",
    "address",
    "barangay",
  ]);

  for (const [camel, column] of Object.entries(fieldMap)) {
    if (!Object.prototype.hasOwnProperty.call(input, camel)) continue;
    if (!USER_UPDATE_ALLOWLIST.has(column)) continue;
    const value = input[camel];
    if (column === "contact_number") {
      const text = value == null ? "" : scalarString(value);
      const contactError = phoneValidationMessage(text);
      if (contactError) throw new Error(contactError);
      payload[column] = normalizePhMobile(text);
      continue;
    }
    if (value == null || value === "") {
      // NOT NULL text columns need "" not null; optional blanks stay empty string too.
      payload[column] = emptyStringColumns.has(column) ? "" : null;
      continue;
    }
    const text = scalarString(value);
    if (!text || text === "[object Object]") continue;
    payload[column] = text;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "suffix") && payload.suffix != null) {
    payload.suffix = String(payload.suffix).slice(0, 10);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "voter_id_number")) {
    payload.voter_id_number = normalizeProfileVoterId(payload.voter_id_number);
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("No valid profile fields to update.");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "sex") && payload.sex != null) {
    payload.sex = normalizeSexStorage(payload.sex);
  }

  if (Object.prototype.hasOwnProperty.call(payload, "birth_date") && payload.birth_date) {
    const raw = scalarString(payload.birth_date).slice(0, 10);
    payload.birth_date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  }

  return payload;
}

async function updateUserProfileRow(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  profile: Record<string, unknown> | undefined
) {
  const fullPayload = buildUpdatePayload(profile);

  if (Object.prototype.hasOwnProperty.call(fullPayload, "voter_id_number")) {
    const { data: existing, error: existingError } = await supabase
      .from("users")
      .select("voter_id_number")
      .eq("id", userId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new Error("User not found.");

    const previous = formatVoterId(existing.voter_id_number);
    const next = fullPayload.voter_id_number == null ? "" : formatVoterId(fullPayload.voter_id_number);
    if (!next && previous) {
      throw new Error("VIN cannot be cleared. Enter a valid voter ID.");
    }
    if (next) {
      const { data: clashRows, error: clashError } = await supabase
        .from("users")
        .select("id")
        .eq("voter_id_number", next)
        .neq("id", userId)
        .limit(1);
      if (clashError) throw clashError;
      if (clashRows?.length) {
        throw new Error("That VIN is already used by another user account.");
      }
      fullPayload.voter_id_number = next;
    }
  }

  const attemptUpdate = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from("users")
      .update(payload)
      .eq("id", userId)
      .select("*")
      .maybeSingle();
    return { data, error };
  };

  let payload = { ...fullPayload };
  let { data, error } = await attemptUpdate(payload);

  // Drop unsupported columns one failure mode at a time.
  for (let i = 0; i < 8 && error; i += 1) {
    const message = errorMessage(error);
    const missing = message.match(/column\s+"?([a-z0-9_]+)"?\s+.*does not exist/i)?.[1];
    if (missing && Object.prototype.hasOwnProperty.call(payload, missing)) {
      delete payload[missing];
      if (Object.keys(payload).length === 0) {
        throw new Error("No supported profile fields to update on this schema.");
      }
      ({ data, error } = await attemptUpdate(payload));
      continue;
    }

    // Fallback: core identity fields only.
    const corePayload: Record<string, unknown> = {};
    for (const key of ["first_name", "middle_name", "last_name", "suffix", "sex"]) {
      if (Object.prototype.hasOwnProperty.call(fullPayload, key)) {
        corePayload[key] = fullPayload[key];
      }
    }
    if (Object.keys(corePayload).length === 0) {
      throw new Error(message || "Failed to update profile.");
    }
    payload = corePayload;
    ({ data, error } = await attemptUpdate(payload));
    if (error) throw new Error(errorMessage(error) || "Failed to update profile.");
    break;
  }

  if (error) {
    if (isUniqueViolation(error) && payload.voter_id_number) {
      throw new Error("That VIN is already used by another user account.");
    }
    throw new Error(errorMessage(error) || "Failed to update profile.");
  }
  if (!data) {
    throw new Error("User not found.");
  }

  const authMap = await fetchAuthByIds(supabase, [userId]);
  return mapUserRow(data as Record<string, unknown>, authMap.get(userId));
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

    const auditor = createAuditor(supabase, req, auth.userId);

    let body: Payload;
    try {
      body = (await req.json()) as Payload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = String(body.action ?? "").trim();

    if (action === "listUsers") {
      const result = await listOrExportUsers(supabase, body, { forExport: false });
      return jsonResponse({
        success: true,
        action,
        ...result,
      });
    }

    if (action === "exportUsers") {
      const result = await listOrExportUsers(supabase, body, { forExport: true });
      const requests = await fetchRequestsForUserIds(
        supabase,
        (result.users || []).map((user) => String(user.id))
      );
      await auditor.record({
        action: "export",
        module: AUDIT_MODULES.DATA_USERS,
        resourceType: "user",
        summary: `Exported ${Number(result.total || result.users?.length || 0)} applicant records`,
        metadata: { count: result.total ?? result.users?.length ?? 0 },
      });
      return jsonResponse({
        success: true,
        action,
        ...result,
        requests,
      });
    }

    if (action === "getUser") {
      try {
        const detail = await getUserDetail(supabase, String(body.userId ?? ""));
        return jsonResponse({ success: true, action, ...detail });
      } catch (err) {
        const message = errorMessage(err) || "Failed to load user.";
        const status = /not found/i.test(message) ? 404 : 400;
        return jsonResponse({ success: false, error: message }, status);
      }
    }

    if (action === "updateUser") {
      const userId = String(body.userId ?? "").trim();
      if (!isUuidLike(userId)) {
        return jsonResponse({ success: false, error: "userId is required." }, 400);
      }

      try {
        const user = await updateUserProfileRow(supabase, userId, body.profile);
        const userRow = user as Record<string, unknown>;
        const userLabel =
          formatPersonAuditLabel(userRow, String(userRow.email ?? userRow.voterId ?? "")) ||
          userId;
        await auditor.record({
          action: "update",
          module: AUDIT_MODULES.DATA_USERS,
          resourceType: "user",
          resourceId: userId,
          summary: `Updated applicant ${userLabel}`,
          metadata: {
            email: userRow.email ?? null,
            voterId: userRow.voterId ?? null,
          },
        });
        return jsonResponse({ success: true, action, user });
      } catch (err) {
        const message = errorMessage(err) || "Failed to update profile.";
        const status = /not found/i.test(message) ? 404 : 400;
        return jsonResponse({ success: false, error: message }, status);
      }
    }

    if (action === "setUserDisabled") {
      const userId = String(body.userId ?? "").trim();
      if (!isUuidLike(userId)) {
        return jsonResponse({ success: false, error: "userId is required." }, 400);
      }

      const disabled = Boolean(body.disabled);
      const { data: existing, error: existingError } = await supabase.auth.admin.getUserById(
        userId
      );
      if (existingError || !existing?.user) {
        return jsonResponse(
          {
            success: false,
            error: existingError?.message || "Auth account not found for this user.",
          },
          404
        );
      }

      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        {
          ban_duration: disabled ? DISABLE_BAN_DURATION : "none",
        }
      );

      if (updateError) {
        return jsonResponse({ success: false, error: updateError.message }, 400);
      }

      const authUser = updated?.user || existing.user;
      let profile: Record<string, unknown> | null = null;
      const named = await supabase
        .from("users")
        .select("first_name, middle_name, last_name, suffix, voter_id_number")
        .eq("id", userId)
        .maybeSingle();
      if (!named.error && named.data) {
        profile = named.data as Record<string, unknown>;
      } else {
        const retry = await supabase
          .from("users")
          .select("first_name, middle_name, last_name, suffix")
          .eq("id", userId)
          .maybeSingle();
        profile = (retry.data as Record<string, unknown>) || null;
      }
      const userLabel =
        formatPersonAuditLabel(profile, String(authUser.email ?? "")) ||
        String(authUser.email ?? userId);
      await auditor.record({
        action: disabled ? "disable" : "enable",
        module: AUDIT_MODULES.DATA_USERS,
        resourceType: "user",
        resourceId: userId,
        summary: disabled
          ? `Disabled applicant ${userLabel}`
          : `Enabled applicant ${userLabel}`,
        metadata: {
          email: authUser.email ?? null,
          voterId: profile?.voter_id_number ?? profile?.voterId ?? null,
        },
      });
      return jsonResponse({
        success: true,
        action,
        userId,
        disabled: isAuthUserDisabled(authUser as { banned_until?: string | null }),
        email: authUser.email ?? null,
        bannedUntil: (authUser as { banned_until?: string | null }).banned_until ?? null,
      });
    }

    return jsonResponse(
      {
        error:
          "Invalid action. Use listUsers, getUser, updateUser, setUserDisabled, or exportUsers.",
      },
      400
    );
  } catch (error) {
    const message = errorMessage(error) || "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
