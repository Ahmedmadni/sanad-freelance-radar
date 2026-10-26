import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Pause, Play, Rss } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityCard } from "@/components/OpportunityCard";
import { LiveSourcesPanel } from "@/components/LiveSourcesPanel";
import { SEED, randomOpportunity, type Opportunity } from "@/lib/opportunities";
import { useSettings } from "@/lib/settings";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "التغذية المباشرة | رادار فرص المحاسبة" },
      { name: "description", content: "تغذية مباشرة لمشاريع المحاسبة الجديدة فور نشرها." },
      { property: "og:title", content: "التغذية المباشرة للفرص" },
      { property: "og:description", content: "محاكاة مباشرة لوصول مشاريع المحاسبة الجديدة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Feed,
});

function Feed() {
  const [settings] = useSettings();
  const [items, setItems] = useState<Opportunity[]>(() => [...SEED].sort((a, b) => a.postedMinutesAgo - b.postedMinutesAgo).slice(0, 4));
  const [freshId, setFreshId] = useState<string | null>(null);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const n = randomOpportunity();
      setFreshId(n.id);
      setItems((prev) => [n, ...prev.map((p) => ({ ...p, postedMinutesAgo: p.postedMinutesAgo + 1 }))].slice(0, 30));
    }, 12000);
    return () => clearInterval(t);
  }, [running]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary">
            <span className="relative flex size-2.5">{running && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />}<span className="relative inline-flex size-2.5 rounded-full bg-primary" /></span>
            {running ? "بث مباشر (محاكاة)" : "متوقف"}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold">التغذية المباشرة</h1>
          <p className="text-sm text-muted-foreground">تصل فرصة جديدة كل 12 ثانية في وضع المحاكاة. المصادر المضافة: {settings.sources.length}</p>
        </div>
        <div className="ms-auto flex gap-2">
          <Button variant="outline" asChild><Link to="/settings"><Rss className="size-4" />إدارة المصادر</Link></Button>
          <Button onClick={() => setRunning(!running)}>{running ? <><Pause className="size-4" />إيقاف</> : <><Play className="size-4" />تشغيل</>}</Button>
        </div>
      </div>
      <LiveSourcesPanel settings={settings} columns={false} />
      <h2 className="mx-auto w-full max-w-3xl text-xl font-bold">المحاكاة</h2>
      <div className="mx-auto grid max-w-3xl gap-4">
        {items.map((o) => <OpportunityCard key={o.id} o={o} settings={settings} fresh={o.id === freshId} />)}
      </div>
    </div>
  );
}
