/** Philippine mobile helpers shared with applicant Manage Account. */

export function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Last 10 local PH mobile digits, or a recoverable leading-9 block. */
export function localMobileDigits(raw) {
  const digits = onlyDigits(raw);
  if (digits.length >= 12 && digits.startsWith("63")) {
    const rest = digits.slice(2);
    if (rest.length >= 10 && rest.startsWith("9")) return rest.slice(0, 10);
  }
  if (digits.length >= 11 && digits.startsWith("0")) {
    const rest = digits.slice(1);
    if (rest.length >= 10 && rest.startsWith("9")) return rest.slice(0, 10);
  }
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    if (last10.startsWith("9")) return last10;
  }
  return digits.slice(0, 10);
}

export function formatPhMobileGroups(digits) {
  const d = onlyDigits(digits).slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `${a} ${b}`;
  return `${a} ${b} ${c}`;
}

/** Same stored shape as registration: `+63 998 301 1200`. */
export function normalizePhMobile(raw) {
  const local = localMobileDigits(raw);
  if (local.length !== 10 || !local.startsWith("9")) return "";
  return `+63 ${formatPhMobileGroups(local)}`;
}

export function phoneValidationMessage(raw) {
  const local = localMobileDigits(raw);
  if (!local) return "Enter a 10-digit PH mobile number.";
  if (local.length !== 10) return "Enter 10 digits starting with 9 (e.g. 9XXXXXXXXX).";
  if (!local.startsWith("9")) return "PH mobile numbers must start with 9.";
  return "";
}
