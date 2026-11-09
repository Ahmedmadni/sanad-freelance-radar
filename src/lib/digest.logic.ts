import type { Opportunity } from "./opportunities";

export type RadarFrequency = 1 | 2;

export type DigestEntry = Pick<Opportunity,
  "id" | "title" | "platform" | "url" | "description" |
  "budgetMin" | "budgetMax" | "budgetCurrency" | "employment" | "workMode">;

export type DigestPart = { text: string; ids: string[] };

export function riyadhClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: [value("year"), value("month"), value("day")].join("-"),
    hour: Number(value("hour")),
  };
}

/** A missed 08:00/20:00 run is retried at the next hourly scan. */
export function dueDigestSlot(now: Date, frequency: RadarFrequency): string | null {
  const { day, hour } = riyadhClock(now);
  if (hour < 8) return null;
  if (frequency === 2 && hour >= 20) return day + "-evening";
  return day + "-morning";
}

export function escapeTelegramHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function clip(text: string, length: number) {
  return text.length > length ? text.slice(0, length - 1) + "…" : text;
}

function entryLine(opportunity: DigestEntry, rank: number) {
  const value = opportunity.budgetCurrency === "SAR" ? "ريال" : opportunity.budgetCurrency === "USD" ? "دولار" : "";
  const budget = value && opportunity.budgetMax > 0
    ? `${opportunity.budgetMin}–${opportunity.budgetMax} ${value}`
    : "غير معلنة";
  const details = [opportunity.employment, opportunity.workMode]
    .filter((x) => x && x !== "غير محدد").join(" | ");
  const desc = clip(opportunity.description.trim(), 135);
  const link = opportunity.url.trim();
  return [
    `<b>${rank}. ${escapeTelegramHtml(clip(opportunity.title, 165))}</b>`,
    `📌 ${escapeTelegramHtml(opportunity.platform)} | 💰 ${budget}`,
    ...(details ? [`🧾 ${escapeTelegramHtml(details)}`] : []),
    ...(desc ? [escapeTelegramHtml(desc)] : []),
    ...(link ? [escapeTelegramHtml(link)] : []),
  ].join("\n");
}

/** Every opportunity is included. Telegram messages are capped below 4096 characters. */
export function formatDigestParts(
  items: DigestEntry[], slot: string, maxChars = 3500,
): DigestPart[] {
  if (maxChars < 600) throw new Error("Telegram message limit is too small");
  const header = `📡 <b>تقرير سند لفرص المحاسبة</b>\n📅 ${escapeTelegramHtml(slot)} — توقيت الرياض\n✅ إجمالي الفرص الجديدة: <b>${items.length}</b>`;
  if (!items.length) return [{ text: header + "\n\nلا توجد فرص جديدة منذ التقرير السابق.", ids: [] }];
  const parts: { entries: string[]; ids: string[] }[] = [];
  let current = { entries: [] as string[], ids: [] as string[] };
  // Reserve 100 characters for a part header, irrespective of the number of chunks.
  const remaining = maxChars - header.length - 100;
  for (const [idx, opportunity] of items.entries()) {
    let block = entryLine(opportunity, idx + 1);
    if (block.length > remaining) {
      // Preserve the full link wherever feasible. Keep all opportunities even
      // when a source supplies an unexpectedly oversized description or URL.
      block = block.slice(0, remaining - 10) + "…";
    }
    const currentLength = current.entries.join("\n\n").length;
    if (current.entries.length && currentLength + block.length + 2 > remaining) {
      parts.push(current);
      current = { entries: [], ids: [] };
    }
    current.entries.push(block);
    current.ids.push(opportunity.id);
  }
  if (current.entries.length) parts.push(current);
  return parts.map((part, index) => ({
    text: header + `\n📨 الجزء ${index + 1} من ${parts.length}\n\n` + part.entries.join("\n\n"),
    ids: part.ids,
  }));
}
