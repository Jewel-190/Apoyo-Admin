import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DbWebhookDeletePayload = {
  type: "DELETE";
  table: string;
  schema: string;
  record: null;
  old_record: Record<string, unknown>;
};

type LegacyCleanupPayload = {
  bucket?: string;
  paths?: string[];
  table?: string;
  op?: string;
  row_id?: string;
};

type StorageObjectRow = {
  id: string;
  bucket_id: string;
  path_tokens?: string[] | null;
  name?: string | null;
};

const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const REQUEST_BUCKET_BY_TABLE: Record<string, string> = {
  assistance_requests: "request-documents",
  hospitalization_requests: "request-documents",
  treatment_requests: "request-documents",
  medical_requests: "request-documents",
  financial_requests: "request-documents",
  monetary_requests: "request-documents",
  burial_requests: "request-documents",
  cremation_requests: "request-documents",
  columbarium_requests: "request-documents",
};

const REQUEST_TABLES_BY_BUCKET: Record<string, string[]> =
  Object.entries(REQUEST_BUCKET_BY_TABLE).reduce<Record<string, string[]>>((acc, [table, bucket]) => {
    acc[bucket] = acc[bucket] ? [...acc[bucket], table] : [table];
    return acc;
  }, {});

const supabaseAdmin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function extractStorageObjectKey(oldRecord: Record<string, unknown>): {
  objectId?: string;
  bucketId?: string;
  objectPath?: string;
} {
  const objectId =
    (oldRecord.storage_object_id as string | undefined) ??
    (oldRecord.object_id as string | undefined) ??
    (oldRecord.storageObjectId as string | undefined);

  const bucketId =
    (oldRecord.bucket_id as string | undefined) ??
    (oldRecord.storage_bucket as string | undefined) ??
    (oldRecord.bucketId as string | undefined);

  const objectPath =
    (oldRecord.storage_path as string | undefined) ??
    (oldRecord.object_path as string | undefined) ??
    (oldRecord.path as string | undefined) ??
    (oldRecord.name as string | undefined);

  return { objectId, bucketId, objectPath };
}

function objectPathFromRow(so: StorageObjectRow): string {
  if (so.path_tokens && so.path_tokens.length > 0) {
    return so.path_tokens.join("/");
  }
  if (so.name) {
    return so.name;
  }
  throw new Error("Unable to determine storage object path from storage.objects row");
}

function toCleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueNonEmptyPaths(paths: string[]): string[] {
  return [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
}

async function filterInactiveAttachmentPaths(bucketId: string, paths: string[]): Promise<{
  removable: string[];
  active: string[];
}> {
  const candidates = uniqueNonEmptyPaths(paths);
  if (candidates.length === 0) {
    return { removable: [], active: [] };
  }

  const { data, error } = await supabaseAdmin
    .from("request_attachments")
    .select("path")
    .in("path", candidates);

  if (error) {
    throw new Error(`Failed to check active request attachments: ${error.message}`);
  }

  const activeSet = new Set(
    ((data ?? []) as Array<{ path?: string }>).map((row) => String(row.path ?? "")).filter(Boolean)
  );
  const active = candidates.filter((path) => activeSet.has(path));
  const removable = candidates.filter((path) => !activeSet.has(path));
  return { removable, active };
}

function isDeleteEvent(payload: Record<string, unknown>): boolean {
  const type = String(payload.type ?? "").toUpperCase();
  const op = String(payload.op ?? payload.event ?? "").toUpperCase();
  return type === "DELETE" || op === "DELETE";
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!PROJECT_URL || !SERVICE_ROLE_KEY) {
    return new Response("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", { status: 500 });
  }

  const expectedSecret = Deno.env.get("STORAGE_CLEANUP_HOOK_SECRET") ?? "";
  if (expectedSecret) {
    const providedSecret = request.headers.get("x-cleanup-secret") ?? "";
    if (providedSecret !== expectedSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  try {
    const legacyPayload = payload as LegacyCleanupPayload;
    const legacyBucket = toCleanString(legacyPayload.bucket);
    const legacyPaths = Array.isArray(legacyPayload.paths)
      ? legacyPayload.paths.map((p) => String(p).trim()).filter(Boolean)
      : [];

    if (legacyBucket && legacyPaths.length > 0) {
      const uniquePaths = uniqueNonEmptyPaths(legacyPaths);
      const { removable, active } = await filterInactiveAttachmentPaths(legacyBucket, uniquePaths);

      if (removable.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            deleted: false,
            mode: "legacy-bucket-paths",
            bucket: legacyBucket,
            removed: 0,
            skipped_active: active,
            reason: "All provided paths are still referenced in request_attachments",
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const { error: rmErr } = await supabaseAdmin.storage.from(legacyBucket).remove(removable);

      if (rmErr) {
        return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          mode: "legacy-bucket-paths",
          bucket: legacyBucket,
          removed: removable.length,
          paths: removable,
          skipped_active: active,
          meta: {
            table: legacyPayload.table ?? null,
            op: legacyPayload.op ?? null,
            row_id: legacyPayload.row_id ?? null,
          },
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (!isDeleteEvent(payload)) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "Expected DELETE event or legacy bucket/paths payload",
          got_type: payload.type ?? null,
          got_op: payload.op ?? payload.event ?? null,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const oldRecord = payload.old_record as Record<string, unknown> | undefined;
    if (!oldRecord || typeof oldRecord !== "object") {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: "Missing old_record",
          keys: Object.keys(payload),
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const key = extractStorageObjectKey(oldRecord);

    if (key.objectId) {
      const { data: so, error: soErr } = await supabaseAdmin
        .schema("storage")
        .from("objects")
        .select("id,bucket_id,path_tokens,name")
        .eq("id", key.objectId)
        .maybeSingle();

      if (soErr || !so) {
        return new Response(
          JSON.stringify({
            ok: true,
            deleted: false,
            reason: "storage.objects row not found",
            objectId: key.objectId,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const objectPath = objectPathFromRow(so as StorageObjectRow);
      const { removable, active } = await filterInactiveAttachmentPaths(so.bucket_id, [objectPath]);

      if (removable.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            deleted: false,
            reason: "Path is still referenced in request_attachments",
            bucket: so.bucket_id,
            path: objectPath,
            active,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const { error: rmErr } = await supabaseAdmin.storage.from(so.bucket_id).remove(removable);

      if (rmErr) {
        return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          bucket: so.bucket_id,
          path: removable[0],
          skipped_active: active,
          objectId: so.id,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (key.bucketId && key.objectPath) {
      const { removable, active } = await filterInactiveAttachmentPaths(key.bucketId, [key.objectPath]);

      if (removable.length === 0) {
        return new Response(
          JSON.stringify({
            ok: true,
            deleted: false,
            mode: "delete-webhook-bucket-path",
            bucket: key.bucketId,
            path: key.objectPath,
            reason: "Path is still referenced in request_attachments",
            active,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      const { error: rmErr } = await supabaseAdmin.storage.from(key.bucketId).remove(removable);

      if (rmErr) {
        return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          mode: "delete-webhook-bucket-path",
          bucket: key.bucketId,
          path: removable[0],
          skipped_active: active,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        reason:
          "No storage object reference found in old_record. Expected storage_object_id or bucket_id+storage_path",
        old_record_keys: Object.keys(oldRecord),
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
