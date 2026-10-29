import type { Employment, Opportunity, Skill } from "./opportunities";

export interface RawItem {
  title: string;
  description: string;
  link: string;
  publishedAt: string | null;
}

export const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function tag(block: string, names: string[]) {
  for (const n of names) {
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m?.[1]) return m[1];
  }
  return "";
}

function toIso(d: string) {
  const t = Date.parse(decode(d));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** Parses RSS 2.0 or Atom XML into raw items. */
export function parseFeed(xml: string): RawItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return blocks.map((b) => {
    let link = decode(tag(b, ["link", "guid"]));
    if (!link) link = b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? "";
    return {
      title: decode(tag(b, ["title"])),
      description: decode(tag(b, ["description", "summary", "content", "content:encoded"])).slice(0, 600),
      link,
      publishedAt: toIso(tag(b, ["pubDate", "published", "updated", "dc:date"])),
    };
  });
}

/** Accepts a JSON array or {items|data|projects: [...]} with title/description/url fields. */
export function parseJson(json: unknown): RawItem[] {
  const arr = Array.isArray(json)
    ? json
    : ((json as any)?.items ?? (json as any)?.data ?? (json as any)?.projects ?? []);
  if (!Array.isArray(arr)) return [];
  return arr.map((x: any) => ({
    title: String(x?.title ?? "").trim(),
    description: String(x?.description ?? x?.summary ?? "").slice(0, 600),
    link: String(x?.url ?? x?.link ?? ""),
    publishedAt: x?.published_at ?? x?.date ?? x?.created_at ? toIso(String(x.published_at ?? x.date ?? x.created_at)) : null,
  }));
}

const SKILL_WORDS: Record<Skill, string[]> = {
  دفاتر: ["دفاتر", "قيود", "محاسب", "تسوي", "ميزان مراجعة", "bookkeeping"],
  ضرائب: ["ضريب", "زكا", "VAT", "زاتكا", "إقرار", "tax"],
  إكسل: ["إكسل", "اكسل", "excel", "جداول"],
  ERP: ["ERP", "ساب", "SAP", "أودو", "odoo", "فودكس", "دفترة", "قيود", "QuickBooks"],
  "قوائم مالية": ["قوائم مالية", "القوائم المالية", "ميزانية عمومية", "IFRS", "financial statement"],
  تدقيق: ["تدقيق", "مراجعة", "audit"],
  "دراسة جدوى": ["جدوى", "خطة عمل", "نموذج مالي", "feasibility"],
};

const ACCOUNTING_HINTS = ["محاسب", "مالي", "مالية", "accounting", "finance", "bookkeep"];

export function inferSkills(text: string): Skill[] {
  const t = text.toLowerCase();
  return (Object.keys(SKILL_WORDS) as Skill[]).filter((s) => SKILL_WORDS[s].some((w) => t.includes(w.toLowerCase())));
}

export function isAccounting(text: string) {
  const t = text.toLowerCase();
  return inferSkills(text).length > 0 || ACCOUNTING_HINTS.some((w) => t.includes(w));
}

const normTitle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const normLink = (s: string) => s.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

/** Removes duplicates by link and by normalized title; keeps the first (newest after sorting). */
export function dedupe<T extends { title: string; link: string }>(items: T[]): T[] {
  const seenL = new Set<string>();
  const seenT = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const l = it.link ? normLink(it.link) : "";
    const t = normTitle(it.title);
    if ((l && seenL.has(l)) || (t && seenT.has(t))) continue;
    if (l) seenL.add(l);
    if (t) seenT.add(t);
    out.push(it);
  }
  return out;
}

export function toOpportunity(it: RawItem & { sourceName: string; location?: string; employment?: Employment }, idx: number): Opportunity {
  const text = `${it.title} ${it.description}`;
  const nums = [...text.matchAll(/(?:\$|SAR|ريال)\s?(\d{2,6})|(\d{2,6})\s?(?:\$|دولار|USD|ريال|SAR)/g)].map((m) => Number(m[1] ?? m[2]));
  const min = nums.length ? Math.min(...nums) : 0;
  const max = nums.length ? Math.max(...nums) : 0;
  const mins = it.publishedAt ? Math.max(0, Math.round((Date.now() - Date.parse(it.publishedAt)) / 60000)) : 0;
  return {
    id: `src-${idx}-${normTitle(it.title).slice(0, 20)}`,
    title: it.title,
    description: it.description,
    platform: it.sourceName as Opportunity["platform"],
    budgetMin: min,
    budgetMax: max,
    skills: inferSkills(text),
    urgency: /عاجل|urgent|فوري/i.test(text) ? "عاجل" : "عادي",
    postedMinutesAgo: mins,
    offers: 0,
    client: it.location ?? it.sourceName,
    url: it.link,
    sourceName: it.sourceName,
    employment: it.employment ?? inferEmployment(text),
    publishedAt: it.publishedAt,
  };
}

export const alertKey = (o: { url: string; title: string }) => (o.url ? normLink(o.url) : normTitle(o.title));

/** New opportunities that match keywords + min budget and were not alerted before. Unknown budget (0) passes. */
export function pickAlerts(items: Opportunity[], keywords: string[], minBudget: number, sent: Set<string>) {
  return items.filter((o) => {
    if (sent.has(alertKey(o))) return false;
    if (minBudget > 0 && o.budgetMax > 0 && o.budgetMax < minBudget) return false;
    const text = `${o.title} ${o.description}`.toLowerCase();
    return keywords.some((k) => text.includes(k.toLowerCase()) || k.split(" ").some((w) => w.length > 2 && text.includes(w.toLowerCase())));
  });
}

const SAUDI = /السعودي|السعودية|المملكة|الرياض|جدة|جده|مكة|مكه|المدينة المنورة|الدمام|الخبر|الظهران|الأحساء|الاحساء|القصيم|بريدة|الطائف|تبوك|أبها|ابها|خميس مشيط|جازان|نجران|حائل|الجبيل|ينبع|زاتكا|هيئة الزكاة|\bKSA\b|Saudi|Riyadh|Jeddah|Dammam|Khobar|\.sa\//i;

/** True only when the text clearly points to Saudi Arabia (city, country, ZATCA, or a .sa link). */
export function isSaudi(text: string) {
  return SAUDI.test(text);
}

/** Part-time covers part-time, freelance, remote-contract and per-task work; full-time covers permanent positions. */
export function inferEmployment(text: string): Employment {
  if (/دوام جزئي|جزئي|بارت تايم|part[- ]?time|متعاون|عن بعد|فريلانس|freelance|بالساعة|بالقطعة|مشروع|project|contract|عقد مؤقت/i.test(text)) return "دوام جزئي";
  if (/دوام كامل|full[- ]?time|شاغر وظيفي|وظيفة شاغرة|راتب شهري|permanent/i.test(text)) return "دوام كامل";
  return "غير محدد";
}

/** Parses LinkedIn's public job-search HTML cards. */
export function parseLinkedIn(html: string) {
  return html.split("<li").slice(1).map((c) => {
    const pick = (re: RegExp) => decode(c.match(re)?.[1] ?? "");
    return {
      title: pick(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/),
      company: pick(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/),
      location: pick(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/),
      link: (c.match(/base-card__full-link[^>]*href="([^"?]+)/)?.[1] ?? "").trim(),
      date: c.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? null,
    };
  }).filter((x) => x.title && x.link);
}
