import { authorizeRequest, getServiceClient } from "../_shared/client.ts";
import { jsonResponse, preflight } from "../_shared/cors.ts";

/**
 * POST /functions/v1/super-admin-voters-management
 *
 * Superadmin registered-voters directory + barangay reference reads/writes.
 * Auth: JWT user must pass is_superadmin().
 *
 * Actions:
 *  - listRegisteredVoters
 *  - listBarangays
 *  - createRegisteredVoter
 *  - createRegisteredVotersBatch
 */

const SELECT_COLUMNS =
  "id, first_name, middle_name, last_name, suffix, age, sex, birth_date, barangay_id, voter_id, created_at, updated_at";
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
  voter?: VoterInput;
  payloads?: VoterInput[];
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

function buildRegisteredVoterFullName(row: Record<string, unknown>) {
  const parts = [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.join(" ") || "—";
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
    barangay: barangayObj?.name ?? "",
    voterIdNumber: row.voter_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toInsertPayload(input: VoterInput) {
  const firstName = String(input?.firstName ?? "").trim();
  const lastName = String(input?.lastName ?? "").trim();
  const voterId = String(input?.voterId ?? "").trim();
  const barangayId = String(input?.barangayId ?? "").trim();
  const sex = String(input?.sex ?? "").trim();
  const birthdate = String(input?.birthdate ?? "").trim();
  const age = Number(input?.age);

  if (!firstName || !lastName) {
    throw new Error("First name and last name are required.");
  }
  if (!voterId) {
    throw new Error("Voter ID is required.");
  }
  if (!barangayId) {
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
    voter_id: voterId,
  };
}

async function createOne(
  supabase: ReturnType<typeof getServiceClient>,
  input: VoterInput
) {
  const payload = toInsertPayload(input);
  const { data, error } = await supabase
    .from("registered_voters")
    .insert(payload)
    .select(SELECT_WITH_BARANGAY)
    .single();
  if (error) throw error;
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
      const { data, error } = await supabase
        .from("barangays")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return jsonResponse({
        success: true,
        action,
        barangays: (data || []).map((row) => ({
          id: row.id,
          name: row.name ?? "",
        })),
      });
    }

    if (action === "createRegisteredVoter") {
      try {
        const voter = await createOne(supabase, body.voter ?? {});
        return jsonResponse({ success: true, action, voter });
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
          "Invalid action. Use listRegisteredVoters, listBarangays, createRegisteredVoter, or createRegisteredVotersBatch.",
      },
      400
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
