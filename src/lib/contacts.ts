// Extracts advertiser contact details (WhatsApp number / email) from ad text
// and builds the matching contact links.
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Platform addresses are never the advertiser's own contact.
const PLATFORM_EMAIL_DOMAINS = [
  "linkedin.com",
  "haraj.com",
  "opensooq.com",
  "mourjan.com",
  "kafiil.com",
  "freelancer.com",
  "mostaql.com",
  "khamsat.com",
];

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

export function waLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Returns the first advertiser email found in the text, or null. */
export function extractEmail(text: string): string | null {
  const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/g;
  for (const m of text.matchAll(re)) {
    const email = m[0];
    const before = text.slice(Math.max(0, m.index! - 2), m.index);
    // Skip addresses that are part of a URL (e.g. https://x.com/info@page).
    if (before.includes("/") || before.endsWith("//")) continue;
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    if (PLATFORM_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d))) continue;
    return email;
  }
  return null;
}

/** Builds a mailto link. An empty address opens a blank message with subject/body ready. */
export function mailtoLink(email: string, subject: string, body: string): string {
  const q = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join("&");
  return `mailto:${email}${q ? `?${q}` : ""}`;
}
