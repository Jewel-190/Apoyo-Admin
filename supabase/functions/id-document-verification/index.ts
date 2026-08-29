import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflight, jsonResponse } from "../_shared/cors.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FACE_VERIFY_SERVICE_URL = (Deno.env.get("FACE_VERIFY_SERVICE_URL") ?? "").replace(
  /\/$/,
  "",
);
const FACE_VERIFY_SERVICE_KEY = Deno.env.get("FACE_VERIFY_SERVICE_KEY") ?? "";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type RequestBody = {
  email?: string;
  registrationAttemptToken?: string;
  idImageBase64?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  noMiddle?: boolean;
  birthDate?: string;
  voterIdNumber?: string;
  sex?: string;
};

function stripDataUrl(b64: string): string {
  const t = b64.trim();
  const idx = t.indexOf("base64,");
  if (idx === -1) return t.replace(/\s/g, "");
  return t.slice(idx + 7).replace(/\s/g, "");
}

function estimateBase64Bytes(b64: string): number {
  const clean = stripDataUrl(b64);
  return Math.floor((clean.length * 3) / 4);
}

async function validateRegistrationToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  tokenStr: string,
): Promise<boolean> {
  const { data: tokenOk, error: tokenErr } = await supabaseAdmin.rpc(
    "validate_registration_attempt_token",
    { p_token: tokenStr, p_email: email },
  );

  if (tokenErr) {
    console.error("validate_registration_attempt_token", tokenErr.message);
    return false;
  }
  return tokenOk === true;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return corsPreflight();
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 200);
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: "Server configuration error" }, 200);
  }

  if (!FACE_VERIFY_SERVICE_URL || !FACE_VERIFY_SERVICE_KEY) {
    return jsonResponse(
      {
        ok: false,
        error:
          "ID verification service is not configured (set FACE_VERIFY_SERVICE_URL and FACE_VERIFY_SERVICE_KEY).",
      },
      200,
    );
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 200);
  }

  const email = (body.email ?? "").toString().trim().toLowerCase();
  const tokenStr = (body.registrationAttemptToken ?? "").toString().trim();
  const idB64 = (body.idImageBase64 ?? "").toString();

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(tokenStr)) {
    return jsonResponse({ ok: false, error: "Invalid registration token" }, 200);
  }

  if (!email) {
    return jsonResponse({ ok: false, error: "Missing email" }, 200);
  }

  if (!idB64) {
    return jsonResponse({ ok: false, error: "Missing idImageBase64" }, 200);
  }

  const size = estimateBase64Bytes(idB64);
  if (size < 100) {
    return jsonResponse({ ok: false, error: "Image too small" }, 200);
  }
  if (size > MAX_IMAGE_BYTES) {
    return jsonResponse({ ok: false, error: "Image too large (max 15 MB)" }, 200);
  }

  const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const tokenOk = await validateRegistrationToken(supabaseAdmin, email, tokenStr);
  if (!tokenOk) {
    return jsonResponse(
      { ok: false, error: "Invalid or expired registration session" },
      200,
    );
  }

  try {
    const verifyRes = await fetch(`${FACE_VERIFY_SERVICE_URL}/verify-id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": FACE_VERIFY_SERVICE_KEY,
      },
      body: JSON.stringify({
        id_image_base64: idB64,
        profile: {
          first_name: body.firstName ?? "",
          middle_name: body.middleName ?? "",
          last_name: body.lastName ?? "",
          suffix: body.suffix ?? "",
          no_middle: body.noMiddle === true,
          birth_date: body.birthDate ?? "",
          voter_id: body.voterIdNumber ?? "",
          sex: body.sex ?? "",
        },
      }),
      signal: AbortSignal.timeout(110_000),
    });

    const payload = await verifyRes.json();

    if (!verifyRes.ok && !payload?.error) {
      return jsonResponse({ ok: false, error: "ID verification service unavailable." }, 200);
    }

    return jsonResponse({
      ok: payload.ok ?? false,
      verified: payload.verified ?? false,
      error: payload.error,
      code: payload.code,
      checks: payload.checks ?? [],
      ocr_preview: payload.ocr_preview,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("id_verifier_request", msg);
    return jsonResponse(
      { ok: false, error: "ID verification service unreachable. Try again." },
      200,
    );
  }
});
