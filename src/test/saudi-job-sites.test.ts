import { describe, expect, it } from "vitest";
import { parseWadhefa, parseWadhefaDetail, parseMihnati, parseMihnatiLinks, parseStructuredSaudiJobs, parseGlobalJobLinks } from "@/lib/saudi-job-sites";

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
    const detail = parseWadhefaDetail(`<div class="notice-box-open">التقديم مفتوح</div><td class="td4textarea">خبرة في مشروع محاسبي</td><TR><TD>نوع الوظيفة:</TD><TD class="ulli">دوام كامل</TD></TR>`);
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

describe.each([
  ["Indeed", "https://sa.indeed.com", "/viewjob?jk=123"],
  ["Naukrigulf", "https://www.naukrigulf.com", "/accountant-jobs-in-riyadh-123"],
  ["Bayt", "https://www.bayt.com", "/en/saudi-arabia/jobs/accountant-123/"],
])("%s structured employer postings", (_name, origin, path) => {
  const parse = (over: Record<string, unknown> = {}) => parseStructuredSaudiJobs(posting(over), `${origin}${path}`, origin, now);
  it("accepts accounting employment explicitly located inside Saudi Arabia", () => {
    expect(parse()[0]).toMatchObject({ title: "محاسب", employment: "دوام كامل" });
  });
  it("preserves each job's actual application link", () => {
    expect(parse()[0]?.link).toBe(`${origin}${path}`);
  });
  it("rejects outside-Saudi jobs even with Saudi requirements", () => {
    expect(parse({ description: "محاسب خبرة بالسعودية", jobLocation: { address: { addressLocality: "Dubai", addressCountry: "AE" } } })).toEqual([]);
  });
  it("rejects jobs without an explicit Saudi country", () => {
    expect(parse({ jobLocation: { address: { addressLocality: "الرياض" } } })).toEqual([]);
  });
  it("excludes expired applications", () => {
    expect(parse({ validThrough: "2026-10-31" })).toEqual([]);
  });
  it("does not claim availability without a deadline", () => {
    expect(parse({ validThrough: undefined })).toEqual([]);
  });
  it("keeps part-time separate from full-time", () => {
    expect(parse({ employmentType: "PART_TIME" })[0]?.employment).toBe("دوام جزئي");
  });
  it("rejects non-accounting jobs", () => {
    expect(parse({ title: "Civil engineer", description: "Building design" })).toEqual([]);
  });
  it("rejects a job link outside its platform", () => {
    expect(parse({ url: "https://unrelated.example/job" })).toEqual([]);
  });
});

describe("global platform application links", () => {
  it("keeps Indeed job keys rather than collapsing jobs to the search page", () => {
    expect(parseGlobalJobLinks('<a data-jk="d685ee067cea7ca6" href="/rc/clk?jk=d685ee067cea7ca6">Accountant</a>', "indeed")).toEqual(["https://sa.indeed.com/viewjob?jk=d685ee067cea7ca6"]);
  });
  it("keeps Naukrigulf details and rejects navigation and other domains", () => {
    expect(parseGlobalJobLinks('<a href="https://www.naukrigulf.com/accountant-jobs-in-riyadh-jid-011126000024">Accountant</a><a href="/accountant-jobs-in-saudi-arabia">Search</a><a href="https://example.com/job-jid-123">Other</a>', "naukrigulf")).toEqual(["https://www.naukrigulf.com/accountant-jobs-in-riyadh-jid-011126000024"]);
  });
  it("only discovers Saudi Bayt job pages", () => {
    expect(parseGlobalJobLinks('<a href="/en/saudi-arabia/jobs/accountant-5503246/">Accountant</a><a href="/en/uae/jobs/accountant-123/">Dubai</a>', "bayt")).toEqual(["https://www.bayt.com/en/saudi-arabia/jobs/accountant-5503246/"]);
  });
});