import { createFileRoute, Link } from "@tanstack/react-router";
import { Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityCard } from "@/components/OpportunityCard";
import { SourcesStatus } from "@/components/LiveSourcesPanel";
import { useSettings } from "@/lib/settings";
import { useLiveSources } from "@/lib/use-live-sources";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "التغذية المباشرة | رادار فرص المحاسبة" },
      { name: "description", content: "أحدث طلبات المحاسبة الحقيقية في السعودية من حراج ومصادرك، تتحدث كل 5 دقائق." },
      { property: "og:title", content: "التغذية المباشرة للفرص" },
      { property: "og:description", content: "طلبات محاسبة حقيقية مرتبة من الأحدث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Feed,
});

function Feed() {
  const [settings] = useSettings();
  const q = useLiveSources(settings.sources);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary">
            <span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span>
            مباشر · تحديث كل 5 دقائق
          </div>
          <h1 className="mt-1 text-3xl font-bold">التغذية المباشرة</h1>
        </div>
        <Button variant="outline" className="ms-auto" asChild><Link to="/settings"><Rss className="size-4" />إدارة المصادر</Link></Button>
      </div>
      <SourcesStatus q={q} />
      {q.isLoading && <p className="py-16 text-center text-muted-foreground">جارٍ جلب الفرص الحقيقية...</p>}
      <div className="grid gap-4">
        {q.data?.items.map((o) => <OpportunityCard key={o.id} o={o} settings={settings} />)}
      </div>
    </div>
  );
}
