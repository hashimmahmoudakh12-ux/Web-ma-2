import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Turns whatever the customer typed ("(313) 555-0142", "313.555.0142", ...)
 * into one standard format ("+13135550142", called E.164) so the same person
 * always matches the same record. Returns null if it isn't a real number.
 */
export function normalizePhone(input: string, defaultCountry: CountryCode = "US"): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** "+13135550142" -> "•••-•••-0142" (for showing on screen without leaking the number) */
export function maskPhone(e164: string): string {
  return `•••-•••-${e164.slice(-4)}`;
}
