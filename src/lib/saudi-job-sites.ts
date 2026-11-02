import { decode, inferEmployment, isAccounting, isSaudi, type RawItem } from "./feeds";
import type { Employment } from "./opportunities";

export type SaudiJob = RawItem & { location: string; employment: Employment };

function jobUrl(raw: string, origin: string) {
  try {
    const url = new URL(decode(raw), origin);
    if (url.origin !== origin || url.protocol !== "https:") return null;
    url.search = "";
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
export function parseStructuredSaudiJobs(html: string, link: string, origin: string, now = Date.now()): SaudiJob[] {
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
      if (!Number.isFinite(expiry) || expiry <= now) continue;
      const locations = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
      // A multi-country posting is accepted only for its explicitly Saudi location.
      const saudi = locations.find((place) => {
        const country = place?.address?.addressCountry;
        const name = typeof country === "string" ? country : country?.name;
        return /^(SA|SAU|Saudi Arabia|المملكة العربية السعودية|السعودية)$/i.test(name ?? "");
      });
      const title = decode(String(job.title ?? ""));
      const description = decode(String(job.description ?? ""));
      const url = jobUrl(job.url ?? link, origin);
      if (!saudi || !url || !title || !isAccounting(`${title} ${description}`)) continue;
      const types = [job.employmentType ?? []].flat();
      const employment: Employment = types.includes("PART_TIME") ? "دوام جزئي" : types.includes("FULL_TIME") ? "دوام كامل" : inferEmployment(description);
      const date = Date.parse(job.datePosted ?? "");
      out.push({ title, description: description.slice(0, 600), link: url, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
        location: `${decode(job.hiringOrganization?.name ?? "")} · ${saudi.address?.addressLocality ?? "السعودية"}`, employment });
    }
  }
  return out;
}