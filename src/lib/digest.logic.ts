import type { Opportunity } from "./opportunities";

export type RadarFrequency = 1 | 2;

export type DigestEntry = Pick<Opportunity,
  "id" | "title" | "platform" | "url" | "description" |
  "budgetMin" | "budgetMax" | "budgetCurrency"> & {
  employment?: Opportunity["employment"] | undefined;
  workMode?: Opportunity["workMode"] | undefined;
};

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

/**
 * The scheduled GitHub job fires around 08:07/20:07 Riyadh with a 09:07/21:07
 * fallback. A late GitHub invocation can still complete its missing slot.
 */
export function dueDigestSlot(now: Date, frequency: RadarFrequency): string | null {
  const { day, hour } = riyadhClock(now);
  if (hour < 8) return null;
  if (hour >= 20) return frequency === 2 ? day + "-evening" : null;
  return day + "-morning";
}

/**
 * GitHub scheduled jobs are best-effort and can be delayed or skipped.
 * Recover all unconfirmed report slots from yesterday and today. This lets
 * an early-morning job deliver yesterday's missing evening report, rather
 * than silently treating the run as "outside-window".
 * Slots are oldest-first so jobs collected since the last report aren't lost.
 */
export function recoverableDigestSlots(now: Date, frequency: RadarFrequency): string[] {
  const { day, hour } = riyadhClock(now);
  const previous = new Date(day + "T12:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  const yesterday = previous.toISOString().slice(0, 10);
  const slots = [yesterday + "-morning"];
  if (frequency === 2) slots.push(yesterday + "-evening");
  if (hour >= 8) slots.push(day + "-morning");
  if (frequency === 2 && hour >= 20) slots.push(day + "-evening");
  return slots;
}

/**
 * Check the database checkpoint before expensive source collection.
 * A sent report needs no more scanning; a currently sending report must not
 * race another Telegram publication. Stale/failed runs can be retried.
 */
export function digestSlotGate(
  existing: { status: string; started_at: string | null } | null,
  now: Date,
): "already-handled" | "in-progress" | null {
  if (existing?.status === "sent") return "already-handled";
  if (existing?.status !== "sending" || !existing.started_at) return null;
  const elapsed = now.getTime() - new Date(existing.started_at).getTime();
  return Number.isFinite(elapsed) && elapsed >= -60_000 && elapsed < 30 * 60_000
    ? "in-progress"
    : null;
}


/** Escape both Telegram HTML content and quoted link attributes from external feeds. */
export function escapeTelegramHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function tidy(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clip(value: string, limit: number): string {
  if (limit <= 0) return "";
  const chars = Array.from(tidy(value));
  return chars.length > limit ? chars.slice(0, Math.max(0, limit - 1)).join("") + "…" : chars.join("");
}

function publicLink(value: string): string | null {
  const raw = tidy(value);
  // Refuse unsafe links and overly long URLs instead of creating broken HTML
  // or slicing a link after it has been placed inside an anchor tag.
  if (!raw || raw.length > 1800) return null;
  try {
    const url = new URL(raw);
    if ((url.protocol === "https:" || url.protocol === "http:") &&
      !url.username && !url.password) return url.toString();
  } catch {
    // Bad input from an external source: still publish the opportunity.
  }
  return null;
}

function amount(value: number): string {
  return Number.isFinite(value) ? Math.max(0, value).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  }) : "0";
}

function entryLine(
  item: DigestEntry, rank: number, titleLength = 104,
  descriptionLength = 118, withLink = true,
): string {
  const title = escapeTelegramHtml(clip(item.title || "فرصة عمل", titleLength));
  const source = escapeTelegramHtml(clip(item.platform || "مصدر غير محدد", 50));
  const mode = [item.employment, item.workMode]
    .filter((v) => Boolean(v && v !== "غير محدد"))
    .map((v) => escapeTelegramHtml(clip(String(v), 36))).join(" · ");
  const currency = item.budgetCurrency === "SAR" ? "ريال" :
    item.budgetCurrency === "USD" ? "دولار" : "";
  const budget = currency && item.budgetMax > 0
    ? (item.budgetMin > 0 && item.budgetMin !== item.budgetMax
      ? amount(item.budgetMin) + "–" + amount(item.budgetMax)
      : amount(item.budgetMax)) + " " + currency
    : "غير معلن";
  const description = escapeTelegramHtml(clip(item.description, descriptionLength));
  const link = withLink ? publicLink(item.url) : null;

  return [
    "<b>" + String(rank).padStart(2, "0") + " | " + title + "</b>",
    "🏢 " + source + (mode ? "  ·  💼 " + mode : ""),
    "💰 " + budget,
    ...(description ? ["📝 " + description] : []),
    link ? '🔗 <a href="' + escapeTelegramHtml(link) + '">عرض التفاصيل والتقديم</a>' :
      "🔗 رابط التقديم غير متاح",
  ].join("\n");
}

function reportDate(slot: string): { date: string; period: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(morning|evening)$/.exec(slot);
  if (!match) return { date: escapeTelegramHtml(clip(slot, 48)), period: "التقرير الدوري" };
  return {
    date: match[3] + "/" + match[2] + "/" + match[1],
    period: match[4] === "morning" ? "التقرير الصباحي" : "التقرير المسائي",
  };
}

function primaryHeader(slot: string, count: number): string {
  const { date, period } = reportDate(slot);
  return [
    "📡 <b>سند | رادار فرص العمل</b>",
    "📅 " + date + "  ·  " + period,
    "🎯 <b>" + count + " فرصة جديدة</b> في المحاسبة والمالية",
    "━━━━━━━━━━━━",
  ].join("\n");
}

function continuationHeader(
  part: number, parts: number, start: number, end: number, total: number,
): string {
  return [
    "📡 <b>سند | استكمال الفرص</b>",
    "📨 الجزء " + part + " من " + parts +
      "  ·  الفرص " + start + "–" + end + " من " + total,
    "────────────",
  ].join("\n");
}

const SEPARATOR = "\n\n────────────\n\n";
const FOOTER = "\n\n✅ <i>انتهى التقرير · فعّل إشعارات القناة لمتابعة الفرص الجديدة</i>";

/**
 * A single daily report may use several Telegram messages. Only the first
 * message carries the date and total; later messages carry short continuations.
 * Every item receives a stable number and is included exactly once.
 * Each serialized HTML message stays under the Telegram 4096-character limit.
 */
export function formatDigestParts(
  items: DigestEntry[], slot: string, maxChars = 3500,
): DigestPart[] {
  if (maxChars < 600 || maxChars > 4096) throw new Error("Telegram message limit is invalid");
  const header = primaryHeader(slot, items.length);
  if (!items.length) {
    return [{ text: header + "\n\n✨ لا توجد فرص جديدة منذ التقرير السابق.", ids: [] }];
  }

  // Calculate the worst possible header size before packing, including page
  // counters and the last-page footer, so the layout cannot exceed maxChars.
  const n = items.length;
  const maxPageLabel = "\n📨 الجزء " + n + " من " + n +
    "  ·  الفرص " + n + "–" + n + " من " + n;
  const overhead = Math.max(
    (header + maxPageLabel).length,
    continuationHeader(n, n, n, n, n).length,
  );
  const capacity = maxChars - overhead - FOOTER.length - 10;
  if (capacity < 120) throw new Error("Telegram report has insufficient space");

  type Group = { entries: string[]; ids: string[]; first: number; last: number; size: number };
  const groups: Group[] = [];
  let current: Group = { entries: [], ids: [], first: 1, last: 1, size: 0 };

  for (const [index, item] of items.entries()) {
    const rank = index + 1;
    let block = entryLine(item, rank);
    if (block.length > capacity) block = entryLine(item, rank, 65, 45);
    if (block.length > capacity) block = entryLine(item, rank, 42, 0);
    if (block.length > capacity) block = entryLine(item, rank, 42, 0, false);
    if (block.length > capacity) throw new Error("Opportunity cannot fit Telegram limit");

    const separatorLength = current.entries.length ? SEPARATOR.length : 0;
    if (current.entries.length && current.size + separatorLength + block.length > capacity) {
      groups.push(current);
      current = { entries: [], ids: [], first: rank, last: rank, size: 0 };
    }
    current.entries.push(block);
    current.ids.push(item.id);
    current.size += (current.entries.length === 1 ? 0 : SEPARATOR.length) + block.length;
    current.last = rank;
  }
  if (current.entries.length) groups.push(current);

  return groups.map((group, index) => {
    const isFirst = index === 0;
    const isLast = index === groups.length - 1;
    const top = isFirst
      ? header + (groups.length > 1
        ? "\n📨 الجزء 1 من " + groups.length +
          "  ·  الفرص " + group.first + "–" + group.last + " من " + n
        : "")
      : continuationHeader(index + 1, groups.length, group.first, group.last, n);
    const text = top + "\n\n" + group.entries.join(SEPARATOR) + (isLast ? FOOTER : "");
    if (text.length > maxChars) throw new Error("Telegram report exceeded safe character limit");
    return { text, ids: group.ids };
  });
}
