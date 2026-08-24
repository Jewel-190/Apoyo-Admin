import { supabase } from "./supabaseClient";

const FUNCTION_NAME = "super-admin-voters-management";

export function buildRegisteredVoterFullName(row) {
  const parts = [
    row?.first_name,
    row?.middle_name,
    row?.last_name,
    row?.suffix,
  ]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.join(" ") || "—";
}

/** Maps a DB row shape if ever needed client-side; primary mapping happens in the edge function. */
export function mapRegisteredVoterRow(row) {
  if (!row) return null;
  if (row.firstName != null || row.voterIdNumber != null) {
    return row;
  }
  const sexLabel = row.sex === "F" ? "Female" : row.sex === "M" ? "Male" : row.sex;
  const barangayJoin = Array.isArray(row.barangays) ? row.barangays[0] : row.barangays;
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
    barangay: row.barangay_name || barangayJoin?.name || "",
    voterIdNumber: row.voter_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stringifyErrorField(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (typeof value.message === "string" && value.message.trim()) return value.message;
    if (value.error != null) return stringifyErrorField(value.error);
    try {
      return JSON.stringify(value);
    } catch {
      return "Voters management request failed.";
    }
  }
  return String(value);
}

async function readInvokeErrorDetail(error, data) {
  const fromData = stringifyErrorField(data?.error) || stringifyErrorField(data?.message);
  if (fromData) return fromData;

  const context = error?.context;
  if (context && typeof context.json === "function") {
    try {
      const payload = await context.json();
      const fromPayload =
        stringifyErrorField(payload?.error) || stringifyErrorField(payload?.message);
      if (fromPayload) return fromPayload;
    } catch {
      // ignore
    }
  }

  return stringifyErrorField(error?.message) || "Voters management request failed.";
}

async function invokeVotersManagement(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body });
  if (error) {
    throw new Error(await readInvokeErrorDetail(error, data));
  }
  if (!data?.success) {
    throw new Error(stringifyErrorField(data?.error) || "Voters management request failed.");
  }
  return data;
}

export async function fetchRegisteredVoters() {
  const data = await invokeVotersManagement({ action: "listRegisteredVoters" });
  return (data.voters || []).map(mapRegisteredVoterRow);
}

export async function insertRegisteredVoter({
  firstName,
  middleName,
  lastName,
  suffix,
  age,
  sex,
  birthdate,
  barangayId,
  voterId,
}) {
  const data = await invokeVotersManagement({
    action: "createRegisteredVoter",
    voter: {
      firstName,
      middleName,
      lastName,
      suffix,
      age,
      sex,
      birthdate,
      barangayId,
      voterId,
    },
  });
  return mapRegisteredVoterRow(data.voter);
}

export async function updateRegisteredVoter(id, voter) {
  const data = await invokeVotersManagement({
    action: "updateRegisteredVoter",
    id,
    voter,
  });
  return mapRegisteredVoterRow(data.voter);
}

export async function deleteRegisteredVoter(id) {
  await invokeVotersManagement({
    action: "deleteRegisteredVoter",
    id,
  });
}

export async function lookupRegisteredVoterByVin(voterId) {
  const data = await invokeVotersManagement({
    action: "lookupRegisteredVoter",
    voterId,
  });
  return data.voter ? mapRegisteredVoterRow(data.voter) : null;
}

/**
 * Inserts many voters sequentially so one duplicate does not abort the whole batch.
 * Each insert goes through the edge function (same auth/write path as individual create).
 * @param {Array<{ firstName: string, middleName: string, lastName: string, suffix: string, age: string|number, sex: 'M'|'F', birthdate: string, barangayId: string, voterId: string }>} payloads
 * @param {{ onProgress?: (completed: number, total: number) => void }} [options]
 */
export async function insertRegisteredVotersBatch(payloads, options = {}) {
  const { onProgress } = options;
  const total = payloads.length;
  const inserted = [];
  const skippedDuplicate = [];
  const failed = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    try {
      inserted.push(await insertRegisteredVoter(payload));
    } catch (e) {
      const msg = e?.message || String(e);
      if (/duplicate|unique/i.test(msg)) {
        skippedDuplicate.push({ voterId: payload.voterId, message: msg });
      } else {
        failed.push({ voterId: payload.voterId, message: msg });
      }
    }
    onProgress?.(index + 1, total);
  }
  return { inserted, skippedDuplicate, failed };
}
