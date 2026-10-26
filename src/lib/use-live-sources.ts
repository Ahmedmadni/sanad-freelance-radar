import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchSources } from "./feeds.functions";
import type { Source } from "./settings";

/** Real opportunities from built-in sources (Haraj, Freelancer) plus the user's RSS/JSON sources. */
export function useLiveSources(sources: Source[]) {
  const fn = useServerFn(fetchSources);
  return useQuery({
    queryKey: ["live-sources", sources.map((s) => s.url).join("|")],
    queryFn: () => fn({ data: { sources: sources.map(({ name, url, type }) => ({ name, url, type })) } }),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "غير معروف";
  return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
