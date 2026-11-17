import { describe, expect, it } from "vitest";
import { collectIndependentPages } from "../lib/feeds.functions";

describe("partial job source recovery", () => {
  it("keeps verified opportunities from healthy pages when one times out", async () => {
    const result = await collectIndependentPages([
      async () => [{ title: "محاسب مالي بالرياض", link: "https://example.org/job/1", sourceName: "مصدر", description: "", publishedAt: null }],
      async () => { throw new Error("HTTP 429"); },
      async () => [{ title: "مسك دفاتر بجدة", link: "https://example.org/job/2", sourceName: "مصدر", description: "", publishedAt: null }],
    ], "مصدر");
    expect(result.items.map((item) => item.title)).toEqual(["محاسب مالي بالرياض", "مسك دفاتر بجدة"]);
    expect(result.failedRequests).toBe(1);
  });

  it("fails the source only when all individual requests fail", async () => {
    await expect(collectIndependentPages([
      async () => { throw new Error("HTTP 403"); },
      async () => { throw new Error("HTTP 429"); },
    ], "المصدر")).rejects.toThrow("جميع صفحات المصدر");
  });

  it("treats an empty source list as a valid no-open-jobs result", async () => {
    expect(await collectIndependentPages([], "فارغ")).toEqual({
      items: [], failedRequests: 0,
    });
  });

  it("counts successful empty pages without misclassifying them as failed", async () => {
    expect(await collectIndependentPages([
      async () => [],
      async () => { throw new Error("503"); },
    ], "مصدر")).toEqual({ items: [], failedRequests: 1 });
  });
});
