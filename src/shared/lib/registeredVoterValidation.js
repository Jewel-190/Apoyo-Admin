export const REGISTERED_VOTER_NAME_PATTERN = /^[A-Za-zÀ-ÿ' -]{2,}$/;
export const REGISTERED_VOTER_SUFFIX_PATTERN = /^$|^[A-Za-z0-9. -]{1,8}$/;
export const REGISTERED_VOTER_ID_PATTERN = /^[0-9A-Za-z]{4}-[0-9A-Za-z]{5}-[0-9A-Za-z]{13}-[0-9A-Za-z]$/;

/** Formats raw voter ID input into 4-5-13-1 segments (uppercase alphanumeric). */
export function formatRegisteredVoterId(value) {
  const raw = String(value || "")
    .replace(/[^0-9A-Za-z]/gi, "")
    .toUpperCase()
    .slice(0, 23);
  if (raw.length <= 4) return raw;
  if (raw.length <= 9) return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  if (raw.length <= 22) return `${raw.slice(0, 4)}-${raw.slice(4, 9)}-${raw.slice(9)}`;
  return `${raw.slice(0, 4)}-${raw.slice(4, 9)}-${raw.slice(9, 22)}-${raw.slice(22)}`;
}

/** Empty is allowed only when the profile did not already have a VIN. */
export function validateUserProfileVoterId(value, original = "") {
  const formatted = formatRegisteredVoterId(value);
  const originalFormatted = formatRegisteredVoterId(original);
  if (!formatted) {
    return originalFormatted ? "VIN cannot be cleared. Enter a valid voter ID." : "";
  }
  if (!REGISTERED_VOTER_ID_PATTERN.test(formatted)) {
    return "Use the exact format 0000-00000-0000000000000-0 (letters or digits per segment).";
  }
  return "";
}

/**
 * @param {string} key
 * @param {string} value
 * @param {Record<string, string>} record
 * @param {{ allowedBarangayIds?: Set<string>, allowedBarangayNames?: Set<string>, allowMissingBarangayId?: boolean }} [context]
 * @returns {string} Empty string if valid, otherwise an error message.
 */
export function validateRegisteredVoterField(key, value, record, context = {}) {
  const trimmed = String(value ?? "").trim();
  const { allowedBarangayIds, allowedBarangayNames, allowMissingBarangayId } = context;

  if (key === "barangayId") {
    if (!trimmed) return allowMissingBarangayId ? "" : "Please select a barangay.";
    if (allowedBarangayIds && !allowedBarangayIds.has(trimmed)) {
      return "Choose a valid barangay from the list.";
    }
  }
  if (key === "barangay") {
    if (!trimmed) return "Please select a barangay.";
    if (allowedBarangayNames && !allowedBarangayNames.has(trimmed)) {
      return "Choose a valid barangay from the list.";
    }
  }
  if (["firstName", "lastName"].includes(key) && !trimmed) return "This field is required.";
  if (["firstName", "lastName"].includes(key) && trimmed && !REGISTERED_VOTER_NAME_PATTERN.test(trimmed)) {
    return "Use letters only, with spaces, apostrophes, or hyphens allowed.";
  }
  if (key === "middleName" && trimmed && !REGISTERED_VOTER_NAME_PATTERN.test(trimmed)) {
    return "Use letters only, with spaces, apostrophes, or hyphens allowed.";
  }
  if (key === "suffix" && !REGISTERED_VOTER_SUFFIX_PATTERN.test(trimmed)) {
    return "Use a short suffix like Jr., Sr., III, or leave blank.";
  }
  if (key === "age") {
    if (!trimmed) return "Age is required.";
    const age = Number(trimmed);
    if (!Number.isInteger(age) || age < 1 || age > 120) return "Age must be a whole number from 1 to 120.";
  }
  if (key === "sex" && !trimmed) return "Please select a sex.";
  if (key === "birthdate") {
    if (!trimmed) return "Birthdate is required.";
    const birthDate = new Date(`${trimmed}T00:00:00`);
    const today = new Date();
    if (Number.isNaN(birthDate.getTime())) return "Enter a valid birthdate.";
    if (birthDate > today) return "Birthdate cannot be in the future.";
    if (record.age) {
      let calculatedAge = today.getFullYear() - birthDate.getFullYear();
      const monthOffset = today.getMonth() - birthDate.getMonth();
      if (monthOffset < 0 || (monthOffset === 0 && today.getDate() < birthDate.getDate())) calculatedAge -= 1;
      if (Math.abs(calculatedAge - Number(record.age)) > 1) return "Birthdate should match the entered age.";
    }
  }
  if (key === "voterIdNumber") {
    if (!trimmed) return "Voter ID Number is required.";
    if (!REGISTERED_VOTER_ID_PATTERN.test(trimmed)) {
      return "Use the exact format 0000-00000-0000000000000-0 (letters or digits per segment).";
    }
  }
  return "";
}
