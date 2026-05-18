import { supabase } from "./supabaseClient";

const SELECT_COLUMNS =
  "id, first_name, middle_name, last_name, suffix, age, sex, birth_date, barangay_id, voter_id, created_at, updated_at";

const SELECT_WITH_BARANGAY = `${SELECT_COLUMNS}, barangays ( id, name )`;

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

export function mapRegisteredVoterRow(row) {
  if (!row) return null;
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
    barangay: barangayJoin?.name ?? "",
    voterIdNumber: row.voter_id ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchRegisteredVoters() {
  const { data, error } = await supabase
    .from("registered_voters")
    .select(SELECT_WITH_BARANGAY)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapRegisteredVoterRow);
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
  const payload = {
    first_name: firstName.trim(),
    middle_name: (middleName || "").trim(),
    last_name: lastName.trim(),
    suffix: (suffix || "").trim(),
    age: Number(age),
    sex,
    birth_date: birthdate,
    barangay_id: barangayId,
    voter_id: voterId.trim(),
  };

  const { data, error } = await supabase
    .from("registered_voters")
    .insert(payload)
    .select(SELECT_WITH_BARANGAY)
    .single();

  if (error) {
    throw error;
  }

  return mapRegisteredVoterRow(data);
}

/**
 * Inserts many voters sequentially so one duplicate does not abort the whole batch.
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
