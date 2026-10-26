import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, Sparkles, Loader2, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { generateProposal } from "@/lib/ai.functions";
import { timeAgo, type Opportunity } from "@/lib/opportunities";
import { formatDate } from "@/lib/use-live-sources";
import type { Settings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const urgencyClass: Record<string, string> = {
  عاجل: "bg-destructive/15 text-destructive border-destructive/30",
  متوسط: "bg-gold/15 text-gold-foreground border-gold/40",
  عادي: "bg-muted text-muted-foreground border-border",
};

export function OpportunityCard({ o, settings, fresh }: { o: Opportunity; settings: Settings; fresh?: boolean }) {
  const gen = useServerFn(generateProposal);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setOpen(true);
    setLoading(true);
    setText("");
    try {
      const r = await gen({
        data: {
          title: o.title,
          description: o.description,
          budget: o.budgetMax > 0 ? `${o.budgetMin} - ${o.budgetMax} $` : "غير محددة",
          client: o.client,
          name: settings.freelancerName,
          bio: settings.bio,
        },
      });
      setText(r.text);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذر توليد العرض");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <article
      className={cn(
        "group rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-[var(--shadow-card)]",
        fresh && "animate-in fade-in slide-in-from-top-2 ring-2 ring-primary/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{o.platform}</Badge>
        <Badge variant="outline" className={urgencyClass[o.urgency]}>{o.urgency}</Badge>
        <span className="ms-auto flex items-center gap-1 text-muted-foreground"><Clock className="size-3" />{timeAgo(o.postedMinutesAgo)}</span>
      </div>
      <h3 className="mt-3 font-display text-lg font-bold leading-snug text-card-foreground">{o.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{o.description}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.skills.map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}
        {o.tools?.map((t) => <Badge key={t} variant="outline" className="font-normal">{t}</Badge>)}
      </div>
      {o.sourceName && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>المصدر: <a href={o.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{o.sourceName}</a></span>
          <span>التحديث: {formatDate(o.publishedAt)}</span>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        {o.budgetMax > 0 ? <div className="font-mono text-base font-semibold text-primary" dir="ltr">${o.budgetMin} – ${o.budgetMax}</div> : <div className="text-sm text-muted-foreground">الميزانية غير محددة</div>}
        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" />{o.offers} عروض</span>
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="ghost" asChild>
            <a href={o.url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
          </Button>
          <Button size="sm" onClick={run}><Sparkles className="size-4" />ولّد عرضاً</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader className="text-start">
            <DialogTitle className="font-display">عرض مقترح: {o.title}</DialogTitle>
            <DialogDescription>يمكنك تعديل النص قبل نسخه.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> جارٍ صياغة العرض...
            </div>
          ) : (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-72 leading-loose" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={run} disabled={loading}>إعادة التوليد</Button>
            <Button
              disabled={loading || !text}
              onClick={() => { navigator.clipboard.writeText(text); toast.success("تم نسخ العرض"); }}
            >
              <Copy className="size-4" />نسخ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
