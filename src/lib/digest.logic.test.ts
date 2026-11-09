import { describe, expect, it } from "vitest";
import { dueDigestSlot, escapeTelegramHtml, formatDigestParts, riyadhClock } from "./digest.logic";
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
  });
  it("sends once for daily users, twice for twice-daily users", () => {
    expect(dueDigestSlot(new Date("2026-11-09T17:00:00Z"), 1)).toBe("2026-11-09-morning");
    expect(dueDigestSlot(new Date("2026-11-09T17:00:00Z"), 2)).toBe("2026-11-09-evening");
    expect(dueDigestSlot(new Date("2026-11-09T23:00:00Z"), 2)).toBeNull();
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
    expect(parts[0]?.text).toContain("إجمالي الفرص الجديدة: <b>120</b>");
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
  });
});
