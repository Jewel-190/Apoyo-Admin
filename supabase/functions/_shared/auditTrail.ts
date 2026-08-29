import type { ServiceClient } from "./client.ts";

export const AUDIT_MODULES = {
  SESSION: "session",
  CONTENT_SERVICES: "content.services",
  CONTENT_WEB: "content.web",
  DATA_USERS: "data.users",
  DATA_ADMINS: "data.admins",
  DATA_VOTERS: "data.voters",
  DATA_BARANGAYS: "data.barangays",
  SETTINGS: "settings",
  REPORTS: "reports",
} as const;

export type AuditWrite = {
  actorId: string;
  actorEmail?: string | null;
  action: string;
  module: string;
  resourceType?: string | null;
  resourceId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
};

function textPart(value: unknown): string {
  return String(value ?? "").trim();
}

/** Works with both DB rows (`first_name`) and mapped API objects (`fullName`). */
export function personDisplayName(
  record: Record<string, unknown> | null | undefined
): string {
  if (!record) return "";
  const mapped = textPart(record.fullName);
  if (mapped && mapped !== "—") return mapped;
  return [
    record.firstName ?? record.first_name,
    record.middleName ?? record.middle_name,
    record.lastName ?? record.last_name,
    record.suffix,
  ]
    .map(textPart)
    .filter(Boolean)
    .join(" ");
}

export function formatPersonAuditLabel(
  record: Record<string, unknown> | null | undefined,
  extra?: string | null
): string {
  const name = personDisplayName(record);
  const extraText = textPart(extra);
  if (name && extraText && extraText !== name) return `${name} (${extraText})`;
  return name || extraText;
}

function clip(value: unknown, max: number): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim() || "";
  if (!first || first === "unknown") return null;
  return first.slice(0, 128);
}

export function clientIpFromRequest(req: Request): string | null {
  return (
    firstForwardedIp(req.headers.get("cf-connecting-ip")) ||
    firstForwardedIp(req.headers.get("x-real-ip")) ||
    firstForwardedIp(req.headers.get("x-forwarded-for"))
  );
}

export function countryCodeFromRequest(req: Request): string | null {
  const raw = String(req.headers.get("cf-ipcountry") ?? "").trim().toUpperCase();
  if (!raw || raw === "XX" || raw === "T1") return null;
  if (!/^[A-Z]{2}$/.test(raw)) return null;
  return raw;
}

export function userAgentFromRequest(req: Request): string | null {
  return clip(req.headers.get("user-agent"), 400);
}

export async function resolveActorEmail(
  supabase: ServiceClient,
  actorId: string
): Promise<string | null> {
  if (!actorId) return null;
  try {
    const { data, error } = await supabase.auth.admin.getUserById(actorId);
    if (error || !data?.user?.email) return null;
    return String(data.user.email).trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function writeAuditEvent(
  supabase: ServiceClient,
  req: Request,
  event: AuditWrite
): Promise<void> {
  try {
    const actorId = String(event.actorId || "").trim();
    const action = clip(event.action, 64);
    const moduleName = clip(event.module, 64);
    const summary = clip(event.summary, 500);
    if (!actorId || !action || !moduleName || !summary) return;

    const actorEmail =
      clip(event.actorEmail, 320) || (await resolveActorEmail(supabase, actorId));

    const metadata =
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? event.metadata
        : {};

    const { error } = await supabase.from("audit_trail").insert({
      actor_id: actorId,
      actor_email: actorEmail,
      action,
      module: moduleName,
      resource_type: clip(event.resourceType, 64),
      resource_id: clip(event.resourceId, 128),
      summary,
      metadata,
      ip_address: clientIpFromRequest(req),
      country_code: countryCodeFromRequest(req),
      user_agent: userAgentFromRequest(req),
    });

    if (error) {
      console.error("audit_trail insert failed:", error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("audit_trail insert failed:", message);
  }
}

export function createAuditor(
  supabase: ServiceClient,
  req: Request,
  actorId: string,
  actorEmail?: string | null
) {
  let emailPromise: Promise<string | null> | null = null;
  const resolvedEmail = () => {
    if (actorEmail) return Promise.resolve(clip(actorEmail, 320));
    if (!emailPromise) emailPromise = resolveActorEmail(supabase, actorId);
    return emailPromise;
  };

  return {
    async record(event: Omit<AuditWrite, "actorId" | "actorEmail">) {
      await writeAuditEvent(supabase, req, {
        actorId,
        actorEmail: await resolvedEmail(),
        ...event,
      });
    },
  };
}
