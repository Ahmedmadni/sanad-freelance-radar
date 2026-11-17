import { createServerFn } from "@tanstack/react-start";
import { requireOwner, limitOwnerAction } from "./owner-auth";
import { classifySourceError, type SourceErrorCode } from "./source-health";
import { parseFeed, parseJson, dedupe, isAccounting, isAccountingRequest, isSaudi, toOpportunity, parseLinkedIn, inferEmployment, type RawItem } from "./feeds";
import type { Employment } from "./opportunities";
import { parseWadhefa, parseWadhefaDetail, parseMihnatiLinks, parseMihnati, parseMourjan, parseOpenSooq, parseOpenSooqLinks, parseOpenSooqDetail, parseStructuredSaudiJobs, parseGlobalJobLinks, GLOBAL_JOB_SITES, type GlobalJobSite } from "./saudi-job-sites";

type In = { sources: { name: string; url: string; type: "RSS" | "Webhook" }[] };
type Item = RawItem & { sourceName: string; location?: string; employment?: Employment };
type Status = {
  name: string; url: string; ok: boolean; count: number;
  error: string | null; builtIn: boolean;
  partial?: boolean; failedRequests?: number;
};
export type SourceCollection = { items: Item[]; failedRequests: number };

/** Keep verified jobs from healthy search pages even if another page fails.
 * Only a complete outage marks the whole source unavailable.
 * Page failures are recorded as partial coverage, not hidden as success. */
export async function collectIndependentPages(
  requests: Array<() => Promise<Item[]>>,
  label: string,
): Promise<SourceCollection> {
  if (requests.length === 0) return { items: [], failedRequests: 0 };
  const responses = await Promise.allSettled(requests.map((request) => request()));
  const succeeded = responses.filter((r): r is PromiseFulfilledResult<Item[]> => r.status === "fulfilled");
  if (!succeeded.length) {
    // Never expose the original upstream error: it might include URLs,
    // hidden tokens, request details, or raw anti-bot challenge data.
    const causes = responses.map((r) => r.status === "rejected"
      ? classifySourceError(r.reason instanceof Error ? r.reason.message : "")
      : "unknown" as SourceErrorCode);
    const ranked = [...new Set(causes)].sort((left, right) =>
      causes.filter((v) => v === right).length - causes.filter((v) => v === left).length);
    throw new Error("source_batch_failed:" + (ranked[0] ?? "unknown"));
  }
  return {
    items: succeeded.flatMap((r) => r.value),
    failedRequests: responses.length - succeeded.length,
  };
}


const blockedHost = (hostname: string) => {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal") return true;
  if (h.startsWith("[") && h.endsWith("]")) return true; // Reject IPv6 literals (including mapped IPv4).
  const parts = h.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const octets = parts.map(Number);
    const a = octets[0] ?? 0;
    const b = octets[1] ?? 0;
    if (octets.some((n) => n > 255)) return true;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 88) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0);
  }
  // Reject obfuscated numeric IPv4 forms resolved by WHATWG URL to an IPv4 literal.
  return false;
};

export function safeUrl(raw: string) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("رابط غير مدعوم");
  if (u.username || u.password || blockedHost(u.hostname)) throw new Error("لا يمكن الوصول لعناوين داخلية");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("منفذ غير مسموح");
  return u.toString();
}

/** Check redirects individually. Final DNS/IP validation must additionally happen at the egress layer. */
async function readResponseLimited(response: Response, maxBytes = 2_000_000): Promise<string> {
  if (Number(response.headers.get("content-length") ?? "0") > maxBytes) throw new Error("استجابة المصدر أكبر من الحد المسموح");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("استجابة المصدر أكبر من الحد المسموح");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function fetchSafeUrl(raw: string): Promise<Response> {
  let url = safeUrl(raw);
  for (let redirect = 0; redirect < 4; redirect++) {
    const response = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 AccountingGigRadar/1.0", Accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*" },
      signal: AbortSignal.timeout(12000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("إعادة توجيه غير صالحة");
      url = safeUrl(new URL(location, url).toString());
      continue;
    }
    return response;
  }
  throw new Error("عدد كبير من عمليات إعادة التوجيه");
}

// ---- Haraj (Saudi classifieds) public search ----
const HARAJ_URL =
  "https://graphql.haraj.com.sa/?queryName=search&lang=ar&clientId=5PfyC2s3-xlv8-ManX-RCdf-LqhFYr5SkUh3v3&version=N9.0.38";
const HARAJ_QUERY =
  "query Search($search: String!, $page: Int) { search(search: $search, page: $page) { items { id title postDate updateDate URL bodyTEXT city } } }";
const HARAJ_SEARCHES = ["مطلوب محاسب", "مطلوب محاسبة", "مطلوب محاسبه", "احتاج محاسب", "محاسب متعاون", "محاسب عن بعد", "محاسب دوام جزئي", "مسك دفاتر", "اقرار ضريبي", "قوائم مالية", "اقرار زكوي", "مراجعة حسابات", "محاسب قانوني"];
const ACC = /محاسب|محاسبة|محاسبه|دفاتر|ضريب|زكا|قوائم مالية|مراجع حسابات|مراجعة حسابات|ميزانية الشركة/;
// Keep posts from people who NEED an accountant, drop accountants advertising themselves.
const WANTS = /مطلوب|احتاج|أحتاج|ابغى|أبغى|ابي |نبحث عن|نحتاج|ابحث عن محاسب|أبحث عن محاسب|يوجد لدينا|لمن لديه خبرة/;
const SELF_AD = /ابحث عن وظيفة|أبحث عن وظيفة|ابحث عن عمل|أبحث عن عمل|^انا محاسب|^أنا محاسب|لدي خبرة|لدية خبرة|اقدم خدم|أقدم خدم|نقدم خدم|خدمات محاسبية|مكتب محاسب|برنامج محاسب|برامج محاسب|باقة|كاشير|حاصل على|للبيع|اشتراك|نظام نقاط بيع/;

async function fetchHaraj(): Promise<SourceCollection> {
  const requests = HARAJ_SEARCHES.flatMap((search) =>
    [1, 2].map((page) => async (): Promise<Item[]> => {
      const res = await fetch(HARAJ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://haraj.com.sa", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ query: HARAJ_QUERY, variables: { search, page } }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = (await res.json()) as {
        data?: { search?: { items?: Array<{
          title?: string; bodyTEXT?: string; URL?: string; updateDate?: number; postDate?: number; city?: string;
        }> } };
      };
      const posts = j?.data?.search?.items;
      if (!Array.isArray(posts)) throw new Error("تعذر التحقق من نتائج حراج");
      const matched: Item[] = [];
      for (const p of posts) {
        const title = String(p.title ?? "");
        const body = String(p.bodyTEXT ?? "");
        const head = title + " " + body.slice(0, 120);
        if (!WANTS.test(head) || !ACC.test(head) || SELF_AD.test(title) ||
          SELF_AD.test(body.slice(0, 80)) || !isAccountingRequest(title + " " + body)) continue;
        const timestamp = Number(p.updateDate || p.postDate);
        const publishedAt = Number.isFinite(timestamp) && timestamp > 0
          ? new Date(timestamp * 1000).toISOString() : null;
        matched.push({
          title, description: body.slice(0, 600),
          link: "https://haraj.com.sa/" + String(p.URL ?? "").replace(/^\/+/, ""),
          publishedAt,
          sourceName: "حراج",
          location: p.city ? "حراج · " + p.city : "حراج",
          employment: inferEmployment(title + " " + body),
        });
      }
      return matched;
    }),
  );
  return collectIndependentPages(requests, "حراج");
}

// ---- OpenSooq Saudi (السوق المفتوح): job vacancies + "wanted" posts only, never service ads ----
const OS_TERMS = ["مطلوب محاسب", "محاسب", "محاسبة", "مسك دفاتر"];
async function fetchOpenSooq(): Promise<SourceCollection> {
  const links = new Set<string>();
  const searches = await collectIndependentPages(
    OS_TERMS.map((term) => async (): Promise<Item[]> => {
      const response = await fetch("https://sa.opensooq.com/ar/find?term=" + encodeURIComponent(term), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Accept-Language": "ar",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      if (/<script\b[^>]*id=["']__NEXT_DATA__["']/.test(html)) {
        return parseOpenSooq(html).map((job) => ({ ...job, sourceName: "السوق المفتوح" }));
      }
      if (!/data-testid=["']serp-(?:job-card|job-specs)["']/.test(html)) {
        throw new Error("تعذرت قراءة قائمة الوظائف");
      }
      for (const link of parseOpenSooqLinks(html)) links.add(link);
      return [];
    }),
    "السوق المفتوح",
  );

  const details = await Promise.allSettled(
    [...links].slice(0, 12).map(async (link): Promise<Item[]> =>
      parseOpenSooqDetail(await fetchJobPage(link), link)
        .map((job) => ({ ...job, sourceName: "السوق المفتوح" })),
    ),
  );
  const verified = details.filter((result): result is PromiseFulfilledResult<Item[]> =>
    result.status === "fulfilled");
  // A list of unverified links is not proof of any open vacancy.
  if (links.size && verified.length === 0 && searches.items.length === 0) {
    throw new Error("تعذر التحقق من حالة جميع إعلانات السوق المفتوح");
  }
  return {
    items: [...searches.items, ...verified.flatMap((result) => result.value)],
    failedRequests: searches.failedRequests + details.length - verified.length,
  };
}

// ---- Mourjan (مرجان) Saudi accounting vacancies: every ad there is an employer looking for an accountant ----
function arRelative(t: string): string | null {
  const n = Number(t.match(/\d+/)?.[0] ?? 1);
  const mins = /دقيق/.test(t) ? n : /ساع/.test(t) ? n * 60 : /يوم|أيام/.test(t) ? n * 1440 : /أسبوع|اسبوع|أسابيع/.test(t) ? n * 10080 : /شهر|أشهر/.test(t) ? n * 43200 : null;
  return mins === null ? null : new Date(Date.now() - mins * 60000).toISOString();
}
async function fetchMourjan(): Promise<Item[]> {
  const url = "https://www.mourjan.com/sa/accounting/vacancies/";
  // A slow connection should not discard this entire source permanently.
  // Retry one timeout with a shorter budget; never retry access-denied pages.
  let lastTimeout: unknown;
  for (const timeoutMs of [12_000, 9_000]) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Accept-Language": "ar",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error &&
        /abort|timeout|timed.?out|مهلة/i.test(error.name + " " + error.message)) {
        lastTimeout = error;
        continue;
      }
      throw error;
    }
    if (!response.ok) throw new Error("HTTP " + response.status);
    const html = await response.text();
    if (!/class=widget|لا توجد إعلانات/.test(html)) throw new Error("تعذرت قراءة قائمة الوظائف");
    return parseMourjan(html).map((job) => ({ ...job, sourceName: "مرجان" }));
  }
  throw new Error(lastTimeout ? "انتهت مهلة الاتصال بمنصة مرجان بعد إعادة المحاولة" : "تعذر الاتصال بمنصة مرجان");
}

// ---- Kafiil (كفيل) freelance projects: buyers posting projects, filtered to accounting + Saudi ----
const KF_PAGES = [
  "https://kafiil.com/projects/business-consulting-and-management-services-2?open=1",
  "https://kafiil.com/projects/other-things-2?open=1",
  "https://kafiil.com/projects/training-education-and-remote-assistance-2?open=1",
];
async function fetchKafiil(): Promise<SourceCollection> {
  const requests = KF_PAGES.map((url) => async (): Promise<Item[]> => {
      const out: Item[] = [];
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "ar" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      for (const block of html.split("project-box active").slice(1)) {
        // Skip completed/closed projects — only open ones are opportunities.
        if ((block.match(/<span class="tag[^"]*">([^<]*)<\/span>/)?.[1] ?? "").trim() !== "مفتوح") continue;
        const link = block.match(/href="(https:\/\/kafiil\.com\/project\/[^"]+)"/)?.[1];
        const title = block.match(/class="name bold-text[^"]*"[\s\S]*?<\/a>/)?.[0]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().replace(/^(مكتمل|مفتوح|قيد التنفيذ|منفذ)\s+/, "");
        const when = block.match(/fa-clock[\s\S]{0,80}?(منذ[^<]+)/)?.[1]?.trim() ?? "";
        const price = block.match(/class="price"[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? "";
        const desc = block.match(/class="info-content"[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
        if (!link || !title) continue;
        const head = `${title} ${desc}`;
        if (!ACC.test(head) || SELF_AD.test(head.slice(0, 120)) || !isSaudi(head) || !isAccountingRequest(head, true)) continue;
        out.push({
          title,
          description: `${desc}${price ? ` — الميزانية: ${price}` : ""}`.slice(0, 600),
          link,
          publishedAt: arRelative(when),
          sourceName: "كفيل",
          location: "كفيل",
          employment: "عمل حر",
        });
      }
      return out;
    });
  return collectIndependentPages(requests, "كفيل");
}

// ---- LinkedIn public job search, location = Saudi Arabia (companies hiring accountants) ----
const LI_KEYWORDS = ["accountant", "محاسب", "bookkeeper", "accounting"];


async function fetchLinkedIn(): Promise<SourceCollection> {
  const requests = LI_KEYWORDS.flatMap((keyword) =>
    [0, 25].map((start) => async (): Promise<Item[]> => {
      const url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
        + "?keywords=" + encodeURIComponent(keyword)
        + "&location=Saudi%20Arabia&f_TPR=r2592000&start=" + start;
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      if (/captcha|verify you are human|access denied|just a moment/i.test(html.slice(0, 2400))) {
        throw new Error("LinkedIn challenge page");
      }
      return parseLinkedIn(html)
        .filter((j) => isSaudi(j.location) && isAccountingRequest(j.title, true))
        .map((j) => ({
          title: j.title,
          description: j.company + " تبحث عن " + j.title + " — " + j.location,
          link: j.link,
          publishedAt: j.date ? new Date(j.date).toISOString() : null,
          sourceName: "لينكدإن",
          location: j.company + " · " + j.location,
          employment: inferEmployment(j.title),
        }));
    }),
  );
  return collectIndependentPages(requests, "لينكدإن");
}

const WADHEFA_URL = "https://www.wadhefa.com/jobfind.php?jids%5B%5D=62";
const MIHNATI_URL = "https://www.mihnati.com/category/accounts-finance-financial-services-jobs";

async function fetchJobPage(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "ar" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchWadhefa(): Promise<SourceCollection> {
  const html = await fetchJobPage(WADHEFA_URL);
  if (!/job_id\[\]|لا توجد وظائف|لا توجد نتائج/.test(html)) throw new Error("تعذرت قراءة قائمة الوظائف");
  const jobs = parseWadhefa(html).slice(0, 30);
  return collectIndependentPages(
    jobs.map((job) => async (): Promise<Item[]> => {
      const detail = parseWadhefaDetail(await fetchJobPage(job.link));
      return detail.open
        ? [{ ...job, description: detail.description || job.description,
          employment: detail.employment, sourceName: "وظيفة.كوم" }]
        : [];
    }),
    "وظيفة.كوم",
  );
}

async function fetchMihnati(): Promise<SourceCollection> {
  const html = await fetchJobPage(MIHNATI_URL);
  if (!/jlist|لا توجد وظائف|No jobs/.test(html)) throw new Error("تعذرت قراءة قائمة الوظائف");
  const links = parseMihnatiLinks(html).slice(0, 30);
  return collectIndependentPages(
    links.map((link) => async (): Promise<Item[]> =>
      parseMihnati(await fetchJobPage(link), link)
        .map((job) => ({ ...job, sourceName: "مهنتي" })),
    ),
    "مهنتي",
  );
}

async function fetchGlobalJobSite(site: GlobalJobSite): Promise<SourceCollection> {
  const config = GLOBAL_JOB_SITES[site];
  const read = async (url: string) => {
    try {
      const html = await fetchJobPage(url);
      if (/captcha|verify you are human|access denied|just a moment/i.test(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")) {
        throw new Error("الموقع يمنع الجلب الآلي؛ متاح للتصفح المباشر");
      }
      return html;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/HTTP (403|429)/.test(message)) throw new Error("الموقع يمنع الجلب الآلي؛ متاح للتصفح المباشر");
      if (/timeout|aborted/i.test(message)) throw new Error("انتهت مهلة الاتصال بالمنصة");
      throw error;
    }
  };
  const html = await read(config.search);
  const links = parseGlobalJobLinks(html, site).slice(0, 10);
  if (!links.length) throw new Error("تعذرت قراءة إعلانات المنصة؛ متاحة للتصفح المباشر");
  return collectIndependentPages(
    links.map((link) => async (): Promise<Item[]> => {
      const detail = await read(link);
      // Reject HTML navigation and challenge pages without verified job metadata.
      if (!/"@type"\s*:\s*(?:"JobPosting"|\[[^\]]*"JobPosting")/.test(detail)) {
        throw new Error("تعذر التحقق من موقع الوظائف وصلاحية التقديم");
      }
      return parseStructuredSaudiJobs(detail, link, config.origin)
        .map((job) => ({ ...job, sourceName: config.name }));
    }),
    config.name,
  );
}

// Mostaql, Khamsat and Baaeed are deliberately available as manual links
// in the user interface. Their former collector always failed, so they
// were incorrectly counted as three broken automated sources.
// Freelancer projects are global; keep only ones that mention Saudi Arabia.
const BUILT_IN_RSS: { name: string; url: string }[] = [
  { name: "Freelancer", url: "https://www.freelancer.com/rss/job_accounting.xml" },
  { name: "Freelancer", url: "https://www.freelancer.com/rss/job_bookkeeping.xml" },
  { name: "Freelancer", url: "https://www.freelancer.com/rss/job_zakat.xml" },
];

async function fetchUrl(url: string, name: string, trusted: boolean): Promise<Item[]> {
  const res = await fetchSafeUrl(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await readResponseLimited(res);
  const t = body.trimStart();
  const items = t.startsWith("{") || t.startsWith("[") ? parseJson(JSON.parse(t)) : parseFeed(body);
  return items
    .filter((i) => i.title && i.link && (trusted || isAccounting(`${i.title} ${i.description}`)) && isSaudi(`${i.title} ${i.description}`))
    .map((i) => ({ ...i, employment: name === "Freelancer" ? ("عمل حر" as Employment) : inferEmployment(`${i.title} ${i.description}`) }))
    .map((i) => ({ ...i, sourceName: name }));
}

/** Shared collector for the owner UI and the independent scheduled worker. */
export async function collectAllSources(sources: In["sources"], maxItems = 150) {
    const statuses: Status[] = [];
    const all: Item[] = [];
    const run = async (
      name: string, url: string, builtIn: boolean,
      job: () => Promise<Item[] | SourceCollection>,
    ) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          job(),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("انتهت مهلة المصدر")), 30_000);
          }),
        ]);
        const items = Array.isArray(outcome) ? outcome : outcome.items;
        const failedRequests = Array.isArray(outcome) ? 0 : outcome.failedRequests;
        all.push(...items);
        statuses.push({
          name, url, ok: true, count: items.length,
          partial: failedRequests > 0, failedRequests,
          error: failedRequests > 0 ? "تعذرت بعض صفحات المصدر" : null,
          builtIn,
        });
      } catch (e: unknown) {
        statuses.push({
          name, url, ok: false, count: 0,
          partial: false, failedRequests: 0,
          error: e instanceof Error ? e.message : "فشل الجلب",
          builtIn,
        });
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    };

    await Promise.all([
      run("حراج", "https://haraj.com.sa", true, fetchHaraj),
      run("لينكدإن", "https://www.linkedin.com/jobs", true, fetchLinkedIn),
      run("السوق المفتوح", "https://sa.opensooq.com", true, fetchOpenSooq),
      run("مرجان", "https://www.mourjan.com/sa/accounting/vacancies/", true, fetchMourjan),
      run("كفيل", "https://kafiil.com/projects", true, fetchKafiil),
      run("وظيفة.كوم", WADHEFA_URL, true, fetchWadhefa),
      run("مهنتي", MIHNATI_URL, true, fetchMihnati),
      ...(["indeed", "naukrigulf", "bayt"] as const).map((site) => run(GLOBAL_JOB_SITES[site].name, GLOBAL_JOB_SITES[site].search, true, () => fetchGlobalJobSite(site))),
      ...BUILT_IN_RSS.map((s) => run(`${s.name} (${s.url.split("job_")[1]?.replace(".xml", "")})`, s.url, true, () => fetchUrl(s.url, s.name, true))),
      ...sources.map((s) => run(s.name, s.url, false, () => fetchUrl(s.url, s.name, false))),
    ]);

    all.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const unique = dedupe(all);
    return {
      items: unique.slice(0, maxItems).map(toOpportunity),
      duplicatesRemoved: all.length - unique.length,
      statuses,
      fetchedAt: new Date().toISOString(),
    };
}

/** Interactive discovery is owner-authenticated; background jobs use a separate cron credential. */
export const fetchSources = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: In) => {
    if (!Array.isArray(input?.sources) || input.sources.length > 20) throw new Error("مصادر غير صالحة");
    return { sources: input.sources.map((s) => ({
      name: String(s.name).slice(0, 80),
      url: String(s.url).slice(0, 1000),
      type: s.type,
    })) };
  })
  .handler(async ({ data, context }) => {
    limitOwnerAction(context.userId, "fetch-sources", 120, 60 * 60_000);
    return collectAllSources(data.sources);
  });
