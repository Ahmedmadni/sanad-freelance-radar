import { createServerFn } from "@tanstack/react-start";
import { parseFeed, parseJson, dedupe, isAccounting, toOpportunity, type RawItem } from "./feeds";

type In = { sources: { name: string; url: string; type: "RSS" | "Webhook" }[] };

function safeUrl(raw: string) {
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("رابط غير مدعوم");
  const h = u.hostname;
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    throw new Error("لا يمكن الوصول لعناوين داخلية");
  }
  return u.toString();
}

export const fetchSources = createServerFn({ method: "POST" })
  .inputValidator((input: In) => {
    if (!Array.isArray(input?.sources) || input.sources.length > 20) throw new Error("مصادر غير صالحة");
    return { sources: input.sources.map((s) => ({ name: String(s.name).slice(0, 80), url: String(s.url).slice(0, 1000), type: s.type })) };
  })
  .handler(async ({ data }) => {
    const statuses: { name: string; url: string; ok: boolean; count: number; error: string | null }[] = [];
    const all: (RawItem & { sourceName: string })[] = [];

    await Promise.all(
      data.sources.map(async (s) => {
        try {
          const res = await fetch(safeUrl(s.url), {
            headers: { "User-Agent": "AccountingGigRadar/1.0", Accept: "application/rss+xml, application/atom+xml, application/json, text/xml, */*" },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.text()).slice(0, 2_000_000);
          const trimmed = body.trimStart();
          const items = trimmed.startsWith("{") || trimmed.startsWith("[") ? parseJson(JSON.parse(trimmed)) : parseFeed(body);
          const relevant = items.filter((i) => i.title && isAccounting(`${i.title} ${i.description}`));
          relevant.forEach((i) => all.push({ ...i, sourceName: s.name }));
          statuses.push({ name: s.name, url: s.url, ok: true, count: relevant.length, error: null });
        } catch (e: any) {
          statuses.push({ name: s.name, url: s.url, ok: false, count: 0, error: e?.message ?? "فشل الجلب" });
        }
      }),
    );

    all.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    const unique = dedupe(all);
    return {
      items: unique.slice(0, 100).map(toOpportunity),
      duplicatesRemoved: all.length - unique.length,
      statuses,
      fetchedAt: new Date().toISOString(),
    };
  });
