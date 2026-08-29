import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { AUDIT_MODULES, createAuditor } from "../_shared/auditTrail.ts";
import {
  EMPTY_LEGAL,
  WEB_PAGES,
  assertContentSize,
  canonicalizeLegal,
  canonicalizePageContent,
  isWebPage,
  type WebPage,
} from "../_shared/webContent.ts";

/**
 * GET  /functions/v1/web              Public marketing payload (pages + legal).
 * POST /functions/v1/web              Same public payload, or CMS mutations.
 *
 * Public website + Superadmin CMS gateway for `web_content` (and public Legal
 * copy from settings). Clients must not read/write the table directly.
 *
 * Actions (POST):
 *  - public.get   Anon OK. Canonical pages + legal in one round trip.
 *  - cms.list     Superadmin. All editable pages.
 *  - cms.save     Superadmin. Canonicalize then upsert one page.
 *
 * Media uploads stay on the `web-content` storage bucket (RLS + 100 MB limit).
 * Edge functions cannot proxy hero videos of that size.
 */

type Payload = {
  action?: string;
  page?: string;
  content?: unknown;
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

async function loadCanonicalPages(supabase: ReturnType<typeof getServiceClient>) {
  const { data, error } = await supabase
    .from("web_content")
    .select("page, content, updated_at")
    .in("page", [...WEB_PAGES]);
  if (error) throw error;

  const byPage = new Map(
    (data ?? []).map((row) => [String(row.page), row] as const)
  );

  const pages: Record<WebPage, Record<string, unknown>> = {
    global: {},
    home: {},
    services: { presentations: [] },
    about: {},
  };
  const updatedAt: Record<WebPage, string | null> = {
    global: null,
    home: null,
    services: null,
    about: null,
  };

  for (const page of WEB_PAGES) {
    const row = byPage.get(page);
    pages[page] = canonicalizePageContent(page, row?.content ?? {});
    updatedAt[page] = row?.updated_at ? String(row.updated_at) : null;
  }

  return { pages, updatedAt };
}

async function loadPublicLegal(supabase: ReturnType<typeof getServiceClient>) {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("scope", "system")
    .eq("key", "legal")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return canonicalizeLegal(data?.value);
}

async function handlePublicGet(supabase: ReturnType<typeof getServiceClient>) {
  const [{ pages }, legal] = await Promise.all([
    loadCanonicalPages(supabase),
    loadPublicLegal(supabase).catch(() => EMPTY_LEGAL),
  ]);
  return jsonResponse(
    {
      success: true,
      action: "public.get",
      pages,
      legal,
    },
    200,
    {
      // Short browser cache; SWR lets repeat visits reuse while we revalidate.
      "Cache-Control": "public, max-age=15, stale-while-revalidate=120",
    }
  );
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const supabase = getServiceClient();

    if (req.method === "GET") {
      return await handlePublicGet(supabase);
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let body: Payload;
    try {
      body = (await req.json()) as Payload;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const action = String(body.action ?? "").trim();

    if (action === "public.get") {
      return await handlePublicGet(supabase);
    }

    if (action !== "cms.list" && action !== "cms.save") {
      return jsonResponse({ error: "Unknown action." }, 400);
    }

    const auth = await authorizeRequest(req, supabase);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    if (auth.viaSecret || !auth.userId) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const superAdminCheck = await ensureSuperAdminCaller(supabase, auth.userId);
    if (!superAdminCheck.ok) return superAdminCheck.response;

    const auditor = createAuditor(supabase, req, auth.userId);

    if (action === "cms.list") {
      const { pages, updatedAt } = await loadCanonicalPages(supabase);
      return jsonResponse({
        success: true,
        action,
        pages,
        updatedAt,
      });
    }

    const page = String(body.page ?? "").trim();
    if (!isWebPage(page)) {
      return jsonResponse(
        { error: `Invalid page. Expected one of: ${WEB_PAGES.join(", ")}.` },
        400
      );
    }
    if (body.content === undefined) {
      return jsonResponse({ error: "content is required." }, 400);
    }

    assertContentSize(body.content);
    const content = canonicalizePageContent(page, body.content);
    assertContentSize(content);

    const { error } = await supabase.from("web_content").upsert(
      {
        page,
        content,
        updated_by: auth.userId,
      },
      { onConflict: "page" }
    );
    if (error) throw error;

    await auditor.record({
      action: "update",
      module: AUDIT_MODULES.CONTENT_WEB,
      resourceType: "web_page",
      resourceId: page,
      summary: `Published web page ${page}`,
    });

    return jsonResponse({
      success: true,
      action,
      page,
      content,
    });
  } catch (error) {
    const message = errorMessage(error) || "Web request failed.";
    const status = /too large/i.test(message) ? 413 : 500;
    return jsonResponse({ success: false, error: message }, status);
  }
});
