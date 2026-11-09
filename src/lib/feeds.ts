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

/** Hiring/buyer evidence is separate from incidental software and skill mentions. */
export function isAccountingRequest(text: string, employerCategory = false) {
  const accounting = /محاسب|محاسبة|محاسبه|رئيس حسابات|مدير حسابات|مراجع حسابات|مدقق حسابات|مسك دفاتر|قوائم مالي[ةه]|إقرار[ات]* ضريب|اقرار[ات]* ضريب|إقرار[ات]* زكو|اقرار[ات]* زكو|\baccount(?:ant|ing)\b|\bbookkeep(?:er|ing)\b|\bauditor\b/i;
  const wants = /مطلوب|احتاج|أحتاج|ابغى|أبغى|أبحث عن|ابحث عن|نبحث عن|نحتاج|توظيف|وظيفة|وظائف|شاغر|فرصة وظيفية|\b(?:hiring|seeking|needed|looking for|vacancy)\b/i;
  const service = /(?:^|[.،\n])\s*(?:أنا|انا) محاسب|(?:ابحث|أبحث) عن (?:عمل|وظيفة)|(?:اقدم|أقدم|نقدم|نوفّر|نوفر) خدم|خدمات محاسبية|(?:عندي|لدينا|نوفر) فواتير|فواتير إلكتروني[ةه].*(?:الأسعار|الاسعار)|(?:حلك عندي|تصفير الضريب|رفع الغرامات|ورقع الغرامات)|\b(?:my services|i offer|looking for a job)\b/i;
  return accounting.test(text) && !service.test(text) && (employerCategory || wants.test(text));
}

const normTitle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const normLink = (raw: string) => {
  try {
    const url = new URL(raw.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm(?:_|$)/i.test(key) || /^(fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim().replace(/#.*$/, "");
  }
};

/** Identical generic job titles can belong to different employers. */
export function dedupe<T extends { title: string; link: string; sourceName?: string; location?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.link
      ? "url:" + normLink(it.link)
      : "no-url:" + (it.sourceName ?? "") + ":" + (it.location ?? "") + ":" + normTitle(it.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const normalizeNumerals = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

export function parseBudget(text: string): { min: number; max: number; currency: "SAR" | "USD" | null } {
  const re = /(?:\b(SAR|USD)\b|(\$|ريال(?:ات)?|دولار(?:ات)?))\s*(\d[\d,٬]*(?:[.٫]\d+)?)|(\d[\d,٬]*(?:[.٫]\d+)?)\s*(?:\b(SAR|USD)\b|(\$|ريال(?:ات)?|دولار(?:ات)?))/gi;
  const values: { amount: number; currency: "SAR" | "USD" }[] = [];
  for (const match of normalizeNumerals(text).matchAll(re)) {
    const unit = (match[1] ?? match[2] ?? match[5] ?? match[6] ?? "").toLowerCase();
    const amount = Number((match[3] ?? match[4] ?? "").replace(/[,٬]/g, "").replace("٫", "."));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    values.push({ amount, currency: /^(sar|ريال)/.test(unit) ? "SAR" : "USD" });
  }
  if (!values.length) return { min: 0, max: 0, currency: null };
  const currency = values[0].currency;
  if (values.some((v) => v.currency !== currency)) return { min: 0, max: 0, currency: null };
  return { min: Math.min(...values.map((v) => v.amount)), max: Math.max(...values.map((v) => v.amount)), currency };
}

function stableId(s: string) {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) hash = Math.imul(hash ^ s.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function toOpportunity(it: RawItem & { sourceName: string; location?: string; employment?: Employment }, _idx: number): Opportunity {
  const text = it.title + " " + it.description;
  const budget = parseBudget(text);
  const mins = it.publishedAt ? Math.max(0, Math.round((Date.now() - Date.parse(it.publishedAt)) / 60000)) : null;
  return {
    id: "src-" + stableId(it.link ? normLink(it.link) : it.sourceName + ":" + it.title + ":" + (it.location ?? "")),
    title: it.title,
    description: it.description,
    platform: it.sourceName,
    budgetMin: budget.min,
    budgetMax: budget.max,
    budgetCurrency: budget.currency,
    skills: inferSkills(text),
    urgency: /عاجل|urgent|فوري/i.test(text) ? "عاجل" : "عادي",
    postedMinutesAgo: mins,
    offers: null,
    client: it.location ?? it.sourceName,
    url: it.link,
    sourceName: it.sourceName,
    employment: it.employment ?? inferEmployment(text),
    workMode: inferWorkMode(text),
    publishedAt: it.publishedAt,
  };
}

export const alertKey = (o: { url: string; title: string }) => (o.url ? normLink(o.url) : normTitle(o.title));

/** New opportunities that match keywords + min budget and were not alerted before. Unknown budget (0) passes. */
export function pickAlerts(items: Opportunity[], keywords: string[], minBudget: number, sent: Set<string>) {
  return items.filter((o) => {
    if (sent.has(alertKey(o))) return false;
    if (minBudget > 0 && o.budgetMax > 0 && o.budgetCurrency === "USD" && o.budgetMax < minBudget) return false;
    if (minBudget > 0 && o.budgetMax > 0 && o.budgetCurrency !== "USD") return false;
    const text = `${o.title} ${o.description}`.toLowerCase();
    return keywords.some((k) => text.includes(k.toLowerCase()) || k.split(" ").some((w) => w.length > 2 && text.includes(w.toLowerCase())));
  });
}

const SAUDI = /السعودي|السعودية|المملكة|الرياض|جدة|جده|مكة|مكه|المدينة المنورة|الدمام|الخبر|الظهران|الأحساء|الاحساء|القصيم|بريدة|الطائف|تبوك|أبها|ابها|خميس مشيط|جازان|نجران|حائل|الجبيل|ينبع|زاتكا|هيئة الزكاة|\bKSA\b|Saudi|Riyadh|Jeddah|Dammam|Khobar/i;

/** Require Saudi location evidence in the text; a URL alone does not locate a job. */
export function isSaudi(text: string) {
  return SAUDI.test(text);
}

/** Employment type and location are distinct. */
export function inferEmployment(text: string): Employment {
  if (/دوام كامل|full[- ]?time|راتب شهري|permanent/i.test(text)) return "دوام كامل";
  if (/دوام جزئي|بارت تايم|part[- ]?time/i.test(text)) return "دوام جزئي";
  if (/فريلانس|freelanc|بالساعة|بالقطعة|عمل مستقل|مشروع مستقل/i.test(text)) return "عمل حر";
  if (/عقد مؤقت|temporary contract|fixed[- ]term contract/i.test(text)) return "عقد مؤقت";
  return "غير محدد";
}

export function inferWorkMode(text: string): "عن بعد" | "حضوري" | "هجين" | "غير محدد" {
  const withoutInterviews = text
    .replace(/(?:المقابلات?|المقابلة|interviews?)[^.!،\n]{0,100}(?:عن بعد|remote|online)/gi, "")
    .replace(/(?:عن بعد|remote|online)[^.!،\n]{0,40}(?:المقابلات?|المقابلة|interviews?)/gi, "");
  if (/هجين|hybrid/i.test(withoutInterviews)) return "هجين";
  if (/(?:للعمل|العمل|وظيفة|محاسب|work|position|job)\s+عن بعد|remote[- ]?(?:work|job|position|accountant)|work from home|فريلانس عن بعد/i.test(withoutInterviews)) return "عن بعد";
  if (/حضوري|on[- ]?site|من مقر الشركة|من المكتب/i.test(withoutInterviews)) return "حضوري";
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
