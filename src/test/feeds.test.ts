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
