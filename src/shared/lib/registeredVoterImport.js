import { barangayIdForName, resolveBarangayName } from "./barangays";
import {
  formatRegisteredVoterId,
  REGISTERED_VOTER_ID_PATTERN,
  validateRegisteredVoterField,
} from "./registeredVoterValidation";

/** Exact column labels expected on row 1 (case-insensitive); middle name and suffix may be empty cells. */
export const REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS = [
  "First Name",
  "Middle Name",
  "Last Name",
  "Suffix",
  "Age",
  "Sex",
  "Birthdate",
  "Barangay",
  "Voter ID Number",
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 2000;

const HEADER_SYNONYMS = [
  ["firstName", ["first name", "firstname", "given name"]],
  ["middleName", ["middle name", "middlename", "middle"]],
  ["lastName", ["last name", "lastname", "surname", "family name"]],
  ["suffix", ["suffix"]],
  ["age", ["age"]],
  ["sex", ["sex", "gender"]],
  ["birthdate", ["birthdate", "birth date", "date of birth", "dob", "birthday"]],
  ["barangay", ["barangay", "brgy", "barangay name"]],
  ["voterIdNumber", ["voter id number", "voter id no", "voter id", "voterid", "voter id #"]],
];

const REQUIRED_KEYS = ["firstName", "lastName", "age", "sex", "birthdate", "barangay", "voterIdNumber"];

function normalizeHeaderLabel(s) {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[#:]/g, "");
}

function buildSynonymToField() {
  const m = new Map();
  for (const [field, labels] of HEADER_SYNONYMS) {
    for (const label of labels) {
      m.set(label, field);
    }
  }
  return m;
}

const SYNONYM_TO_FIELD = buildSynonymToField();

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((cell) => String(cell).trim());
}

export function parseCsvToMatrix(text) {
  const t = String(text).replace(/^\uFEFF/, "");
  const lines = t.split(/\r?\n/).filter((line) => line.replace(/,/g, "").trim().length > 0);
  return lines.map(parseCsvLine);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatYmdFromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function excelSerialToUtcDate(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(serial * 86400000));
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function spreadsheetCellToString(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return formatYmdFromDate(v);
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 20000 && v < 1000000) {
      const d = excelSerialToUtcDate(v);
      const ymd = formatYmdFromDate(d);
      if (ymd) return ymd;
    }
    if (Number.isInteger(v) && v >= 1 && v <= 120) return String(v);
    return String(v);
  }
  return String(v).trim();
}

/**
 * @param {string} s
 * @returns {string | null} YYYY-MM-DD or null
 */
export function parseBirthdateToIso(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const mo = Number(iso[2]);
    const da = Number(iso[3]);
    const d = new Date(y, mo - 1, da);
    if (d.getFullYear() === y && d.getMonth() === mo - 1 && d.getDate() === da) return `${y}-${pad2(mo)}-${pad2(da)}`;
    return null;
  }

  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const t = new Date(`${raw}T00:00:00`);
  if (!Number.isNaN(t.getTime())) return formatYmdFromDate(t);
  return null;
}

/**
 * @param {string} raw
 * @returns {"Male" | "Female" | ""}
 */
function parseSexLabel(raw) {
  const x = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!x) return "";
  if (x === "m" || x === "male") return "Male";
  if (x === "f" || x === "female") return "Female";
  return "";
}

/**
 * @param {string[]} headerCells
 * @returns {{ ok: true, col: Record<string, number> } | { ok: false, message: string }}
 */
export function mapImportHeaderRow(headerCells) {
  const col = {};
  for (let index = 0; index < headerCells.length; index += 1) {
    const field = SYNONYM_TO_FIELD.get(normalizeHeaderLabel(headerCells[index]));
    if (!field) continue;
    if (col[field] !== undefined) {
      return { ok: false, message: `Duplicate column for “${field}”. Remove the extra column and try again.` };
    }
    col[field] = index;
  }
  const missing = REQUIRED_KEYS.filter((k) => col[k] === undefined);
  if (missing.length) {
    return {
      ok: false,
      message: `Missing required column(s): ${missing.join(", ")}. First row must include: ${REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS.join(", ")}.`,
    };
  }
  return { ok: true, col };
}

function rowIsEmpty(cells) {
  return cells.every((c) => String(c ?? "").trim() === "");
}

/**
 * @param {string[][]} matrix
 * @param {{ existingVoterIds?: Set<string>, barangayNameSet?: Set<string>, barangaysByName?: Map<string, { id: string, name: string }> }} options
 */
export function buildRegisteredVoterImportPreview(matrix, options = {}) {
  const existingVoterIds = options.existingVoterIds ?? new Set();
  const barangayNameSet = options.barangayNameSet ?? new Set();
  const barangaysByName = options.barangaysByName ?? new Map();
  const validationContext = { allowedBarangayNames: barangayNameSet };
  if (!matrix.length) {
    return { parseError: "The file is empty.", rows: [], summary: emptySummary() };
  }

  const headerRow = matrix[0].map((c) => String(c ?? "").trim());
  const mapped = mapImportHeaderRow(headerRow);
  if (!mapped.ok) {
    return { headerError: mapped.message, rows: [], summary: emptySummary() };
  }
  const { col } = mapped;

  const dataRows = matrix.slice(1).filter((r) => !rowIsEmpty(r));
  if (dataRows.length > MAX_DATA_ROWS) {
    return {
      parseError: `This import allows at most ${MAX_DATA_ROWS} data rows. Split the file and try again.`,
      rows: [],
      summary: emptySummary(),
    };
  }

  const seenVoterIdKeys = new Set();
  const rows = [];

  dataRows.forEach((cells, i) => {
    const sheetRow = i + 2;
    const get = (field) => {
      const idx = col[field];
      if (idx === undefined) return "";
      return spreadsheetCellToString(cells[idx]);
    };

    const firstName = get("firstName");
    const middleName = get("middleName");
    const lastName = get("lastName");
    const suffix = get("suffix");
    const ageStr = get("age");
    const sexLabel = parseSexLabel(get("sex"));
    const birthRaw = get("birthdate");
    const birthdate = parseBirthdateToIso(birthRaw) || "";
    const barangay = resolveBarangayName(get("barangay"), barangayNameSet);
    const voterRaw = get("voterIdNumber");
    const voterIdNumber = formatRegisteredVoterId(voterRaw);

    const record = {
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      suffix: suffix.trim(),
      age: String(ageStr).trim(),
      sex: sexLabel,
      birthdate,
      barangay,
      voterIdNumber,
    };

    const errors = [];
    const keys = ["firstName", "middleName", "lastName", "suffix", "age", "sex", "birthdate", "barangay", "voterIdNumber"];
    for (const key of keys) {
      const err = validateRegisteredVoterField(key, record[key], record, validationContext);
      if (err) errors.push(`${key}: ${err}`);
    }

    const idDupKey = REGISTERED_VOTER_ID_PATTERN.test(voterIdNumber)
      ? voterIdNumber.replace(/[^0-9A-Za-z]/gi, "").toUpperCase()
      : "";

    let duplicateInFile = false;
    if (idDupKey) {
      if (seenVoterIdKeys.has(idDupKey)) {
        duplicateInFile = true;
        errors.push("Duplicate Voter ID within this file (only the first row for this ID may import).");
      } else {
        seenVoterIdKeys.add(idDupKey);
      }
    }

    let duplicateInDb = false;
    if (idDupKey && existingVoterIds.has(idDupKey)) {
      duplicateInDb = true;
      errors.push("This Voter ID is already in the directory.");
    }

    const barangayId = barangayIdForName(record.barangay, barangaysByName);
    if (!errors.length && record.barangay && !barangayId) {
      errors.push("barangay: Choose a valid barangay from the list.");
    }

    const isValid = errors.length === 0;
    const sexDb = record.sex === "Female" ? "F" : record.sex === "Male" ? "M" : "";
    const insertPayload =
      isValid && sexDb && barangayId
        ? {
            firstName: record.firstName,
            middleName: record.middleName,
            lastName: record.lastName,
            suffix: record.suffix,
            age: record.age,
            sex: sexDb,
            birthdate: record.birthdate,
            barangayId,
            voterId: record.voterIdNumber,
          }
        : null;

    rows.push({
      sheetRow,
      record,
      rawPreview: {
        firstName,
        middleName,
        lastName,
        suffix,
        age: ageStr,
        sex: get("sex"),
        birthdate: birthRaw,
        barangay: get("barangay"),
        voterIdNumber: voterRaw,
      },
      errors,
      duplicateInFile,
      duplicateInDb,
      isValid,
      insertPayload,
    });
  });

  const valid = rows.filter((r) => r.isValid).length;
  const invalid = rows.length - valid;
  return {
    rows,
    summary: {
      total: rows.length,
      valid,
      invalid,
    },
  };
}

function emptySummary() {
  return { total: 0, valid: 0, invalid: 0 };
}

/**
 * @param {File} file
 * @param {{ existingVoterIds?: Set<string>, barangayNameSet?: Set<string>, barangaysByName?: Map<string, { id: string, name: string }> }} options
 */
export async function parseRegisteredVoterBatchFile(file, options = {}) {
  if (!file) {
    return { parseError: "No file selected.", rows: [], summary: emptySummary() };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      parseError: `File is too large (max ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB).`,
      rows: [],
      summary: emptySummary(),
    };
  }

  const name = file.name.toLowerCase();
  const isCsv = name.endsWith(".csv");
  const isXls = name.endsWith(".xls") && !name.endsWith(".xlsx");
  const isXlsx = name.endsWith(".xlsx") || isXls;
  if (!isCsv && !isXlsx) {
    return { parseError: "Please choose a .csv, .xls, or .xlsx file.", rows: [], summary: emptySummary() };
  }

  let matrix;
  try {
    if (isCsv) {
      const text = await file.text();
      matrix = parseCsvToMatrix(text);
    } else {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        return { parseError: "Workbook has no sheets.", rows: [], summary: emptySummary() };
      }
      const ws = wb.Sheets[sheetName];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }).map((row) => row.map(spreadsheetCellToString));
    }
  } catch {
    return { parseError: "Could not read that file. Export again or save as CSV.", rows: [], summary: emptySummary() };
  }

  const preview = buildRegisteredVoterImportPreview(matrix, options);
  return { fileName: file.name, ...preview };
}
