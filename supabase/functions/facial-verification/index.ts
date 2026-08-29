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
const MIN_LIVENESS_FRAMES = 4;
const FACE_VERIFY_FETCH_TIMEOUT_MS = 180_000;

type RequestBody = {
  warmup?: boolean;
  email?: string;
  registrationAttemptToken?: string;
  idImageBase64?: string;
  selfieImageBase64?: string;
  livenessFramesBase64?: string[];
  poseLabels?: string[];
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

type VerifierResponse = {
  ok?: boolean;
  verified?: boolean;
  liveness_passed?: boolean;
  similarity?: number;
  threshold?: number;
  error?: string;
  code?: string;
};

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
          "Face verification service is not configured (set FACE_VERIFY_SERVICE_URL and FACE_VERIFY_SERVICE_KEY).",
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
  const selfieB64 = (body.selfieImageBase64 ?? "").toString();
  const livenessFrames = Array.isArray(body.livenessFramesBase64)
    ? body.livenessFramesBase64.filter((f) => typeof f === "string" && f.trim())
    : [];
  const poseLabels = Array.isArray(body.poseLabels)
    ? body.poseLabels.filter((p) => typeof p === "string" && p.trim())
    : [];

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(tokenStr)) {
    return jsonResponse({ ok: false, error: "Invalid registration token" }, 200);
  }

  if (!email) {
    return jsonResponse({ ok: false, error: "Missing email" }, 200);
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

  if (body.warmup === true) {
    try {
      const warmRes = await fetch(`${FACE_VERIFY_SERVICE_URL}/warmup`, {
        method: "POST",
        headers: { "x-api-key": FACE_VERIFY_SERVICE_KEY },
        signal: AbortSignal.timeout(FACE_VERIFY_FETCH_TIMEOUT_MS),
      });
      const payload = (await warmRes.json()) as { ok?: boolean; ready?: boolean };
      return jsonResponse({
        ok: payload.ok ?? warmRes.ok,
        ready: payload.ready ?? false,
        code: "WARM",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("face_verifier_warmup", msg);
      return jsonResponse(
        {
          ok: false,
          error: "Face verification is still starting up. Try again in a moment.",
          code: "WARMUP_FAILED",
        },
        200,
      );
    }
  }

  if (!selfieB64) {
    return jsonResponse({ ok: false, error: "Missing selfieImageBase64" }, 200);
  }

  if (!idB64) {
    return jsonResponse({ ok: false, error: "Missing idImageBase64" }, 200);
  }

  if (livenessFrames.length < MIN_LIVENESS_FRAMES) {
    return jsonResponse(
      {
        ok: false,
        error: `Live check requires at least ${MIN_LIVENESS_FRAMES} camera frames.`,
        code: "LIVENESS_FRAMES_REQUIRED",
      },
      200,
    );
  }

  for (const img of [idB64, selfieB64, ...livenessFrames]) {
    const size = estimateBase64Bytes(img);
    if (size < 100) {
      return jsonResponse({ ok: false, error: "Image too small" }, 200);
    }
    if (size > MAX_IMAGE_BYTES) {
      return jsonResponse({ ok: false, error: "Image too large (max 15 MB)" }, 200);
    }
  }

  try {
    const verifyRes = await fetch(`${FACE_VERIFY_SERVICE_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": FACE_VERIFY_SERVICE_KEY,
      },
      body: JSON.stringify({
        id_image_base64: idB64,
        selfie_image_base64: selfieB64,
        liveness_frames_base64: livenessFrames,
        pose_labels: poseLabels,
      }),
      signal: AbortSignal.timeout(FACE_VERIFY_FETCH_TIMEOUT_MS),
    });

    const raw = await verifyRes.text();
    let payload: VerifierResponse = {};
    try {
      payload = JSON.parse(raw) as VerifierResponse;
    } catch {
      console.error("face_verifier_non_json", verifyRes.status, raw.slice(0, 200));
      return jsonResponse(
        {
          ok: false,
          error: "Face comparison is busy. Wait 30 seconds and try again.",
          code: "VERIFIER_BAD_RESPONSE",
        },
        200,
      );
    }

    if (!verifyRes.ok && !payload?.error) {
      return jsonResponse(
        { ok: false, error: "Face verification service unavailable." },
        200,
      );
    }

    return jsonResponse({
      ok: payload.ok ?? false,
      verified: payload.verified ?? false,
      liveness_passed: payload.liveness_passed ?? false,
      similarity: payload.similarity ?? 0,
      threshold: payload.threshold,
      error: payload.error,
      code: payload.code,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("face_verifier_request", msg);
    return jsonResponse(
      { ok: false, error: "Face verification service unreachable. Try again." },
      200,
    );
  }
});
