import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, ExternalLink, Sparkles, Loader2, Clock, Users, MessageCircle, Mail } from "lucide-react";
import { extractSaudiPhone, extractEmail, waLink, mailtoLink } from "@/lib/contacts";
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
  const currency = o.budgetCurrency === "SAR" ? "ر.س" : o.budgetCurrency === "USD" ? "$" : "";
  const budgetLabel = o.budgetMax > 0 && currency ? `${o.budgetMin} – ${o.budgetMax} ${currency}` : "غير محددة";
  const adText = `${o.title} ${o.description}`;
  const phone = extractSaudiPhone(adText);
  const email = extractEmail(adText);

  const signature = [
    settings.freelancerName && `معكم ${settings.freelancerName}${settings.jobTitle ? ` - ${settings.jobTitle}` : ""}`,
    settings.phone && `جوالي: ${settings.phone}`,
    settings.email && `بريدي: ${settings.email}`,
  ].filter(Boolean).join("\n");

  const message = (proposal: string) =>
    [
      `السلام عليكم، بخصوص إعلانكم: ${o.title}`,
      o.url && `رابط الإعلان: ${o.url}`,
      proposal || `أرغب بتقديم خدماتي المحاسبية لهذا الطلب.`,
      signature,
    ].filter(Boolean).join("\n\n");

  async function run() {
    setOpen(true);
    setLoading(true);
    setText("");
    try {
      const r = await gen({
        data: {
          title: o.title,
          description: o.description,
          budget: budgetLabel,
          client: o.client,
          name: settings.freelancerName,
          bio: [
            settings.bio,
            settings.jobTitle && `المسمى: ${settings.jobTitle}`,
            settings.experienceYears && `سنوات الخبرة: ${settings.experienceYears}`,
            settings.certifications && `الشهادات: ${settings.certifications}`,
            settings.city && `المدينة: ${settings.city}`,
            settings.phone && `الجوال: ${settings.phone}`,
            settings.whatsapp && `واتساب: ${settings.whatsapp}`,
            settings.email && `البريد: ${settings.email}`,
            settings.linkedin && `لينكدإن: ${settings.linkedin}`,
            settings.website && `الموقع: ${settings.website}`,
          ].filter(Boolean).join("\n"),
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
        {o.employment && o.employment !== "غير محدد" && <Badge variant="secondary">{o.employment}</Badge>}
        {o.workMode && o.workMode !== "غير محدد" && <Badge variant="outline">{o.workMode}</Badge>}
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
          <span>المنصة: <a href={o.url} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{o.sourceName}</a>{o.client !== o.sourceName && ` · ${o.client}`}</span>
          <span>التحديث: {formatDate(o.publishedAt)}</span>
        </div>
      )}
      {(phone || email) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {phone && (
            <span className="flex items-center gap-2">
              <MessageCircle className="size-3.5 text-primary" />
              <span className="text-muted-foreground">واتساب المعلن:</span>
              <a href={waLink(phone, "")} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline" dir="ltr">+{phone}</a>
            </span>
          )}
          {email && (
            <span className="flex items-center gap-2">
              <Mail className="size-3.5 text-primary" />
              <span className="text-muted-foreground">بريد المعلن:</span>
              <a href={mailtoLink(email, "", "")} className="font-mono text-primary hover:underline" dir="ltr">{email}</a>
            </span>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
        {o.budgetMax > 0 && currency ? <div className="font-mono text-base font-semibold text-primary" dir="ltr">{budgetLabel}</div> : <div className="text-sm text-muted-foreground">الميزانية غير محددة</div>}
        {o.offers !== null && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" />{o.offers} عروض</span>}
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="ghost" asChild>
            <a href={o.url} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
          </Button>
          {phone && (
            <Button size="sm" variant="outline" asChild>
              <a href={waLink(phone, message(""))} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />واتساب</a>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <a href={mailtoLink(email ?? "", `بخصوص إعلانكم: ${o.title}`, message(""))}><Mail className="size-4" />بريد</a>
          </Button>
          <Button size="sm" onClick={run}><Sparkles className="size-4" />ولّد عرضاً</Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader className="text-start">
            <DialogTitle className="font-display">عرض مقترح: {o.title}</DialogTitle>
            <DialogDescription>
              {phone || email
                ? "يمكنك تعديل النص قبل نسخه أو إرساله للمعلن."
                : "لا يوجد رقم أو بريد داخل نص الإعلان — زر البريد يفتح رسالة جاهزة لتضيف إليها بريد المعلن."}
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex h-60 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" /> جارٍ صياغة العرض...
            </div>
          ) : (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-72 leading-loose" />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="me-auto text-xs text-muted-foreground">
              {phone || email
                ? `سيُرسل إلى: ${[phone && `واتساب +${phone}`, email && `بريد ${email}`].filter(Boolean).join(" أو ")}`
                : "املأ بريد المعلن في نافذة البريد — النص جاهز"}
            </span>
            <Button variant="outline" onClick={run} disabled={loading}>إعادة التوليد</Button>
            <Button
              variant="outline"
              disabled={loading || !text}
              onClick={() => { navigator.clipboard.writeText(text); toast.success("تم نسخ العرض"); }}
            >
              <Copy className="size-4" />نسخ
            </Button>
            {phone && (
              <Button disabled={loading || !text} asChild={!loading && !!text}>
                <a href={waLink(phone, message(text))} target="_blank" rel="noreferrer"><MessageCircle className="size-4" />إرسال على واتساب</a>
              </Button>
            )}
            <Button variant={phone ? "outline" : "default"} disabled={loading || !text} asChild={!loading && !!text}>
              <a href={mailtoLink(email ?? "", `بخصوص إعلانكم: ${o.title}`, message(text))}><Mail className="size-4" />إرسال بالبريد</a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}
