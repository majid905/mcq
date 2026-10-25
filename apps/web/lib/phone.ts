/** Bangladeshi mobile number as the API expects it: 01[3-9] + 8 digits (openapi Phone). */
export const PHONE_PATTERN = /^01[3-9][0-9]{8}$/;

/**
 * Accepts what people type: Bangla digits, spaces, dashes, a +88 / 88 prefix.
 * Returns the 11-digit local form, or the cleaned input if it cannot be normalised.
 */
export function normalizePhone(input: string): string {
  const ascii = input.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
  const digits = ascii.replace(/\D/g, '');
  return digits.startsWith('880') ? digits.slice(2) : digits;
}

export function isValidPhone(input: string): boolean {
  return PHONE_PATTERN.test(normalizePhone(input));
}

export type PasswordStrength = 'weak' | 'fair' | 'strong';

/** Hint only; the API enforces 8-64 characters. */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length < 8) return 'weak';
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  return password.length >= 12 && kinds >= 3 ? 'strong' : kinds >= 2 ? 'fair' : 'weak';
}
