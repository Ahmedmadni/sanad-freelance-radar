import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/use-live-sources";
import { MANUAL_JOB_SOURCES } from "@/lib/manual-job-sources";
import type { useLiveSources } from "@/lib/use-live-sources";

/** Status bar: last update, counts, duplicates removed, per-source health. */
export function SourcesStatus({ q }: { q: ReturnType<typeof useLiveSources> }) {
  const d = q.data;
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">
          آخر تحديث: {d ? formatDate(d.fetchedAt) : "—"}
          {d && ` · ${d.items.length} فرصة حقيقية · حُذف ${d.duplicatesRemoved} مكرر`}
        </span>
        <Button size="sm" variant="outline" className="ms-auto" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} />تحديث
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {d?.statuses.map((s) => (
          <span key={s.url} className={s.ok ? "flex items-center gap-1 text-muted-foreground" : "flex items-center gap-1 text-destructive"}>
            {s.ok ? <CheckCircle2 className="size-3 text-primary" /> : <AlertCircle className="size-3" />}
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" title={`فتح ${s.name}`}>{s.name}</a>: {s.ok ? `${s.count}` : s.error}
          </span>
        ))}
      </div>
      <details className="rounded-lg border border-dashed px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium">
          منصات يمكن تصفحها يدوياً فقط ({MANUAL_JOB_SOURCES.length}) — ليست ضمن الفحص التلقائي
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          {MANUAL_JOB_SOURCES.map((source) => (
            <p key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">{source.name}</a>
              {" — "}{source.note}
            </p>
          ))}
          <p>لا نحتسب هذه المنصات مصادر ناجحة أو فاشلة حتى يتوفر تكامل يسمح بالتحقق من الفرص.</p>
        </div>
      </details>
      {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
    </div>
  );
}
