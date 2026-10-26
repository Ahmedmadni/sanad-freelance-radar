import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Plus, X, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettings, type Source } from "@/lib/settings";
import { sendTelegramTest } from "@/lib/ai.functions";
import { matchesKeywords } from "@/lib/opportunities";
import { useLiveSources } from "@/lib/use-live-sources";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "التنبيهات والإعدادات | رادار فرص المحاسبة" },
      { name: "description", content: "اربط بوت تليجرام واختر الكلمات المفتاحية ومصادر RSS للتنبيهات." },
      { property: "og:title", content: "إعدادات تنبيهات رادار المحاسبة" },
      { property: "og:description", content: "تنبيهات تليجرام وكلمات مفتاحية ومصادر RSS/Webhook." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function SettingsPage() {
  const [s, update] = useSettings();
  const send = useServerFn(sendTelegramTest);
  const live = useLiveSources(s.sources);
  const [kw, setKw] = useState("");
  const [sending, setSending] = useState(false);
  const [src, setSrc] = useState<Omit<Source, "id">>({ type: "RSS", name: "", url: "" });

  async function test(digest: boolean) {
    setSending(true);
    try {
      const matched = (live.data?.items ?? []).filter((o) => matchesKeywords(o, s.keywords) && o.budgetMax >= s.minBudget).slice(0, 5);
      const text = digest
        ? `<b>📡 رادار فرص المحاسبة</b>\n${matched.length} فرص تطابق كلماتك:\n\n` +
          matched.map((o) => `• <b>${o.title}</b>\n  ${o.platform} | $${o.budgetMin}-${o.budgetMax} | ${o.urgency}\n  ${o.url}`).join("\n\n")
        : "✅ تم ربط رادار فرص المحاسبة بنجاح!";
      await send({ data: { token: s.botToken.trim(), chatId: s.chatId.trim(), text } });
      toast.success("تم إرسال الرسالة إلى تليجرام");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الإرسال");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-3xl font-bold">التنبيهات والإعدادات</h1>

      <Card title="بوت تليجرام" desc="أنشئ بوتاً عبر @BotFather وانسخ التوكن، ثم أرسل أي رسالة للبوت واحصل على معرف الشات من @userinfobot.">
        <div className="flex items-center justify-between"><Label>تفعيل التنبيهات</Label><Switch checked={s.alertsEnabled} onCheckedChange={(v) => update({ alertsEnabled: v })} /></div>
        <div className="space-y-2"><Label>توكن البوت</Label><Input dir="ltr" type="password" value={s.botToken} onChange={(e) => update({ botToken: e.target.value })} placeholder="123456789:AA..." /></div>
        <div className="space-y-2"><Label>معرف الشات (Chat ID)</Label><Input dir="ltr" value={s.chatId} onChange={(e) => update({ chatId: e.target.value })} placeholder="123456789" /></div>
        <div className="space-y-2"><Label>الحد الأدنى للميزانية ($)</Label><Input dir="ltr" type="number" value={s.minBudget} onChange={(e) => update({ minBudget: Number(e.target.value) || 0 })} /></div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={sending || !s.botToken || !s.chatId} onClick={() => test(false)}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}رسالة تجريبية</Button>
          <Button variant="outline" disabled={sending || !s.botToken || !s.chatId} onClick={() => test(true)}>إرسال ملخص الفرص المطابقة</Button>
        </div>
        <p className="text-xs text-muted-foreground">عند تفعيل التنبيهات، تصلك رسالة تلقائية لكل فرصة جديدة من مصادرك تطابق كلماتك المفتاحية (تُفحص المصادر كل 5 دقائق أثناء فتح التطبيق). الفرص الموجودة عند أول تشغيل لا تُرسل. تُحفظ البيانات في متصفحك فقط.</p>
      </Card>

      <Card title="الكلمات المفتاحية" desc="سيتم التنبيه بالفرص التي تحتوي على أي من هذه الكلمات.">
        <div className="flex flex-wrap gap-2">
          {s.keywords.map((k) => (
            <Badge key={k} variant="secondary" className="gap-1 px-3 py-1 text-sm font-normal">
              {k}<button onClick={() => update({ keywords: s.keywords.filter((x) => x !== k) })} aria-label="حذف"><X className="size-3" /></button>
            </Badge>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = kw.trim(); if (v && !s.keywords.includes(v)) update({ keywords: [...s.keywords, v] }); setKw(""); }}>
          <Input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="أضف كلمة: ساب، رواتب..." />
          <Button type="submit" variant="outline"><Plus className="size-4" />إضافة</Button>
        </form>
      </Card>

      <Card title="مصادر RSS و Webhook" desc="أضف رابط خلاصة RSS/Atom، أو رابط Webhook يُرجع JSON (قائمة فيها title وdescription وurl). تُجلب الفرص كل 5 دقائق وتُحذف المكررات. يُعرض فقط ما يخص السعودية (مدينة سعودية أو ذكر المملكة).">
        {s.sources.map((x) => (
          <div key={x.id} className="flex items-center gap-3 rounded-lg border p-3">
            <Badge variant="outline">{x.type}</Badge>
            <div className="min-w-0 flex-1"><div className="font-medium">{x.name}</div><div className="truncate text-xs text-muted-foreground" dir="ltr">{x.url}</div></div>
            <Button size="icon" variant="ghost" onClick={() => update({ sources: s.sources.filter((y) => y.id !== x.id) })}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <div className="grid gap-2 md:grid-cols-[110px_1fr_1.5fr_auto]">
          <Select value={src.type} onValueChange={(v) => setSrc({ ...src, type: v as Source["type"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="RSS">RSS</SelectItem><SelectItem value="Webhook">Webhook (JSON)</SelectItem></SelectContent>
          </Select>
          <Input value={src.name} onChange={(e) => setSrc({ ...src, name: e.target.value })} placeholder="الاسم" />
          <Input dir="ltr" value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} placeholder="https://..." />
          <Button variant="outline" onClick={() => {
            if (!src.name || !/^https?:\/\//.test(src.url)) { toast.error("أدخل اسماً ورابطاً صحيحاً"); return; }
            update({ sources: [...s.sources, { ...src, id: crypto.randomUUID() }] }); setSrc({ type: "RSS", name: "", url: "" });
          }}><Plus className="size-4" /></Button>
        </div>
      </Card>

      <Card title="ملفك المهني" desc="يُستخدم في توليد عروض التقديم.">
        <div className="space-y-2"><Label>الاسم</Label><Input value={s.freelancerName} onChange={(e) => update({ freelancerName: e.target.value })} /></div>
        <div className="space-y-2"><Label>نبذة وخبرات</Label><Textarea value={s.bio} onChange={(e) => update({ bio: e.target.value })} className="min-h-28" /></div>
      </Card>
    </div>
  );
}
