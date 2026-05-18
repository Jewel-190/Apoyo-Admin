import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const SERVICE_ALIASES: Record<string, string> = {
  hospitalizationreq: "hospitalizationreq",
  hospitalization: "hospitalizationreq",
  hosp: "hospitalizationreq",
  hospital: "hospitalizationreq",
  hospitalization_requests: "hospitalizationreq",

  treatmentreq: "treatmentreq",
  treatment: "treatmentreq",
  treat: "treatmentreq",
  treatment_requests: "treatmentreq",

  medicalreq: "medicalreq",
  medical: "medicalreq",
  med: "medicalreq",
  operations: "medicalreq",
  medical_requests: "medicalreq",

  financialreq: "financialreq",
  financial: "financialreq",
  fin: "financialreq",
  "emergency-finance": "financialreq",
  financial_requests: "financialreq",

  monetaryreq: "monetaryreq",
  monetary: "monetaryreq",
  mon: "monetaryreq",
  "burial-money": "monetaryreq",
  monetary_requests: "monetaryreq",

  burialreq: "burialreq",
  burial: "burialreq",
  bur: "burialreq",
  "burial-site": "burialreq",
  burial_requests: "burialreq",

  cremationreq: "cremationreq",
  cremation: "cremationreq",
  crem: "cremationreq",
  cremation_requests: "cremationreq",

  columbariumreq: "columbariumreq",
  columbarium: "columbariumreq",
  colombarium: "columbariumreq",
  colu: "columbariumreq",
  columbarium_requests: "columbariumreq",
};

type RequestCodePayload = {
  /** Legacy token or slug (e.g. financialreq, test-financial). */
  serviceType?: string;
  /** Catalog service UUID — resolved via assistance_services.request_code when set. */
  serviceId?: string;
  timestamp?: string;
};

function normalizeService(input: string): string {
  const key = (input || "").trim().toLowerCase();
  if (!key) return "";
  return SERVICE_ALIASES[key] ?? key;
}

function normalizeServiceId(input: string): string {
  return (input || "").trim().replace(/-/g, "").toLowerCase();
}

function parseTimestamp(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500
    );
  }

  const expectedSecret = Deno.env.get("REQUEST_CODE_HOOK_SECRET") ?? "";
  if (expectedSecret) {
    const provided = request.headers.get("x-request-code-secret") ?? "";
    if (provided !== expectedSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
  }

  let payload: RequestCodePayload;
  try {
    payload = (await request.json()) as RequestCodePayload;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const fromServiceId = normalizeServiceId(payload.serviceId || "");
  const fromType = normalizeService(payload.serviceType || "");
  const pService = fromServiceId || fromType;

  if (!pService) {
    return jsonResponse(
      { ok: false, error: "serviceType or serviceId is required" },
      400
    );
  }

  const ts = parseTimestamp(payload.timestamp);
  const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabaseAdmin.rpc(
    "generate_request_code_for_service",
    {
      p_service: pService,
      p_timestamp: ts.toISOString(),
    }
  );

  if (error) {
    return jsonResponse({ ok: false, error: error.message }, 500);
  }

  return jsonResponse({
    ok: true,
    serviceType: fromType || null,
    serviceId: fromServiceId || null,
    timestamp: ts.toISOString(),
    request_code: data,
  });
});
