import { REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS } from "./registeredVoterImport";

/** @param {Record<string, string>} voter */
export function registeredVoterToExportRow(voter) {
  return [
    voter.firstName ?? "",
    voter.middleName ?? "",
    voter.lastName ?? "",
    voter.suffix ?? "",
    voter.age ?? "",
    voter.sex ?? "",
    voter.birthdate ?? "",
    voter.barangay ?? "",
    voter.voterIdNumber ?? "",
  ];
}

/**
 * @param {ReturnType<typeof registeredVoterToExportRow>[]} dataRows
 */
export function sortVotersForExport(voters) {
  return [...voters].sort((a, b) => {
    const byLast = String(a.lastName ?? "").localeCompare(String(b.lastName ?? ""), undefined, {
      sensitivity: "base",
    });
    if (byLast !== 0) return byLast;
    const byFirst = String(a.firstName ?? "").localeCompare(String(b.firstName ?? ""), undefined, {
      sensitivity: "base",
    });
    if (byFirst !== 0) return byFirst;
    return String(a.middleName ?? "").localeCompare(String(b.middleName ?? ""), undefined, {
      sensitivity: "base",
    });
  });
}

/**
 * @param {Array<ReturnType<import("./registeredVoters").mapRegisteredVoterRow>>} voters
 * @param {{
 *   filterBarangayName?: string;
 *   filterBarangayId?: string;
 *   filterSex?: string;
 *   filterAge?: string;
 *   filterVoterId?: string;
 *   filterBirthdate?: string;
 *   filterFullName?: string;
 *   filterFirstName?: string;
 *   filterLastName?: string;
 * }} filters
 */
export function filterRegisteredVoterRecords(voters, filters) {
  const {
    filterBarangayName = "",
    filterBarangayId = "",
    filterSex = "",
    filterAge = "",
    filterVoterId = "",
    filterBirthdate = "",
    filterFullName = "",
    filterFirstName = "",
    filterLastName = "",
  } = filters;

  const barangayNeedle = String(filterBarangayName || "").trim().toLowerCase();

  return voters.filter((user) => {
    const matchesBarangay = barangayNeedle
      ? String(user.barangay || "").trim().toLowerCase() === barangayNeedle
      : !filterBarangayId || user.barangayId === filterBarangayId;
    const byBarangaySex = matchesBarangay && (!filterSex || user.sex === filterSex);
    const byBarangayAge = matchesBarangay && (!filterAge || String(user.age) === String(filterAge));
    const byVoterBirth =
      (!filterVoterId || user.voterIdNumber === filterVoterId) &&
      (!filterBirthdate || user.birthdate === filterBirthdate);
    const byFullName =
      !filterFullName || user.fullName.toLowerCase().includes(filterFullName.trim().toLowerCase());
    const byIdentity =
      byFullName &&
      (!filterFirstName || user.firstName.toLowerCase().includes(filterFirstName.toLowerCase())) &&
      (!filterLastName || user.lastName.toLowerCase().includes(filterLastName.toLowerCase()));
    return byBarangaySex && byBarangayAge && byVoterBirth && byIdentity;
  });
}

function escapeCsvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * @param {ReturnType<typeof registeredVoterToExportRow>[]} dataRows
 */
export function buildRegisteredVotersCsv(dataRows) {
  const lines = [
    REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS.map(escapeCsvCell).join(","),
    ...dataRows.map((row) => row.map(escapeCsvCell).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {ReturnType<typeof sortVotersForExport>} voters
 * @param {string} fileName
 */
export function downloadRegisteredVotersCsv(voters, fileName) {
  const dataRows = sortVotersForExport(voters).map(registeredVoterToExportRow);
  const csv = buildRegisteredVotersCsv(dataRows);
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), fileName);
}

/**
 * @param {ReturnType<typeof sortVotersForExport>} voters
 * @param {string} fileName
 */
export async function downloadRegisteredVotersXlsx(voters, fileName) {
  const sorted = sortVotersForExport(voters);
  const dataRows = sorted.map(registeredVoterToExportRow);
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([REGISTERED_VOTER_BATCH_TEMPLATE_HEADERS, ...dataRows]);
  sheet["!cols"] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 8 },
    { wch: 6 },
    { wch: 8 },
    { wch: 12 },
    { wch: 22 },
    { wch: 26 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Registered Voters");
  XLSX.writeFile(workbook, fileName, { bookType: "xlsx" });
}

export function registeredVoterExportFileStamp() {
  return new Date().toISOString().slice(0, 10);
}
