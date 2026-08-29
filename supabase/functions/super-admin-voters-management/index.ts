import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";
import { AUDIT_MODULES, createAuditor, formatPersonAuditLabel } from "../_shared/auditTrail.ts";

/**
 * POST /functions/v1/super-admin-voters-management
 *
 * Superadmin registered-voters directory + barangay reference reads/writes.
 * Auth: JWT user must pass is_superadmin().
 *
 * Actions:
 *  - listRegisteredVoters
 *  - listBarangays
 *  - createBarangay
 *  - updateBarangay
 *  - deleteBarangay   (hard-delete catalog row; voter/user snapshots are kept)
 *  - restoreBarangay
 *  - lookupRegisteredVoter
 *  - createRegisteredVoter
 *  - updateRegisteredVoter
 *  - deleteRegisteredVoter
 *  - createRegisteredVotersBatch
 */

const SELECT_COLUMNS =
  "id, first_name, middle_name, last_name, suffix, age, sex, birth_date, barangay_id, barangay_name, voter_id, created_at, updated_at";
const SELECT_WITH_BARANGAY = `${SELECT_COLUMNS}, barangays ( id, name )`;

type VoterInput = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  age?: string | number;
  sex?: string;
  birthdate?: string;
  barangayId?: string;
  voterId?: string;
};

type Payload = {
  action?: string;
  id?: string;
  voterId?: string;
  voter?: VoterInput;
  payloads?: VoterInput[];
  barangayId?: string;
  name?: string;
};

function isUniqueViolation(error: unknown) {
  const err = error as { code?: string; message?: string };
  return err?.code === "23505" || /duplicate|unique/i.test(String(err?.message ?? ""));
}

function normalizeBarangayName(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function assertBarangayName(name: string) {
  if (name.length < 2) {
    throw new Error("Barangay name must be at least 2 characters.");
  }
  if (name.length > 80) {
    throw new Error("Barangay name must be 80 characters or fewer.");
  }
  if (!/^[A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ .'\-]*$/.test(name)) {
    throw new Error("Use letters, numbers, spaces, periods, apostrophes, or hyphens.");
  }
}

function mapBarangayRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  const countWrap = row.registered_voters;
  const voterCount = Array.isArray(countWrap)
    ? Number((countWrap[0] as { count?: number } | undefined)?.count ?? 0)
    : Number((countWrap as { count?: number } | null)?.count ?? 0);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    isActive: row.is_active !== false,
    voterCount: Number.isFinite(voterCount) ? voterCount : 0,
  };
}

async function listBarangayRows(supabase: ReturnType<typeof getServiceClient>) {
  const withCounts = await supabase
    .from("barangays")
    .select("id, name, is_active, registered_voters(count)")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (!withCounts.error) {
    return (withCounts.data || [])
      .map((row) => mapBarangayRow(row as Record<string, unknown>))
      .filter(Boolean);
  }

  const { data, error } = await supabase
    .from("barangays")
    .select("id, name, is_active")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    isActive: row.is_active !== false,
    voterCount: 0,
  }));
}

async function findBarangayByName(
  supabase: ReturnType<typeof getServiceClient>,
  name: string
) {
  const { data, error } = await supabase
    .from("barangays")
    .select("id, name, is_active, registered_voters(count)")
    .ilike("name", name.replace(/[%_]/g, "\\$&"));
  if (error) throw error;
  const match = (data || []).find(
    (row) => String(row.name ?? "").toLowerCase() === name.toLowerCase()
  );
  return match ? mapBarangayRow(match as Record<string, unknown>) : null;
}

async function resolveBarangayForWrite(
  supabase: ReturnType<typeof getServiceClient>,
  barangayId: string,
  allowInactiveId = ""
) {
  const { data, error } = await supabase
    .from("barangays")
    .select("id, name, is_active")
    .eq("id", barangayId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Choose a valid barangay from the list.");
  if (data.is_active === false && String(data.id) !== String(allowInactiveId || "")) {
    throw new Error(
      "That barangay was removed from the catalog. Add it again in Service settings before using it for new records."
    );
  }
  return { id: String(data.id), name: String(data.name ?? "") };
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

function buildRegisteredVoterFullName(row: Record<string, unknown>) {
  const parts = [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.join(" ") || "—";
}

function voterAuditLabel(row: Record<string, unknown> | null | undefined) {
  if (!row) return "";
  return formatPersonAuditLabel(
    row,
    String(row.voterIdNumber ?? row.voter_id ?? "")
  );
}

function mapRegisteredVoterRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  const sex = row.sex;
  const sexLabel = sex === "F" ? "Female" : sex === "M" ? "Male" : sex;
  const barangayJoin = Array.isArray(row.barangays) ? row.barangays[0] : row.barangays;
  const barangayObj =
    barangayJoin && typeof barangayJoin === "object"
      ? (barangayJoin as { id?: string; name?: string })
      : null;
  return {
    id: row.id,
    firstName: row.first_name ?? "",
    middleName: row.middle_name ?? "",
    lastName: row.last_name ?? "",
    suffix: row.suffix ?? "",
    fullName: buildRegisteredVoterFullName(row),
    age: String(row.age ?? ""),
    sex: sexLabel,
    sexDb: row.sex,
    birthdate: row.birth_date ?? "",
    barangayId: row.barangay_id ?? "",
    barangay: String(row.barangay_name || barangayObj?.name || ""),
    voterIdNumber: row.voter_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeVoterSex(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "M" || raw === "MALE") return "M";
  if (raw === "F" || raw === "FEMALE") return "F";
  return String(value ?? "").trim();
}

function toVoterRow(input: VoterInput, barangayName: string, barangayId: string | null) {
  const firstName = String(input?.firstName ?? "").trim();
  const lastName = String(input?.lastName ?? "").trim();
  const voterId = String(input?.voterId ?? "").trim();
  const sex = normalizeVoterSex(input?.sex);
  const birthdate = String(input?.birthdate ?? "").trim();
  const age = Number(input?.age);
  const snapshotName = String(barangayName ?? "").trim();

  if (!firstName || !lastName) {
    throw new Error("First name and last name are required.");
  }
  if (!voterId) {
    throw new Error("Voter ID is required.");
  }
  if (!snapshotName) {
    throw new Error("Barangay is required.");
  }
  if (sex !== "M" && sex !== "F") {
    throw new Error("Sex must be M or F.");
  }
  if (!birthdate) {
    throw new Error("Birthdate is required.");
  }
  if (!Number.isFinite(age)) {
    throw new Error("Age must be a number.");
  }

  return {
    first_name: firstName,
    middle_name: String(input?.middleName ?? "").trim(),
    last_name: lastName,
    suffix: String(input?.suffix ?? "").trim(),
    age,
    sex,
    birth_date: birthdate,
    barangay_id: barangayId,
    barangay_name: snapshotName,
    voter_id: voterId,
  };
}

async function createOne(
  supabase: ReturnType<typeof getServiceClient>,
  input: VoterInput
) {
  const barangayId = String(input?.barangayId ?? "").trim();
  const barangay = await resolveBarangayForWrite(supabase, barangayId);
  const payload = toVoterRow(input, barangay.name, barangay.id);
  const { data, error } = await supabase
    .from("registered_voters")
    .insert(payload)
    .select(SELECT_WITH_BARANGAY)
    .single();
  if (error) throw error;
  return mapRegisteredVoterRow(data as Record<string, unknown>);
}

async function updateOne(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
  input: VoterInput
) {
  const voterId = String(id || "").trim();
  if (!voterId) throw new Error("Voter record is required.");

  const { data: existing, error: existingError } = await supabase
    .from("registered_voters")
    .select("id, barangay_id, barangay_name")
    .eq("id", voterId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("Voter record not found.");

  const nextBarangayId = String(input?.barangayId ?? "").trim();
  const existingId = String(existing.barangay_id ?? "");
  const existingName = String(existing.barangay_name ?? "").trim();

  let barangayId: string | null;
  let snapshotName: string;
  if (!nextBarangayId) {
    if (!existingName) throw new Error("Barangay is required.");
    barangayId = existing.barangay_id ? String(existing.barangay_id) : null;
    snapshotName = existingName;
  } else {
    const barangay = await resolveBarangayForWrite(supabase, nextBarangayId, existingId);
    barangayId = barangay.id;
    snapshotName = existingId === barangay.id ? existingName || barangay.name : barangay.name;
  }
  const payload = toVoterRow(input, snapshotName, barangayId);

  const { data, error } = await supabase
    .from("registered_voters")
    .update(payload)
    .eq("id", voterId)
    .select(SELECT_WITH_BARANGAY)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Voter record not found.");
  return mapRegisteredVoterRow(data as Record<string, unknown>);
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

    if (action === "listRegisteredVoters") {
      const { data, error } = await supabase
        .from("registered_voters")
        .select(SELECT_WITH_BARANGAY)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({
        success: true,
        action,
        voters: (data || []).map((row) => mapRegisteredVoterRow(row as Record<string, unknown>)),
      });
    }

    if (action === "listBarangays") {
      const barangays = await listBarangayRows(supabase);
      return jsonResponse({
        success: true,
        action,
        barangays,
      });
    }

    if (action === "createBarangay") {
      try {
        const name = normalizeBarangayName(body.name);
        assertBarangayName(name);
        const existing = await findBarangayByName(supabase, name);
        if (existing?.isActive) {
          throw new Error("A barangay with that name already exists.");
        }
        if (existing && !existing.isActive) {
          const { data, error } = await supabase
            .from("barangays")
            .update({ name, is_active: true })
            .eq("id", existing.id)
            .select("id, name, is_active, registered_voters(count)")
            .single();
          if (error) throw error;
          return jsonResponse({
            success: true,
            action,
            barangay: mapBarangayRow(data as Record<string, unknown>),
          });
        }
        const { data, error } = await supabase
          .from("barangays")
          .insert({ name, is_active: true })
          .select("id, name, is_active, registered_voters(count)")
          .single();
        if (error) throw error;
        const barangay = mapBarangayRow(data as Record<string, unknown>);
        await auditor.record({
          action: "create",
          module: AUDIT_MODULES.DATA_BARANGAYS,
          resourceType: "barangay",
          resourceId: String(barangay?.id || existing?.id || ""),
          summary: `Created barangay ${name}`,
        });
        return jsonResponse({
          success: true,
          action,
          barangay,
        });
      } catch (err) {
        const message = isUniqueViolation(err)
          ? "A barangay with that name already exists."
          : err instanceof Error
            ? err.message
            : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "updateBarangay") {
      try {
        const barangayId = String(body.barangayId ?? "").trim();
        if (!barangayId) throw new Error("Barangay is required.");
        const name = normalizeBarangayName(body.name);
        assertBarangayName(name);
        const { data, error } = await supabase
          .from("barangays")
          .update({ name })
          .eq("id", barangayId)
          .select("id, name, is_active, registered_voters(count)")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Barangay not found.");
        return jsonResponse({
          success: true,
          action,
          barangay: mapBarangayRow(data as Record<string, unknown>),
        });
      } catch (err) {
        const message = isUniqueViolation(err)
          ? "A barangay with that name already exists."
          : err instanceof Error
            ? err.message
            : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "deleteBarangay") {
      try {
        const barangayId = String(body.barangayId ?? "").trim();
        if (!barangayId) throw new Error("Barangay is required.");
        const { data: existing, error: existingError } = await supabase
          .from("barangays")
          .select("id, name")
          .eq("id", barangayId)
          .maybeSingle();
        if (existingError) throw existingError;
        if (!existing) throw new Error("Barangay not found.");

        const catalogName = String(existing.name ?? "").trim();
        if (catalogName) {
          const emptySnap = supabase
            .from("registered_voters")
            .update({ barangay_name: catalogName })
            .eq("barangay_id", barangayId)
            .eq("barangay_name", "");
          const nullSnap = supabase
            .from("registered_voters")
            .update({ barangay_name: catalogName })
            .eq("barangay_id", barangayId)
            .is("barangay_name", null);
          const [emptyResult, nullResult] = await Promise.all([emptySnap, nullSnap]);
          if (emptyResult.error) throw emptyResult.error;
          if (nullResult.error) throw nullResult.error;
        }

        const { error } = await supabase.from("barangays").delete().eq("id", barangayId);
        if (error) throw error;
        await auditor.record({
          action: "delete",
          module: AUDIT_MODULES.DATA_BARANGAYS,
          resourceType: "barangay",
          resourceId: String(existing.id),
          summary: `Deleted barangay ${catalogName}`,
        });
        return jsonResponse({
          success: true,
          action,
          barangay: { id: String(existing.id), name: catalogName, isActive: false, voterCount: 0 },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "restoreBarangay") {
      try {
        const barangayId = String(body.barangayId ?? "").trim();
        if (!barangayId) throw new Error("Barangay is required.");
        const { data, error } = await supabase
          .from("barangays")
          .update({ is_active: true })
          .eq("id", barangayId)
          .select("id, name, is_active, registered_voters(count)")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Barangay not found.");
        return jsonResponse({
          success: true,
          action,
          barangay: mapBarangayRow(data as Record<string, unknown>),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "lookupRegisteredVoter") {
      const voterId = String(body.voterId ?? body.voter?.voterId ?? "").trim();
      if (!/^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$/.test(voterId)) {
        return jsonResponse({ success: true, action, voter: null });
      }
      const { data, error } = await supabase
        .from("registered_voters")
        .select(SELECT_COLUMNS)
        .eq("voter_id", voterId)
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({
        success: true,
        action,
        voter: data ? mapRegisteredVoterRow(data as Record<string, unknown>) : null,
      });
    }

    if (action === "createRegisteredVoter") {
      try {
        const voter = await createOne(supabase, body.voter ?? {});
        const voterRow = (voter || {}) as Record<string, unknown>;
        const voterLabel = voterAuditLabel(voterRow) || "unknown voter";
        await auditor.record({
          action: "create",
          module: AUDIT_MODULES.DATA_VOTERS,
          resourceType: "registered_voter",
          resourceId: String(voter?.id ?? ""),
          summary: `Created registered voter ${voterLabel}`,
          metadata: {
            voterIdNumber: voterRow.voterIdNumber ?? null,
            barangay: voterRow.barangay ?? null,
          },
        });
        return jsonResponse({ success: true, action, voter });
      } catch (err) {
        const message = isUniqueViolation(err)
          ? "That Voter ID is already registered."
          : err instanceof Error
            ? err.message
            : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "updateRegisteredVoter") {
      try {
        const voter = await updateOne(supabase, String(body.id ?? ""), body.voter ?? {});
        const voterRow = (voter || {}) as Record<string, unknown>;
        const voterLabel = voterAuditLabel(voterRow) || "unknown voter";
        await auditor.record({
          action: "update",
          module: AUDIT_MODULES.DATA_VOTERS,
          resourceType: "registered_voter",
          resourceId: String(voter?.id ?? body.id ?? ""),
          summary: `Updated registered voter ${voterLabel}`,
          metadata: {
            voterIdNumber: voterRow.voterIdNumber ?? null,
            barangay: voterRow.barangay ?? null,
          },
        });
        return jsonResponse({ success: true, action, voter });
      } catch (err) {
        const message = isUniqueViolation(err)
          ? "That Voter ID is already registered."
          : err instanceof Error
            ? err.message
            : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "deleteRegisteredVoter") {
      try {
        const voterId = String(body.id ?? "").trim();
        if (!voterId) throw new Error("Voter record is required.");
        const { data, error } = await supabase
          .from("registered_voters")
          .delete()
          .eq("id", voterId)
          .select("id, first_name, middle_name, last_name, suffix, voter_id, barangay_name")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Voter record not found.");
        const deleted = data as Record<string, unknown>;
        const voterLabel = voterAuditLabel(deleted) || String(data.id);
        await auditor.record({
          action: "delete",
          module: AUDIT_MODULES.DATA_VOTERS,
          resourceType: "registered_voter",
          resourceId: String(data.id),
          summary: `Deleted registered voter ${voterLabel}`,
          metadata: {
            voterIdNumber: deleted.voter_id ?? null,
            barangay: deleted.barangay_name ?? null,
          },
        });
        return jsonResponse({ success: true, action, id: data.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResponse({ success: false, error: message }, 400);
      }
    }

    if (action === "createRegisteredVotersBatch") {
      const payloads = Array.isArray(body.payloads) ? body.payloads : [];
      const inserted: unknown[] = [];
      const skippedDuplicate: { voterId: string; message: string }[] = [];
      const failed: { voterId: string; message: string }[] = [];

      for (const payload of payloads) {
        try {
          inserted.push(await createOne(supabase, payload ?? {}));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const voterId = String(payload?.voterId ?? "").trim();
          if (/duplicate|unique/i.test(msg)) {
            skippedDuplicate.push({ voterId, message: msg });
          } else {
            failed.push({ voterId, message: msg });
          }
        }
      }

      const labels = inserted
        .map((row) => voterAuditLabel((row || {}) as Record<string, unknown>))
        .filter(Boolean);
      if (inserted.length > 0) {
        await auditor.record({
          action: "create",
          module: AUDIT_MODULES.DATA_VOTERS,
          resourceType: "registered_voter",
          summary:
            inserted.length === 1
              ? `Created registered voter ${labels[0] || "unknown voter"}`
              : `Created ${inserted.length} registered voters`,
          metadata: {
            count: inserted.length,
            names: labels.slice(0, 50),
            skippedDuplicate: skippedDuplicate.length,
            failed: failed.length,
          },
        });
      }

      return jsonResponse({
        success: true,
        action,
        inserted,
        skippedDuplicate,
        failed,
      });
    }

    return jsonResponse(
      {
        error:
          "Invalid action. Use listRegisteredVoters, listBarangays, createBarangay, updateBarangay, deleteBarangay, restoreBarangay, lookupRegisteredVoter, createRegisteredVoter, updateRegisteredVoter, deleteRegisteredVoter, or createRegisteredVotersBatch.",
      },
      400
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
