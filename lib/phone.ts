import { createHmac } from "node:crypto";

const ARABIC_INDIC = /[٠-٩]/g; // ٠١٢٣٤٥٦٧٨٩
const PERSIAN = /[۰-۹]/g; // ۰۱۲۳۴۵۶۷۸۹

/** Convert Arabic-Indic / Persian digits to ASCII digits. */
export function toAsciiDigits(input: string): string {
  return input
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Libyan mobile: 09[1-6] + 7 digits (Libyana 092/094, Al-Madar 091/093, LTT 095/096). */
export const LIBYAN_MOBILE_RE = /^09[1-6]\d{7}$/;

/**
 * Normalise any Libyan mobile spelling to `09XXXXXXXX`.
 * Accepts: +218 91 234 5678 · 00218912345678 · 218-91-2345678 · 0912345678 · 912345678 · ٠٩١٢٣٤٥٦٧٨
 * Returns null when it is not a valid Libyan mobile number.
 */
export function normalizeLibyanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = toAsciiDigits(raw).replace(/\D/g, "");
  if (digits.startsWith("00218")) digits = digits.slice(5);
  else if (digits.startsWith("218") && digits.length === 12) digits = digits.slice(3);
  if (digits.length === 9 && digits.startsWith("9")) digits = `0${digits}`;
  return LIBYAN_MOBILE_RE.test(digits) ? digits : null;
}

/**
 * Privacy-preserving reputation key.
 * HMAC-SHA256 with a server-side secret ("pepper"), NOT a plain salted SHA-256:
 * the Libyan mobile space is only ~60M numbers, so an unkeyed hash can be
 * reversed by brute force in minutes. Without the pepper the hash is useless.
 */
export function hashPhone(normalizedPhone: string, pepper: string): string {
  if (!LIBYAN_MOBILE_RE.test(normalizedPhone)) {
    throw new Error("hashPhone expects a normalised 09XXXXXXXX number");
  }
  if (pepper.length < 16) throw new Error("PHONE_HASH_PEPPER is too short");
  return createHmac("sha256", pepper).update(`ly:${normalizedPhone}`).digest("hex");
}

/** Mask for logs / UI where the full number is not needed: 091****678 */
export function maskPhone(phone: string): string {
  return phone.length === 10 ? `${phone.slice(0, 3)}****${phone.slice(7)}` : "****";
}
