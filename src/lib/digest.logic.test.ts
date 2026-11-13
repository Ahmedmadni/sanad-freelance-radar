import { describe, expect, it } from "vitest";
import { dueDigestSlot, escapeTelegramHtml, formatDigestParts, riyadhClock, recoverableDigestSlots } from "./digest.logic";
import type { DigestEntry } from "./digest.logic";

function mockJob(id: number, extras?: Partial<DigestEntry>): DigestEntry {
  return {
    id: "job-" + id,
    title: "مطلوب محاسب مالي في الرياض " + id,
    platform: "حراج",
    url: "https://example.org/jobs/" + id,
    description: "مسك دفاتر وإعداد إقرارات ضريبية وتقارير مالية",
    budgetMin: 800,
    budgetMax: 1200,
    budgetCurrency: "SAR",
    employment: "عمل حر",
    workMode: "عن بعد",
    ...extras,
  };
}

describe("daily report schedule", () => {
  it("uses Riyadh time without depending on GitHub runner timezone", () => {
    expect(riyadhClock(new Date("2026-11-09T05:00:00Z"))).toEqual({ day: "2026-11-09", hour: 8 });
    expect(dueDigestSlot(new Date("2026-11-09T04:59:00Z"), 1)).toBeNull();
    expect(dueDigestSlot(new Date("2026-11-09T05:00:00Z"), 1)).toBe("2026-11-09-morning");
  }, 15000);
  it("sends once for daily users, twice for twice-daily users", () => {
    expect(dueDigestSlot(new Date("2026-11-09T17:00:00Z"), 1)).toBeNull();
    expect(dueDigestSlot(new Date("2026-11-09T17:00:00Z"), 2)).toBe("2026-11-09-evening");
    expect(dueDigestSlot(new Date("2026-11-09T23:00:00Z"), 2)).toBeNull();
  });
});

describe("recovery from skipped/delayed GitHub schedules", () => {
  it("recovers missed previous-day reports in the next day's early hours", () => {
    expect(recoverableDigestSlots(new Date("2026-11-13T00:30:00Z"), 2))
      .toEqual(["2026-11-12-morning", "2026-11-12-evening"]);
  });

  it("recovers yesterday's missing evening report alongside today's morning", () => {
    expect(recoverableDigestSlots(new Date("2026-11-13T09:54:00Z"), 2))
      .toEqual(["2026-11-12-morning", "2026-11-12-evening", "2026-11-13-morning"]);
  });

  it("only includes the evening slot after 20:00 Riyadh", () => {
    expect(recoverableDigestSlots(new Date("2026-11-13T16:59:00Z"), 2))
      .toEqual(["2026-11-12-morning", "2026-11-12-evening", "2026-11-13-morning"]);
    expect(recoverableDigestSlots(new Date("2026-11-13T17:00:00Z"), 2))
      .toEqual(["2026-11-12-morning", "2026-11-12-evening", "2026-11-13-morning", "2026-11-13-evening"]);
  });

  it("doesn't create an evening report for once-daily configuration", () => {
    expect(recoverableDigestSlots(new Date("2026-11-13T19:00:00Z"), 1))
      .toEqual(["2026-11-12-morning", "2026-11-13-morning"]);
  });

  it("handles a year transition in Saudi time", () => {
    expect(recoverableDigestSlots(new Date("2027-01-01T00:15:00Z"), 2))
      .toEqual(["2026-12-31-morning", "2026-12-31-evening"]);
  });
});

describe("complete Telegram digest", () => {
  it("includes every opportunity, splits safely under Telegram limit", () => {
    const items = Array.from({ length: 120 }, (_ignored, i) => mockJob(i + 1));
    const parts = formatDigestParts(items, "2026-11-09-morning");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.text.length <= 3500)).toBe(true);
    const ids = parts.flatMap((part) => part.ids);
    expect(new Set(ids).size).toBe(120);
    expect(ids).toEqual(items.map((item) => item.id));
    expect(parts[0]?.text).toContain("🎯 <b>120 فرصة جديدة</b>");
    expect(parts[0]?.text).toContain("09/11/2026");
    expect(parts[0]?.text).toContain("التقرير الصباحي");
    expect(parts[0]?.text).toContain("الجزء 1 من " + parts.length);
    expect(parts.slice(1).every((part) => !part.text.includes("فرصة جديدة</b>"))).toBe(true);
    expect(parts.slice(1).every((part) => part.text.includes("استكمال الفرص"))).toBe(true);
    expect(parts.slice(0, -1).every((part) => !part.text.includes("انتهى التقرير"))).toBe(true);
    expect(parts.at(-1)?.text).toContain("انتهى التقرير");
  });

  it("does not report zero new jobs as an error", () => {
    const parts = formatDigestParts([], "2026-11-09-morning");
    expect(parts).toHaveLength(1);
    expect(parts[0]?.text).toContain("لا توجد فرص جديدة");
  });

  it("escapes untrusted source HTML and preserves currency", () => {
    const [part] = formatDigestParts([
      mockJob(1, { title: "<script>alert(1)</script>", platform: "Source & Co", budgetCurrency: "SAR" }),
    ], "2026-11-09-morning");
    expect(part?.text).toContain("&lt;script&gt;");
    expect(part?.text).toContain("Source &amp; Co");
    expect(part?.text).toContain("ريال");
    expect(escapeTelegramHtml("a < b & c")).toBe("a &lt; b &amp; c");
    expect(part?.text).toContain('<a href="https://example.org/jobs/1">عرض التفاصيل والتقديم</a>');
  });
  it("formats readable compact morning and evening summaries without duplicate headers", () => {
    const morning = formatDigestParts([mockJob(1)], "2026-11-10-morning")[0];
    const evening = formatDigestParts([mockJob(1)], "2026-11-10-evening")[0];
    expect(morning?.text).toContain("10/11/2026  ·  التقرير الصباحي");
    expect(evening?.text).toContain("التقرير المسائي");
    expect(morning?.text).toContain("01 | مطلوب محاسب مالي");
    expect(morning?.text).toContain("💰 800–1,200 ريال");
    expect(morning?.text).toContain("عرض التفاصيل والتقديم</a>");
    expect(morning?.text).not.toContain("الجزء 1 من 1");
  });

  it("protects Telegram HTML and links from untrusted job content", () => {
    const [part] = formatDigestParts([
      mockJob(1, {
        title: '<img src=x onerror="alert(1)">',
        description: "تجربة & اختبار <script>evil</script>",
        url: "https://example.org/?a=1&b=2",
        platform: 'Business "A" & B',
      }),
    ], "2026-11-10-evening");
    expect(part?.text).not.toContain("<img");
    expect(part?.text).not.toContain("<script>");
    expect(part?.text).toContain("&lt;img");
    expect(part?.text).toContain("&quot;A&quot;");
    expect(part?.text).toContain('href="https://example.org/?a=1&amp;b=2"');
    expect(part?.text).toContain("evil&lt;/script&gt;");
    expect(part?.text).toContain("10/11/2026");
  });

  it("handles unsafe and oversized URLs without cutting through HTML tags", () => {
    const items = [
      mockJob(1, { url: "javascript:alert(1)", title: "A".repeat(400), description: "B".repeat(1000) }),
      mockJob(2, { url: "https://example.org/" + "x".repeat(2000) }),
      mockJob(3),
    ];
    const parts = formatDigestParts(items, "2026-11-10-morning", 650);
    expect(parts.every((part) => part.text.length <= 650)).toBe(true);
    expect(parts.flatMap((part) => part.ids)).toEqual(items.map((i) => i.id));
    expect(parts.map((part) => part.text).join("\n")).not.toContain('href="javascript:');
    expect(parts.map((part) => part.text).join("\n")).toContain("رابط التقديم غير متاح");
    expect(parts.map((part) => part.text).join("\n")).toContain("عرض التفاصيل والتقديم</a>");
  });

  it("never drops a job when descriptions are long", () => {
    const items = Array.from({ length: 20 }, (_v, i) => mockJob(i + 1, {
      title: "مطلوب محاسب ضرائب ومراجعة " + String(i + 1),
      description: "التفاصيل والمسؤوليات والمهارات المطلوبة ".repeat(40),
    }));
    const parts = formatDigestParts(items, "2026-11-10-evening");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((part) => part.ids)).toEqual(items.map((item) => item.id));
    expect(parts.every((part) => part.text.length <= 3500)).toBe(true);
  });

});
