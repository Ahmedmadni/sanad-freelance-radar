import { describe, expect, it } from "vitest";
import { dedupe, parseFeed, isAccounting } from "@/lib/feeds";

describe("feeds", () => {
  it("removes duplicates with the same link (ignoring query string)", () => {
    const r = dedupe([
      { title: "مسك دفاتر", link: "https://a.com/p/1?utm=x" },
      { title: "عنوان آخر", link: "https://a.com/p/1" },
    ]);
    expect(r).toHaveLength(1);
  });

  it("removes duplicates with the same title across sources", () => {
    const r = dedupe([
      { title: "إعداد قوائم مالية!", link: "https://a.com/1" },
      { title: "إعداد  قوائم مالية", link: "https://b.com/9" },
    ]);
    expect(r).toHaveLength(1);
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
});

import { inferEmployment } from "@/lib/feeds";
describe("employment type", () => {
  it("detects part-time", () => expect(inferEmployment("مطلوب محاسب دوام جزئي بالرياض")).toBe("دوام جزئي"));
  it("detects full-time", () => expect(inferEmployment("شاغر وظيفي محاسب دوام كامل")).toBe("دوام كامل"));
});
