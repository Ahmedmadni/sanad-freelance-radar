import { describe, expect, it } from "vitest";
import { dedupe, parseFeed, isAccounting, isAccountingRequest, parseBudget, inferWorkMode } from "@/lib/feeds";

describe("feeds", () => {
  it("removes duplicates with the same link (ignoring query string)", () => {
    const r = dedupe([
      { title: "مسك دفاتر", link: "https://a.com/p/1?utm=x" },
      { title: "عنوان آخر", link: "https://a.com/p/1" },
    ]);
    expect(r).toHaveLength(1);
  });

  it("keeps independent jobs even when titles match across sources", () => {
    const r = dedupe([
      { title: "إعداد قوائم مالية!", link: "https://a.com/1" },
      { title: "إعداد  قوائم مالية", link: "https://b.com/9" },
    ]);
    expect(r).toHaveLength(2);
  });

  it("parses RSS link and date", () => {
    const xml = `<rss><channel><item><title><![CDATA[محاسب زكاة]]></title><link>https://x.com/1</link><pubDate>Mon, 26 Oct 2026 06:00:00 GMT</pubDate></item></channel></rss>`;
    const [i] = parseFeed(xml);
    expect(i?.link).toBe("https://x.com/1");
    expect(i?.publishedAt).toBe("2026-10-26T06:00:00.000Z");
  });

  it("filters out non-accounting items", () => {
    expect(isAccounting("تصميم شعار لمطعم")).toBe(false);
    expect(isAccounting("إعداد إقرار ضريبة القيمة المضافة")).toBe(true);
  });
});

import { pickAlerts, alertKey } from "@/lib/feeds";
const opp = (title: string, budgetMax = 0) => ({ id: title, title, description: "", platform: "مستقل" as const, budgetMin: 0, budgetMax, skills: [], urgency: "عادي" as const, postedMinutesAgo: 0, offers: 0, client: "", url: `https://x.com/${encodeURIComponent(title)}` });

describe("telegram alerts", () => {
  it("alerts only on keyword matches", () => {
    expect(pickAlerts([opp("مطلوب مسك دفاتر"), opp("تصميم شعار")], ["مسك دفاتر"], 0, new Set())).toHaveLength(1);
  });
  it("does not alert twice for the same opportunity", () => {
    const o = opp("إعداد قوائم مالية");
    expect(pickAlerts([o], ["قوائم مالية"], 0, new Set([alertKey(o)]))).toHaveLength(0);
  });
  it("skips opportunities below the minimum budget but keeps unknown budgets", () => {
    expect(pickAlerts([opp("تدقيق حسابات", 100), opp("تدقيق مخزون", 0)], ["تدقيق"], 200, new Set())).toHaveLength(1);
  });
});

import { isSaudi } from "@/lib/feeds";
describe("saudi only", () => {
  it("keeps Saudi opportunities", () => {
    expect(isSaudi("مطلوب محاسب في الرياض")).toBe(true);
    expect(isSaudi("Bookkeeper needed, Riyadh KSA")).toBe(true);
  });
  it("drops opportunities outside Saudi Arabia", () => {
    expect(isSaudi("مطلوب محاسب في القاهرة")).toBe(false);
    expect(isSaudi("Senior Accountant, remote USA")).toBe(false);
  });
  it("does not treat a Saudi-looking URL suffix as a Saudi job location", () => {
    expect(isSaudi("Accountant in Cairo https://example.sa/jobs/1")).toBe(false);
    expect(isSaudi("Accountant in Cairo https://example.com/example.sa/jobs/1")).toBe(false);
  });
});

import { inferEmployment } from "@/lib/feeds";
describe("employment type", () => {
  it("detects part-time", () => expect(inferEmployment("مطلوب محاسب دوام جزئي بالرياض")).toBe("دوام جزئي"));
  it("detects full-time", () => expect(inferEmployment("شاغر وظيفي محاسب دوام كامل")).toBe("دوام كامل"));
  it("does not classify a remote interview as part-time work", () => expect(inferEmployment("مطلوب رئيس حسابات في مصنع بالقصيم المقابلات الشخصية ستكون عن بعد")).toBe("غير محدد"));
  it("keeps explicitly remote accounting contracts as part-time", () => expect(inferEmployment("مطلوب محاسب عن بعد بالرياض")).toBe("غير محدد"));
  it("preserves explicit full-time work when a project is mentioned", () => {
    expect(inferEmployment("مطلوب محاسب دوام كامل لمشروع في الرياض")).toBe("دوام كامل");
    expect(inferEmployment("Full-time accountant for a construction project in Riyadh")).toBe("دوام كامل");
  });
  it("preserves explicit full-time remote employment", () => {
    expect(inferEmployment("مطلوب محاسب دوام كامل للعمل عن بعد بالرياض")).toBe("دوام كامل");
  });
});

describe("accounting employer requests only", () => {
  it("excludes the Haraj invoice and tax services offer", () => {
    expect(isAccountingRequest("محاسب رفع اقرارات ضربيية يوجد لدينا فواتير إلكترونيه معتمده من هيئة الزكاه والضريبه لجميع الانشطه باقل الأسعار حلك عندي")).toBe(false);
  });
  it("excludes production supervisors even with incidental accounting software", () => {
    expect(isAccountingRequest("مطلوب مشرف إنتاج للمصنع يجيد SAP", true)).toBe(false);
  });
  it("keeps an employer looking for a licensed accountant in Riyadh", () => {
    expect(isAccountingRequest("مطلوب محاسب قانوني لديه خبرة لإدارة مكتب مراجعة مرخص جديد بالرياض")).toBe(true);
  });
  it("keeps Saudi buyer requests for accounting deliverables", () => {
    expect(isAccountingRequest("أحتاج إعداد قوائم مالية لشركة بالرياض")).toBe(true);
  });
  it("excludes an accountant looking for a job", () => {
    expect(isAccountingRequest("أنا محاسب أبحث عن وظيفة في جدة", true)).toBe(false);
  });
});

describe("data quality regression", () => {
  it("preserves SAR rather than falsely labelling amounts as USD", () => {
    expect(parseBudget("الأجر 2000 ريال")).toEqual({ min: 2000, max: 2000, currency: "SAR" });
  });
  it("rejects comparing different currencies as one range", () => {
    expect(parseBudget("2000 ريال أو 500 دولار")).toEqual({ min: 0, max: 0, currency: null });
  });
  it("does not mistake dates and VAT percentages for a budget", () => {
    expect(parseBudget("15% VAT بتاريخ 09-11-2026")).toEqual({ min: 0, max: 0, currency: null });
  });
  it("preserves meaningful job-id query parameters", () => {
    expect(dedupe([
      {title:"محاسب",link:"https://example.com/jobs?id=1"},
      {title:"محاسب",link:"https://example.com/jobs?id=2"},
    ])).toHaveLength(2);
  });
  it("separates remote work from employment type and ignores remote interviews", () => {
    expect(inferWorkMode("محاسب للعمل عن بعد")).toBe("عن بعد");
    expect(inferWorkMode("المقابلات الشخصية ستكون عن بعد")).toBe("غير محدد");
  });
});
