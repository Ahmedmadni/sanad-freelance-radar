// Extracts a Saudi mobile number from ad text and builds WhatsApp links.
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** Returns the number in international format without "+" (e.g. 966512345678), or null. */
export function extractSaudiPhone(text: string): string | null {
  const t = normalizeDigits(text).replace(/[\s\-().]/g, "");
  const m = t.match(/(?:\+|00)?966(5\d{8})|(?<!\d)0?(5\d{8})(?!\d)/);
  if (!m) return null;
  return "966" + (m[1] ?? m[2]);
}

export function toWaNumber(input: string): string | null {
  const d = normalizeDigits(input).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("05") && d.length === 10) return "966" + d.slice(1);
  if (d.startsWith("5") && d.length === 9) return "966" + d;
  return d;
}

export function waLink(number: string | null, message: string): string {
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`;
}
