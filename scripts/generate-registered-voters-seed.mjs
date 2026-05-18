/**
 * Reads mock_voters_export.csv (from xlsx-cli) and prints SQL INSERT lines.
 * Run: node scripts/generate-registered-voters-seed.mjs > supabase/migrations/_seed_fragment.sql
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath =
  process.argv[2] || path.join(__dirname, "..", "mock_voters_export.csv");
const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.trim().split(/\r?\n/).filter(Boolean);
const header = lines.shift();
if (!header.startsWith("First Name")) {
  throw new Error("Unexpected CSV header: " + header);
}

function parseCsvLine(line) {
  const parts = [];
  let cur = "";
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      i += 1;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i += 1;
          break;
        }
        cur += line[i];
        i += 1;
      }
      continue;
    }
    if (c === ",") {
      parts.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  parts.push(cur);
  return parts;
}

function sqlStr(s) {
  return "'" + String(s ?? "").replace(/'/g, "''") + "'";
}

function parseBirthDdMmYyyy(s) {
  const t = String(s).trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) throw new Error("Bad birthdate: " + s);
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const y = m[3];
  return `${y}-${mo}-${d}`;
}

function sexToDb(s) {
  const x = String(s).trim().toLowerCase();
  if (x === "male" || x === "m") return "M";
  if (x === "female" || x === "f") return "F";
  throw new Error("Bad sex: " + s);
}

const rows = [];
for (const line of lines) {
  const [
    firstName,
    middleName,
    lastName,
    suffix,
    age,
    sex,
    birthdate,
    barangay,
    voterId,
  ] = parseCsvLine(line);
  rows.push({
    first_name: firstName.trim(),
    middle_name: (middleName || "").trim(),
    last_name: lastName.trim(),
    suffix: (suffix || "").trim(),
    age: parseInt(age, 10),
    sex: sexToDb(sex),
    birth_date: parseBirthDdMmYyyy(birthdate),
    barangay: barangay.trim(),
    voter_id: voterId.trim(),
  });
}

console.log("-- Seed from mockdata.xlsx (108 rows)");
console.log("insert into public.registered_voters (first_name, middle_name, last_name, suffix, age, sex, birth_date, barangay, voter_id)");
console.log("values");
console.log(
  rows
    .map(
      (r) =>
        `  (${sqlStr(r.first_name)}, ${sqlStr(r.middle_name)}, ${sqlStr(r.last_name)}, ${sqlStr(
          r.suffix
        )}, ${r.age}, ${sqlStr(r.sex)}::char(1), ${sqlStr(r.birth_date)}::date, ${sqlStr(
          r.barangay
        )}, ${sqlStr(r.voter_id)})`
    )
    .join(",\n") + "\n"
);
console.log("on conflict (voter_id) do nothing;");
