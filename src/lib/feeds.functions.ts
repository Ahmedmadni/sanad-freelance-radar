import { createServerFn } from "@tanstack/react-start";
import { parseFeed, parseJson, dedupe, isAccounting, isSaudi, toOpportunity, type RawItem } from "./feeds";

type In = { sources: { name: string; url: string; type: "RSS" | "Webhook" }[] };
type Item = RawItem & { sourceName: string; location?: string };
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
const HARAJ_SEARCHES = ["مطلوب محاسب", "مطلوب محاسبة", "احتاج محاسب", "مسك دفاتر", "اقرار ضريبي", "قوائم مالية", "اقرار زكوي"];
// Keep posts from people who NEED an accountant, drop accountants advertising themselves.
const WANTS = /مطلوب|احتاج|أحتاج|ابغى|أبغى|ابي |نبحث عن|نحتاج|ابحث عن محاسب|أبحث عن محاسب|يوجد لدينا|لمن لديه خبرة/;
const SELF_AD = /ابحث عن وظيفة|أبحث عن وظيفة|ابحث عن عمل|أبحث عن عمل|^انا محاسب|^أنا محاسب|لدي خبرة|لدية خبرة|اقدم خدم|أقدم خدم|نقدم خدم|خدمات محاسبية|مكتب محاسب/;

async function fetchHaraj(): Promise<Item[]> {
  const out: Item[] = [];
  await Promise.all(
    HARAJ_SEARCHES.map(async (search) => {
      const res = await fetch(HARAJ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://haraj.com.sa", "User-Agent": "Mozilla/5.0" },
        body: JSON.stringify({ query: HARAJ_QUERY, variables: { search, page: 1 } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as any;
      for (const p of j?.data?.search?.items ?? []) {
        const title = String(p.title ?? "");
        const body = String(p.bodyTEXT ?? "");
        const head = `${title} ${body.slice(0, 120)}`;
        if (!WANTS.test(head) || SELF_AD.test(title) || SELF_AD.test(body.slice(0, 80))) continue;
        out.push({
          title,
          description: body.slice(0, 600),
          link: `https://haraj.com.sa/${String(p.URL ?? "").replace(/^\/+/, "")}`,
          publishedAt: p.updateDate || p.postDate ? new Date(Number(p.updateDate || p.postDate) * 1000).toISOString() : null,
          sourceName: "حراج",
          location: p.city ? `حراج · ${p.city}` : "حراج",
        });
      }
    }),
  );
  return out;
}

// Saudi Arabia only: Haraj is the sole built-in source; user sources are filtered by isSaudi.
const BUILT_IN_RSS: { name: string; url: string }[] = [];

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
      ...BUILT_IN_RSS.map((s) => run(s.name, s.url, true, () => fetchUrl(s.url, s.name, true))),
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
