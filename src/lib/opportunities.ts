export type Platform = string;
export type Skill = "دفاتر" | "ضرائب" | "إكسل" | "ERP" | "قوائم مالية" | "تدقيق" | "دراسة جدوى";
export type Employment = "دوام كامل" | "دوام جزئي" | "عمل حر" | "عقد مؤقت" | "غير محدد";
export const EMPLOYMENTS: Employment[] = ["دوام كامل", "دوام جزئي", "عمل حر", "عقد مؤقت", "غير محدد"];
export type Urgency = "عاجل" | "متوسط" | "عادي";

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  platform: Platform;
  budgetMin: number;
  budgetMax: number;
  budgetCurrency?: "SAR" | "USD" | null;
  skills: Skill[];
  tools?: string[];
  urgency: Urgency;
  postedMinutesAgo: number | null;
  offers: number | null;
  client: string;
  url: string;
  sourceName?: string;
  employment?: Employment;
  workMode?: "عن بعد" | "حضوري" | "هجين" | "غير محدد";
  publishedAt?: string | null;
}

export const SKILLS: Skill[] = ["دفاتر", "ضرائب", "إكسل", "ERP", "قوائم مالية", "تدقيق", "دراسة جدوى"];
export const URGENCIES: Urgency[] = ["عاجل", "متوسط", "عادي"];
export const DEFAULT_KEYWORDS = [
  "مسك دفاتر",
  "قوائم مالية",
  "زكاة وضريبة",
  "إكسل مالي",
  "قيود محاسبية",
  "تدقيق",
  "دراسة جدوى",
  "accounting",
  "bookkeeping",
  "tax",
];

export function timeAgo(min: number | null) {
  if (min === null) return "تاريخ غير معروف";
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

export function matchesKeywords(o: Opportunity, keywords: string[]) {
  const text = `${o.title} ${o.description} ${o.skills.join(" ")}`;
  return keywords.some((k) => k.toLowerCase().split(" ").some((w) => w.length > 2 && text.toLowerCase().includes(w)));
}
