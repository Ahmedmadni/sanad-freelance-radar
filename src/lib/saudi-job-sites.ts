import { decode, inferEmployment, isAccounting, isAccountingRequest, isSaudi, type RawItem } from "./feeds";
import type { Employment } from "./opportunities";

export type SaudiJob = RawItem & { location: string; employment: Employment };

/** Discover only employer accounting detail pages in OpenSooq's public rendered HTML. */
export function parseOpenSooqLinks(html: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] ?? "";
    const attr = (name: string) => attrs.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] ?? "";
    if (attr("data-cat1-code") !== "JobsVertical" || attr("data-cat2-code") !== "JobPoster") continue;
    const path = attr("href");
    const title = decode((match[2] ?? "").match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? "");
    if (/^\/ar\/job-posters\/\d+$/.test(path) && isAccountingRequest(title, true)) links.push(`https://sa.opensooq.com${path}`);
  }
  return [...new Set(links)];
}

/** Decode public React data as JSON only; never execute scripts or extract contact-reveal keys. */
type OpenSooqListingData = {
  type?: string;
  commonInfo?: { postId?: number; topTitle?: string };
  loggingData?: { categoryReportingName?: string; subCategoryReportingName?: string; isListingLive?: boolean };
  job?: { applyButton?: { isEnabled?: boolean } };
};
function openSooqListingData(html: string, id: number): OpenSooqListingData | undefined {
  const find = (value: unknown): OpenSooqListingData | undefined => {
    if (!value || typeof value !== "object") return undefined;
    if (Array.isArray(value)) {
      for (const child of value) { const found = find(child); if (found) return found; }
      return undefined;
    }
    const object = value as Record<string, any>;
    if (object['listingData']?.commonInfo?.postId === id) return object['listingData'];
    for (const child of Object.values(object)) { const found = find(child); if (found) return found; }
    return undefined;
  };
  let stream = "";
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const encoded = (script[1] ?? "").match(/self\.__next_f\.push\(\[1,("[\s\S]*")\]\)/)?.[1];
    if (!encoded) continue;
    try { stream += JSON.parse(encoded); } catch { continue; }
  }
  for (const line of stream.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    try { const found = find(JSON.parse(line.slice(colon + 1))); if (found) return found; } catch { continue; }
  }
  return undefined;
}

/** Require this exact ad to be live AND accepting applications; suggested ads never establish status. */
export function parseOpenSooqDetail(html: string, link: string, now = Date.now()): SaudiJob[] {
  const canonical = jobUrl(link, "https://sa.opensooq.com");
  const id = canonical?.match(/\/ar\/job-posters\/(\d+)$/)?.[1];
  if (!canonical || !id) return [];
  const data = openSooqListingData(html, Number(id));
  if (!data) throw new Error("تعذر التحقق من حالة إعلان السوق المفتوح");
  if (data.type !== "job" || data.loggingData?.categoryReportingName !== "JobsVertical" || data.loggingData?.subCategoryReportingName !== "JobPoster" || data.loggingData?.isListingLive !== true || data.job?.applyButton?.isEnabled !== true) return [];
  const jobs = parseStructuredSaudiJobs(html, canonical, "https://sa.opensooq.com", now, true);
  return jobs.filter((job) => isAccountingRequest(`${job.title} ${job.description}`, true)).map((job) => ({ ...job, title: decode(String(data.commonInfo?.topTitle ?? job.title)) }));
}

/** Read only active Saudi employer vacancies, never service listings or job seekers. */
export function parseOpenSooq(html: string, now = Date.now()): SaudiJob[] {
  const payload = html.match(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!payload) throw new Error("تعذرت قراءة قائمة الوظائف");
  const items = JSON.parse(payload)?.props?.pageProps?.serpApiResponse?.listings?.items;
  if (!Array.isArray(items)) throw new Error("تعذرت قراءة قائمة الوظائف");
  const out: SaudiJob[] = [];
  for (const x of items) {
    if (x.cat1_code !== "JobsVertical" || x.cat2_code !== "JobPoster" || x.is_active !== true) continue;
    const expiry = String(x.expired_at ?? "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!expiry) continue;
    const day = Number(expiry[1]), month = Number(expiry[2]), year = Number(expiry[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year || date.getTime() + 86400000 <= now) continue;
    const title = decode(String(x.title ?? ""));
    const description = decode(String(x.masked_description ?? ""));
    const location = decode(String(x.city_label ?? ""));
    const path = String(x.post_url ?? "");
    if (!/^\/job-posters\/\d+$/.test(path) || !isSaudi(location) || !isAccountingRequest(`${title} ${description}`, true)) continue;
    const posted = Date.parse(String(x.inserted_date ?? ""));
    out.push({ title, description: description.slice(0, 600), location, link: `https://sa.opensooq.com/ar${path}`, publishedAt: Number.isFinite(posted) ? new Date(posted).toISOString() : null, employment: inferEmployment(`${title} ${description}`) });
  }
  return out;
}

/** Saudi accounting vacancy links are location evidence; service and other-job rows are not. */
export function parseMourjan(html: string, now = Date.now()): SaudiJob[] {
  const cities: Record<string, string> = { riyadh: "الرياض", "al-riyadh": "الرياض", jeddah: "جدة", dammam: "الدمام", "al-madina": "المدينة المنورة", makkah: "مكة", khobar: "الخبر", taif: "الطائف", tabuk: "تبوك", abha: "أبها", qassim: "القصيم", "al-qassim": "القصيم", jubail: "الجبيل", hail: "حائل", jazan: "جازان", najran: "نجران", yanbu: "ينبع" };
  const jobs: SaudiJob[] = [];
  for (const block of html.split('<div class=widget id=').slice(1)) {
    const raw = block.match(/href=["']?(\/sa\/[^\s>"']+)/)?.[1];
    const link = raw ? jobUrl(raw, "https://www.mourjan.com") : null;
    const description = decode(block.match(/class="content[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "");
    if (!link || !/^\/sa\/(?:[^/]+\/)?accounting\/vacancies\/\d+\/$/.test(new URL(link).pathname)) continue;
    if (!isAccountingRequest(description, true) || /تم شغل|انتهى الإعلان|انتهى الاعلان|التقديم مغلق/.test(description)) continue;
    const when = decode(block.match(/<div>(منذ[^<]+)<\/div>/)?.[1] ?? "");
    const n = Number(when.match(/\d+/)?.[0] ?? 1);
    const minutes = /دقيق/.test(when) ? n : /ساع/.test(when) ? n * 60 : /يوم|أيام/.test(when) ? n * 1440 : /أسبوع|اسبوع|أسابيع/.test(when) ? n * 10080 : /شهر|أشهر/.test(when) ? n * 43200 : null;
    const city = cities[new URL(link).pathname.split("/")[2] ?? ""] ?? "السعودية";
    jobs.push({ title: description.length > 90 ? `${description.slice(0, 90)}…` : description, description: description.slice(0, 600), link,
      publishedAt: minutes === null ? null : new Date(now - minutes * 60000).toISOString(), location: city, employment: inferEmployment(description) });
  }
  return jobs;
}

function jobUrl(raw: string, origin: string, preserveJobKey = false) {
  try {
    const url = new URL(decode(raw), origin);
    if (url.origin !== origin || url.protocol !== "https:") return null;
    const key = preserveJobKey ? url.searchParams.get("jk") : null;
    url.search = "";
    if (key) url.searchParams.set("jk", key);
    url.hash = "";
    return url.href;
  } catch { return null; }
}

/** Only the green/open employer rows in Wadhefa's accounting category. */
export function parseWadhefa(html: string): SaudiJob[] {
  const jobs: SaudiJob[] = [];
  for (const row of html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    if (!/green-dot\.png/.test(row) || /red-dot\.png|warning_red\.png|تم شغلها/.test(row)) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    const anchor = row.match(/<a\b[^>]*href=["']([^"']*\/details\/job\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    const link = anchor?.[1] ? jobUrl(anchor[1], "https://www.wadhefa.com") : null;
    const title = decode(anchor?.[2] ?? "");
    const location = decode(cells[4] ?? "");
    if (!link || !title || !isAccounting(title) || !isSaudi(location)) continue;
    const date = decode(cells[1] ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const publishedAt = date ? new Date(Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1]))).toISOString() : null;
    jobs.push({ title, link, location, publishedAt, description: decode(cells[3] ?? ""), employment: "غير محدد" });
  }
  return jobs;
}

export function parseWadhefaDetail(html: string) {
  const open = /notice-box-open|التقديم مفتوح/.test(html) && !/notice-box-closed|تم شغلها/.test(html);
  const description = decode(html.match(/<td\b[^>]*class=["']td4textarea["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "");
  const typeRow = html.match(/نوع الوظيفة[\s\S]*?<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "";
  return { open, description: description.slice(0, 600), employment: inferEmployment(decode(typeRow)) };
}

export function parseMihnatiLinks(html: string): string[] {
  const links = [...html.matchAll(/<h3\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => jobUrl(m[1] ?? "", "https://www.mihnati.com"))
    .filter((url): url is string => Boolean(url && /-jobs-\d+$/.test(url)));
  return [...new Set(links)];
}

export type GlobalJobSite = "indeed" | "naukrigulf" | "bayt";
export const GLOBAL_JOB_SITES = {
  indeed: { name: "إنديد", origin: "https://sa.indeed.com", search: "https://sa.indeed.com/jobs?q=accountant&l=Saudi%20Arabia" },
  naukrigulf: { name: "نوكري غلف", origin: "https://www.naukrigulf.com", search: "https://www.naukrigulf.com/accountant-jobs-in-saudi-arabia" },
  bayt: { name: "بيت", origin: "https://www.bayt.com", search: "https://www.bayt.com/en/saudi-arabia/jobs/accountant-jobs/" },
} as const;

/** Only job-detail anchors observed in the platforms' public search markup. */
export function parseGlobalJobLinks(html: string, site: GlobalJobSite): string[] {
  const origin = GLOBAL_JOB_SITES[site].origin;
  if (site === "indeed") {
    return [...new Set([...html.matchAll(/<a\b[^>]*\bdata-jk=["']([a-f0-9]+)["'][^>]*>/gi)]
      .map((m) => `${origin}/viewjob?jk=${m[1]}`))];
  }
  const pattern = site === "bayt" ? /\/en\/saudi-arabia\/jobs\/[^/]+-\d+\/$/ : /-jid-\d+$/;
  return [...new Set([...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => jobUrl(m[1] ?? "", origin))
    .filter((url): url is string => Boolean(url && pattern.test(new URL(url).pathname))))];
}

type Posting = {
  "@type"?: string | string[];
  "@graph"?: Posting[];
  title?: string; description?: string; datePosted?: string; validThrough?: string;
  employmentType?: string | string[];
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string | { name?: string } } } | { address?: { addressLocality?: string; addressCountry?: string | { name?: string } } }[];
  hiringOrganization?: { name?: string };
  url?: string;
};

/** Reject expired postings and validate their structured country, not the page's navigation. */
export function parseMihnati(html: string, link: string, now = Date.now()): SaudiJob[] {
  return parseStructuredSaudiJobs(html, link, "https://www.mihnati.com", now);
}

/** Read employer JobPosting records; a search page's country selector is never location evidence. */
export function parseStructuredSaudiJobs(html: string, link: string, origin: string, now = Date.now(), verifiedLive = false): SaudiJob[] {
  const out: SaudiJob[] = [];
  const collect = (value: Posting | Posting[]): Posting[] => {
    if (Array.isArray(value)) return value.flatMap(collect);
    if (!value || typeof value !== "object") return [];
    return [value, ...(value["@graph"] ?? []).flatMap(collect)];
  };
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let postings: Posting[];
    try { postings = collect(JSON.parse(script[1] ?? "")); } catch { continue; }
    for (const job of postings) {
      if (![job["@type"]].flat().includes("JobPosting")) continue;
      const expiry = job.validThrough ? Date.parse(job.validThrough) : NaN;
      if (job.validThrough ? !Number.isFinite(expiry) || expiry <= now : !verifiedLive) continue;
      const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
      // A multi-country posting is accepted only for its explicitly Saudi location.
      const saudi = locations.find((place) => {
        const country = place?.address?.addressCountry;
        const name = typeof country === "string" ? country : country?.name;
        return /^(SA|SAU|Saudi Arabia|المملكة العربية السعودية|السعودية)$/i.test(name ?? "");
      });
      const title = decode(String(job.title ?? ""));
      const description = decode(String(job.description ?? ""));
      const url = jobUrl(job.url ?? link, origin, true);
      if (!saudi || !url || !title || !isAccounting(`${title} ${description}`)) continue;
      const types = [job.employmentType ?? []].flat();
      const employment: Employment = types.includes("PART_TIME") ? "دوام جزئي" : types.includes("FULL_TIME") ? "دوام كامل" : types.some((type) => /^(CONTRACTOR|TEMPORARY|CONTRACT|FIXED_TERM)$/.test(type)) ? "عقد مؤقت" : inferEmployment(description);
      const date = Date.parse(job.datePosted ?? "");
      out.push({ title, description: description.slice(0, 600), link: url, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
        location: `${decode(job.hiringOrganization?.name ?? "")} · ${saudi.address?.addressLocality ?? "السعودية"}`, employment });
    }
  }
  return out;
}