import { describe, expect, it } from "vitest";
import { parseWadhefa, parseWadhefaDetail, parseMihnati, parseMihnatiLinks } from "@/lib/saudi-job-sites";

const row = (status = "green", city = "الرياض - منطقة الرياض", title = "محاسب") => `<tr><td><input name="job_id[]"></td><td>19/10/2026</td><td><img src="${status}-dot.png"><a href="https://www.wadhefa.com/details/job/90281/search/">${title}</a></td><td>شركة مقاولات</td><td>${city}</td></tr>`;
const now = Date.parse("2026-11-01T06:10:00Z");
const link = "https://www.mihnati.com/company-riyadh-jobs-1868366";
const posting = (over: Record<string, unknown> = {}) => `<script type="application/ld+json">${JSON.stringify({
  "@type": "JobPosting", title: "محاسب", description: "إعداد القيود والقوائم المالية", datePosted: "2026-10-19", validThrough: "2026-12-01", employmentType: ["FULL_TIME"],
  jobLocation: { address: { addressLocality: "الرياض", addressCountry: { name: "SA" } } }, ...over,
})}</script>`;

describe("Saudi employer vacancies", () => {
  it("reads open Wadhefa accounting jobs with their actual link and day-first date", () => {
    expect(parseWadhefa(row())[0]).toMatchObject({ title: "محاسب", link: "https://www.wadhefa.com/details/job/90281/search/", publishedAt: "2026-10-19T00:00:00.000Z", location: "الرياض - منطقة الرياض" });
  });
  it("does not show filled Wadhefa jobs", () => expect(parseWadhefa(row("red"))).toHaveLength(0));
  it("does not show Wadhefa jobs outside Saudi Arabia", () => expect(parseWadhefa(row("green", "القاهرة"))).toHaveLength(0));
  it("does not show non-accounting Wadhefa jobs", () => expect(parseWadhefa(row("green", "الرياض", "مهندس مدني"))).toHaveLength(0));
  it("reads full-time from the job-type field, not incidental description", () => {
    const detail = parseWadhefaDetail(`<div class="notice-box-open">التقديم مفتوح</div><td class="td4textarea">خبرة في مشروع محاسبي</td><tr><td>نوع الوظيفة:</td><td class="ulli">دوام كامل</td></tr>`);
    expect(detail.employment).toBe("دوام كامل");
    expect(detail.open).toBe(true);
  });
  it("checks closed status again on the Wadhefa detail page", () => expect(parseWadhefaDetail("<div>تم شغلها</div>").open).toBe(false));
  it("reads part-time Wadhefa employment separately", () => expect(parseWadhefaDetail('<td>نوع الوظيفة:</td><td>دوام جزئي</td>').employment).toBe("دوام جزئي"));
  it("normalizes only Mihnati job links", () => expect(parseMihnatiLinks('<h3><a href="//www.mihnati.com/company-riyadh-jobs-1868366?utm=x">محاسب</a></h3>')).toEqual([link]));
  it("keeps unexpired Saudi Mihnati jobs", () => expect(parseMihnati(posting(), link, now)[0]).toMatchObject({ title: "محاسب", employment: "دوام كامل" }));
  it("excludes expired Mihnati jobs even if still listed", () => expect(parseMihnati(posting({ validThrough: "2026-09-09T00:00:00+05:00" }), link, now)).toHaveLength(0));
  it("rejects jobs without a verifiable deadline", () => expect(parseMihnati(posting({ validThrough: undefined }), link, now)).toHaveLength(0));
  it("rejects non-Saudi structured country even if description mentions Saudi", () => {
    expect(parseMihnati(posting({ description: "محاسب ذو خبرة في السعودية", jobLocation: { address: { addressLocality: "القاهرة", addressCountry: "EG" } } }), link, now)).toHaveLength(0);
  });
  it("maps structured part-time separately", () => expect(parseMihnati(posting({ employmentType: ["PART_TIME"] }), link, now)[0]?.employment).toBe("دوام جزئي"));
  it("leaves OTHER unspecified without inferring a salaried position", () => expect(parseMihnati(posting({ employmentType: ["OTHER"] }), link, now)[0]?.employment).toBe("غير محدد"));
  it("rejects non-accounting Mihnati jobs", () => expect(parseMihnati(posting({ title: "مهندس مدني", description: "تصميم مبان" }), link, now)).toHaveLength(0));
});