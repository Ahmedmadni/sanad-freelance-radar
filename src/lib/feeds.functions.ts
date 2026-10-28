import { createServerFn } from "@tanstack/react-start";
import { parseFeed, parseJson, dedupe, isAccounting, isSaudi, toOpportunity, parseLinkedIn, inferEmployment, type RawItem } from "./feeds";
import type { Employment } from "./opportunities";

type In = { sources: { name: string; url: string; type: "RSS" | "Webhook" }[] };
type Item = RawItem & { sourceName: string; location?: string; employment?: Employment };
type Status = { name: string; url: string; ok: boolean; count: number; error: string | null; builtIn: boolean };

function safeUrl(raw: string) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("رابط غير مدعوم");
  const h = u.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new Error("لا يمكن الوصول لعناوين داخلية");
  }
  return u.toString();
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

async function fetchHaraj(): Promise<Item[]> {
  const out: Item[] = [];
  await Promise.all(
    HARAJ_SEARCHES.flatMap((search) => [1, 2].map((page) => ({ search, page }))).map(async ({ search, page }) => {
      const res = await fetch(HARAJ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://haraj.com.sa", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ query: HARAJ_QUERY, variables: { search, page } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as any;
      for (const p of j?.data?.search?.items ?? []) {
        const title = String(p.title ?? "");
        const body = String(p.bodyTEXT ?? "");
        const head = `${title} ${body.slice(0, 120)}`;
        if (!WANTS.test(head) || !ACC.test(head) || SELF_AD.test(title) || SELF_AD.test(body.slice(0, 80))) continue;
        out.push({
          title,
          description: body.slice(0, 600),
          link: `https://haraj.com.sa/${String(p.URL ?? "").replace(/^\/+/, "")}`,
          publishedAt: p.updateDate || p.postDate ? new Date(Number(p.updateDate || p.postDate) * 1000).toISOString() : null,
          sourceName: "حراج",
          location: p.city ? `حراج · ${p.city}` : "حراج",
          employment: inferEmployment(`${title} ${body}`),
        });
      }
    }),
  );
  return out;
}

// ---- OpenSooq Saudi (السوق المفتوح): job vacancies + "wanted" posts only, never service ads ----
const OS_TERMS = ["مطلوب محاسب", "محاسب", "محاسبة", "مسك دفاتر"];
async function fetchOpenSooq(): Promise<Item[]> {
  const out: Item[] = [];
  await Promise.all(
    OS_TERMS.map(async (term) => {
      const res = await fetch(`https://sa.opensooq.com/ar/find?term=${encodeURIComponent(term)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "ar" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m?.[1]) return;
      const items: any[] = JSON.parse(m[1])?.props?.pageProps?.serpApiResponse?.listings?.items ?? [];
      for (const x of items) {
        const title = String(x.title ?? "");
        const body = String(x.masked_description ?? "");
        const head = `${title} ${body}`;
        const isVacancy = x.cat2_code === "JobPoster";
        const isWanted = WANTS.test(head) && !["Services", "ComputerAndLaptops", "BusinessIndustrial"].includes(x.cat1_code);
        if (!(isVacancy || isWanted) || !ACC.test(title) || SELF_AD.test(title)) continue;
        out.push({
          title,
          description: body,
          link: `https://sa.opensooq.com/ar/search/${x.id}`,
          publishedAt: x.inserted_date ? new Date(x.inserted_date).toISOString() : null,
          sourceName: "السوق المفتوح",
          location: x.city_label ? `السوق المفتوح · ${x.city_label}` : "السوق المفتوح",
          employment: inferEmployment(head),
        });
      }
    }),
  );
  return out;
}

// ---- Mourjan (مرجان) Saudi accounting vacancies: every ad there is an employer looking for an accountant ----
function arRelative(t: string): string | null {
  const n = Number(t.match(/\d+/)?.[0] ?? 1);
  const mins = /دقيق/.test(t) ? n : /ساع/.test(t) ? n * 60 : /يوم|أيام/.test(t) ? n * 1440 : /أسبوع|اسبوع|أسابيع/.test(t) ? n * 10080 : /شهر|أشهر/.test(t) ? n * 43200 : null;
  return mins === null ? null : new Date(Date.now() - mins * 60000).toISOString();
}
const MJ_CITIES: Record<string, string> = { riyadh: "الرياض", jeddah: "جدة", dammam: "الدمام", "al-madina": "المدينة المنورة", makkah: "مكة", khobar: "الخبر", taif: "الطائف", tabuk: "تبوك", abha: "أبها", qassim: "القصيم", jubail: "الجبيل", hail: "حائل", jazan: "جازان", najran: "نجران", yanbu: "ينبع" };
async function fetchMourjan(): Promise<Item[]> {
  const res = await fetch("https://www.mourjan.com/sa/accounting/vacancies/", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "ar" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const out: Item[] = [];
  for (const block of html.split('<div class=widget id=').slice(1)) {
    const href = block.match(/href=(\/sa\/[^ >]+)/)?.[1];
    const content = block.match(/class="content[^"]*">([\s\S]*?)<\/div>/)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!href || !content) continue;
    const when = block.match(/<div>(منذ[^<]+)<\/div>/)?.[1] ?? "";
    const slug = href.split("/")[2] ?? "";
    const city = MJ_CITIES[slug] ?? (slug && slug !== "accounting" ? slug : "السعودية");
    if (SELF_AD.test(content.slice(0, 80))) continue;
    out.push({
      title: content.length > 90 ? `${content.slice(0, 90)}…` : content,
      description: content.slice(0, 600),
      link: `https://www.mourjan.com${href}`,
      publishedAt: arRelative(when),
      sourceName: "مرجان",
      location: `مرجان · ${city}`,
      employment: inferEmployment(content),
    });
  }
  return out;
}

// ---- Kafiil (كفيل) freelance projects: buyers posting projects, filtered to accounting + Saudi ----
const KF_PAGES = [
  "https://kafiil.com/projects/business-consulting-and-management-services-2?open=1",
  "https://kafiil.com/projects/other-things-2?open=1",
  "https://kafiil.com/projects/training-education-and-remote-assistance-2?open=1",
];
async function fetchKafiil(): Promise<Item[]> {
  const out: Item[] = [];
  await Promise.all(
    KF_PAGES.map(async (url) => {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "ar" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      for (const block of html.split("project-box active").slice(1)) {
        // Skip completed/closed projects — only open ones are opportunities.
        if (/مكتمل|قيد التنفيذ|منفذ/.test(block.match(/<span class="tag[^"]*">([^<]*)<\/span>/)?.[1] ?? "")) continue;
        const link = block.match(/href="(https:\/\/kafiil\.com\/project\/[^"]+)"/)?.[1];
        const title = block.match(/class="name bold-text[^"]*"[\s\S]*?<\/a>/)?.[0]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const when = block.match(/fa-clock[\s\S]{0,80}?(منذ[^<]+)/)?.[1]?.trim() ?? "";
        const price = block.match(/class="price"[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? "";
        const desc = block.match(/class="info-content"[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
        if (!link || !title) continue;
        const head = `${title} ${desc}`;
        if (!ACC.test(head) || SELF_AD.test(head.slice(0, 120)) || !isSaudi(head)) continue;
        out.push({
          title,
          description: `${desc}${price ? ` — الميزانية: ${price}` : ""}`.slice(0, 600),
          link,
          publishedAt: arRelative(when),
          sourceName: "كفيل",
          location: "كفيل",
          employment: "دوام جزئي",
        });
      }
    }),
  );
  return out;
}

// ---- LinkedIn public job search, location = Saudi Arabia (companies hiring accountants) ----
const LI_KEYWORDS = ["accountant", "محاسب", "bookkeeper", "accounting"];


async function fetchLinkedIn(): Promise<Item[]> {
  const out: Item[] = [];
  await Promise.all(
    LI_KEYWORDS.flatMap((k) => [0, 25].map((start) => ({ k, start }))).map(async ({ k, start }) => {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(k)}&location=Saudi%20Arabia&f_TPR=r2592000&start=${start}`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      for (const j of parseLinkedIn(await res.text())) {
        if (!isSaudi(`${j.location} Saudi`) || !isAccounting(j.title)) continue;
        out.push({
          title: j.title,
          description: `${j.company} تبحث عن ${j.title} — ${j.location}`,
          link: j.link,
          publishedAt: j.date ? new Date(j.date).toISOString() : null,
          sourceName: "لينكدإن",
          location: `${j.company} · ${j.location}`,
          // LinkedIn listings are salaried positions unless the title says otherwise.
          employment: /part[- ]?time|دوام جزئي|freelance|contract|temporary|مؤقت/i.test(j.title) ? "دوام جزئي" : "دوام كامل",
        });
      }
    }),
  );
  return out;
}

// Freelancer projects are global; keep only ones that mention Saudi Arabia.
const BUILT_IN_RSS: { name: string; url: string }[] = [
  { name: "Freelancer", url: "https://www.freelancer.com/rss/job_accounting.xml" },
  { name: "Freelancer", url: "https://www.freelancer.com/rss/job_bookkeeping.xml" },
  { name: "Freelancer", url: "https://www.freelancer.com/rss/job_zakat.xml" },
];

async function fetchUrl(url: string, name: string, trusted: boolean): Promise<Item[]> {
  const res = await fetch(safeUrl(url), {
    headers: { "User-Agent": "Mozilla/5.0 AccountingGigRadar/1.0", Accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.text()).slice(0, 2_000_000);
  const t = body.trimStart();
  const items = t.startsWith("{") || t.startsWith("[") ? parseJson(JSON.parse(t)) : parseFeed(body);
  return items
    .filter((i) => i.title && i.link && (trusted || isAccounting(`${i.title} ${i.description}`)) && isSaudi(`${i.title} ${i.description} ${i.link}`))
    .map((i) => ({ ...i, employment: name === "Freelancer" ? ("دوام جزئي" as Employment) : inferEmployment(`${i.title} ${i.description}`) }))
    .map((i) => ({ ...i, sourceName: name }));
}

export const fetchSources = createServerFn({ method: "POST" })
  .inputValidator((input: In) => {
    if (!Array.isArray(input?.sources) || input.sources.length > 20) throw new Error("مصادر غير صالحة");
    return { sources: input.sources.map((s) => ({ name: String(s.name).slice(0, 80), url: String(s.url).slice(0, 1000), type: s.type })) };
  })
  .handler(async ({ data }) => {
    const statuses: Status[] = [];
    const all: Item[] = [];
    const run = async (name: string, url: string, builtIn: boolean, job: () => Promise<Item[]>) => {
      try {
        const items = await job();
        all.push(...items);
        statuses.push({ name, url, ok: true, count: items.length, error: null, builtIn });
      } catch (e: any) {
        statuses.push({ name, url, ok: false, count: 0, error: e?.message ?? "فشل الجلب", builtIn });
      }
    };

    await Promise.all([
      run("حراج", "https://haraj.com.sa", true, fetchHaraj),
      run("لينكدإن", "https://www.linkedin.com/jobs", true, fetchLinkedIn),
      run("السوق المفتوح", "https://sa.opensooq.com", true, fetchOpenSooq),
      run("مرجان", "https://www.mourjan.com/sa/accounting/vacancies/", true, fetchMourjan),
      run("كفيل", "https://kafiil.com/projects", true, fetchKafiil),
      ...BUILT_IN_RSS.map((s) => run(`${s.name} (${s.url.split("job_")[1]?.replace(".xml", "")})`, s.url, true, () => fetchUrl(s.url, s.name, true))),
      ...data.sources.map((s) => run(s.name, s.url, false, () => fetchUrl(s.url, s.name, false))),
    ]);

    all.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const unique = dedupe(all);
    return {
      items: unique.slice(0, 150).map(toOpportunity),
      duplicatesRemoved: all.length - unique.length,
      statuses,
      fetchedAt: new Date().toISOString(),
    };
  });
