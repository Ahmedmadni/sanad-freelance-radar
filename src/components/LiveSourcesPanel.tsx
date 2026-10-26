import { Link } from "@tanstack/react-router";
import { RefreshCw, Rss, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OpportunityCard } from "@/components/OpportunityCard";
import { useLiveSources, formatDate } from "@/lib/use-live-sources";
import type { Settings } from "@/lib/settings";

export function LiveSourcesPanel({ settings, columns = true }: { settings: Settings; columns?: boolean }) {
  const q = useLiveSources(settings.sources);
  if (!settings.sources.length) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
        <Rss className="size-5 text-primary" />
        لم تضف أي مصدر بعد. أضف روابط RSS أو JSON لجلب الفرص الحقيقية.
        <Button size="sm" variant="outline" className="ms-auto" asChild><Link to="/settings">إضافة مصدر</Link></Button>
      </div>
    );
  }
  const d = q.data;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">فرص حقيقية من مصادرك</h2>
        <span className="text-xs text-muted-foreground">
          آخر تحديث: {d ? formatDate(d.fetchedAt) : "—"}
          {d && ` · ${d.items.length} فرصة · حُذف ${d.duplicatesRemoved} مكرر`}
        </span>
        <Button size="sm" variant="outline" className="ms-auto" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />تحديث
        </Button>
      </div>
      {d?.statuses.filter((s) => !s.ok).map((s) => (
        <p key={s.url} className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{s.name}: {s.error}</p>
      ))}
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {q.isLoading && <p className="py-8 text-center text-muted-foreground">جارٍ جلب الفرص...</p>}
      {d && !d.items.length && <p className="py-8 text-center text-muted-foreground">لا توجد فرص محاسبة في المصادر حالياً.</p>}
      <div className={columns ? "grid gap-5 md:grid-cols-2 xl:grid-cols-3" : "mx-auto grid max-w-3xl gap-4"}>
        {d?.items.map((o) => <OpportunityCard key={o.id} o={o} settings={settings} />)}
      </div>
    </section>
  );
}
