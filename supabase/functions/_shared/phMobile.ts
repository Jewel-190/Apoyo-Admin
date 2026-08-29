/** Philippine mobile helpers. Keep in sync with src/shared/lib/phMobile.js */

export function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function localMobileDigits(raw: unknown): string {
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

export function formatPhMobileGroups(digits: string): string {
  const d = onlyDigits(digits).slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `${a} ${b}`;
  return `${a} ${b} ${c}`;
}

export function normalizePhMobile(raw: unknown): string {
  const local = localMobileDigits(raw);
  if (local.length !== 10 || !local.startsWith("9")) return "";
  return `+63 ${formatPhMobileGroups(local)}`;
}

export function phoneValidationMessage(raw: unknown): string {
  const local = localMobileDigits(raw);
  if (!local) return "Enter a 10-digit PH mobile number.";
  if (local.length !== 10) return "Enter 10 digits starting with 9 (e.g. 9XXXXXXXXX).";
  if (!local.startsWith("9")) return "PH mobile numbers must start with 9.";
  return "";
}
