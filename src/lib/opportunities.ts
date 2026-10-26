export type Platform = "مستقل" | "خمسات" | "بعيد" | "كفيل" | "نبض";
export type Skill = "دفاتر" | "ضرائب" | "إكسل" | "ERP" | "قوائم مالية" | "تدقيق" | "دراسة جدوى";
export type Urgency = "عاجل" | "متوسط" | "عادي";

export interface Opportunity {
  id: string;
  title: string;
  description: string;
  platform: Platform;
  budgetMin: number;
  budgetMax: number;
  skills: Skill[];
  tools?: string[];
  urgency: Urgency;
  postedMinutesAgo: number;
  offers: number;
  client: string;
  url: string;
}

export const PLATFORMS: Platform[] = ["مستقل", "خمسات", "بعيد", "كفيل", "نبض"];
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
];

export const SEED: Opportunity[] = [
  { id: "o1", title: "مسك دفاتر شركة تجارية صغيرة على برنامج قيود", description: "نحتاج محاسب لإدخال قيود 3 أشهر (حوالي 400 فاتورة) على برنامج قيود وتسوية الحسابات البنكية وإعداد ميزان مراجعة.", platform: "مستقل", budgetMin: 250, budgetMax: 500, skills: ["دفاتر", "ERP"], tools: ["قيود"], urgency: "عاجل", postedMinutesAgo: 12, offers: 4, client: "مؤسسة الريان للتجارة", url: "https://mostaql.com/projects" },
  { id: "o2", title: "إعداد إقرار ضريبة القيمة المضافة للربع الثالث", description: "منشأة سعودية تحتاج إعداد ومراجعة إقرار VAT للربع الثالث ورفعه على بوابة زاتكا مع مراجعة الفواتير الإلكترونية.", platform: "مستقل", budgetMin: 300, budgetMax: 700, skills: ["ضرائب"], urgency: "عاجل", postedMinutesAgo: 35, offers: 7, client: "متجر أناقة الإلكتروني", url: "https://mostaql.com/projects" },
  { id: "o3", title: "نموذج إكسل للتدفقات النقدية وتقارير لوحة معلومات", description: "مطلوب ملف إكسل احترافي للتدفقات النقدية الشهرية مع Dashboard ورسوم بيانية ومعادلات ديناميكية لمطعم بثلاثة فروع.", platform: "خمسات", budgetMin: 50, budgetMax: 150, skills: ["إكسل"], urgency: "متوسط", postedMinutesAgo: 58, offers: 11, client: "مطاعم سفرة", url: "https://khamsat.com/community/requests" },
  { id: "o4", title: "إعداد القوائم المالية السنوية لشركة مقاولات", description: "إعداد قائمة المركز المالي والدخل والتدفقات النقدية والإيضاحات وفق IFRS للمنشآت الصغيرة والمتوسطة لسنة 2025.", platform: "بعيد", budgetMin: 800, budgetMax: 1500, skills: ["قوائم مالية", "دفاتر"], urgency: "متوسط", postedMinutesAgo: 90, offers: 3, client: "شركة البناء المتقدم", url: "https://baaeed.com/jobs" },
  { id: "o5", title: "دراسة جدوى مالية لمشروع مقهى مختص", description: "دراسة جدوى تشمل التكاليف الاستثمارية، توقعات الإيرادات لخمس سنوات، نقطة التعادل، وفترة الاسترداد وصافي القيمة الحالية.", platform: "مستقل", budgetMin: 400, budgetMax: 900, skills: ["دراسة جدوى", "إكسل"], urgency: "عادي", postedMinutesAgo: 140, offers: 9, client: "رائد أعمال - الرياض", url: "https://mostaql.com/projects" },
  { id: "o6", title: "تدقيق داخلي للمخزون والمشتريات", description: "مراجعة دورة المشتريات والمخزون لشركة توزيع، وإعداد تقرير بالملاحظات والتوصيات وضوابط الرقابة الداخلية.", platform: "كفيل", budgetMin: 600, budgetMax: 1200, skills: ["تدقيق"], urgency: "متوسط", postedMinutesAgo: 210, offers: 2, client: "الوطنية للتوزيع", url: "https://kafiil.com/kafiil/projects" },
  { id: "o7", title: "حساب الزكاة الشرعية وإعداد الإقرار الزكوي", description: "حساب الوعاء الزكوي لشركة ذات مسؤولية محدودة وإعداد الإقرار وفق لائحة هيئة الزكاة والضريبة والجمارك.", platform: "مستقل", budgetMin: 350, budgetMax: 600, skills: ["ضرائب", "قوائم مالية"], urgency: "عاجل", postedMinutesAgo: 25, offers: 5, client: "شركة نماء القابضة", url: "https://mostaql.com/projects" },
  { id: "o8", title: "تهيئة وإعداد دليل الحسابات على دفترة", description: "إعداد شجرة حسابات ومراكز تكلفة وربط المخزون على برنامج دفترة لمتجر إلكتروني مع تدريب الموظف.", platform: "خمسات", budgetMin: 100, budgetMax: 250, skills: ["ERP", "دفاتر"], tools: ["دفترة"], urgency: "عادي", postedMinutesAgo: 300, offers: 6, client: "متجر بيت العطور", url: "https://khamsat.com/community/requests" },
  { id: "o9", title: "ترحيل بيانات محاسبية من فودكس إلى SAP Business One", description: "مطلوب خبير لترحيل الأرصدة الافتتاحية وبيانات العملاء والموردين من فودكس إلى ساب ومطابقتها.", platform: "بعيد", budgetMin: 1500, budgetMax: 3000, skills: ["ERP"], tools: ["فودكس", "ساب"], urgency: "متوسط", postedMinutesAgo: 420, offers: 1, client: "مجموعة الأفق الصناعية", url: "https://baaeed.com/jobs" },
  { id: "o10", title: "قيود يومية وتسويات بنكية شهرية - عمل مستمر", description: "نبحث عن محاسب مستقل بشكل شهري لإدخال القيود اليومية والتسويات البنكية وإعداد تقرير أرباح وخسائر شهري.", platform: "نبض", budgetMin: 200, budgetMax: 400, skills: ["دفاتر", "إكسل"], urgency: "عادي", postedMinutesAgo: 600, offers: 8, client: "عيادات الشفاء", url: "https://nabd.co" },
];

const TEMPLATES: Omit<Opportunity, "id" | "postedMinutesAgo" | "offers">[] = [
  { title: "مراجعة ميزان المراجعة وتصحيح القيود", description: "مراجعة ميزان مراجعة لنصف سنة وتصحيح الأخطاء في التصنيف والقيود المكررة.", platform: "مستقل", budgetMin: 150, budgetMax: 350, skills: ["دفاتر", "تدقيق"], urgency: "عاجل", client: "مكتب استشاري", url: "https://mostaql.com/projects" },
  { title: "ملف إكسل لحساب الرواتب والتأمينات", description: "ملف إكسل لاحتساب الرواتب والبدلات والخصومات والتأمينات الاجتماعية لـ 40 موظفاً.", platform: "خمسات", budgetMin: 40, budgetMax: 100, skills: ["إكسل"], urgency: "متوسط", client: "شركة خدمات لوجستية", url: "https://khamsat.com/community/requests" },
  { title: "تسجيل ضريبي وربط الفوترة الإلكترونية - المرحلة الثانية", description: "مساعدة في الربط مع منصة فاتورة وتجهيز الأنظمة لمتطلبات المرحلة الثانية.", platform: "بعيد", budgetMin: 500, budgetMax: 1000, skills: ["ضرائب", "ERP"], urgency: "عاجل", client: "مصنع الخليج للبلاستيك", url: "https://baaeed.com/jobs" },
  { title: "خطة مالية ونموذج تقييم لشركة ناشئة", description: "نموذج مالي لثلاث سنوات وتقييم مبدئي للعرض على المستثمرين.", platform: "كفيل", budgetMin: 700, budgetMax: 1400, skills: ["دراسة جدوى", "قوائم مالية", "إكسل"], urgency: "متوسط", client: "شركة تقنية ناشئة", url: "https://kafiil.com/kafiil/projects" },
];

let counter = 0;
export function randomOpportunity(): Opportunity {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  counter += 1;
  return { ...t, id: `live-${Date.now()}-${counter}`, postedMinutesAgo: 0, offers: 0 };
}

export function timeAgo(min: number) {
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

export function matchesKeywords(o: Opportunity, keywords: string[]) {
  const text = `${o.title} ${o.description} ${o.skills.join(" ")}`;
  return keywords.some((k) => k.split(" ").some((w) => w.length > 2 && text.includes(w)));
}
