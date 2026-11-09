import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { sendTelegramChannelTest } from "@/lib/telegram-channel.functions";
import { getDigestConfig, saveDigestConfig } from "@/lib/digest.functions";
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
  const sendChannel = useServerFn(sendTelegramChannelTest);
  const live = useLiveSources(s.sources);
  const loadDigest = useServerFn(getDigestConfig);
  const saveDigest = useServerFn(saveDigestConfig);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestFrequency, setDigestFrequency] = useState<1 | 2>(1);
  const [digestBusy, setDigestBusy] = useState(false);
  const [digestInfo, setDigestInfo] = useState<{
    pendingCount: number;
    sourcesCount: number;
    lastRun: { status: string; slot_key: string; opportunity_count: number; message_count: number; finished_at: string | null; error: string | null } | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    loadDigest({ data: {} }).then((value) => {
      if (!active) return;
      setDigestEnabled(value.enabled);
      setDigestFrequency(value.sendsPerDay);
      setDigestInfo({ pendingCount: value.pendingCount, sourcesCount: value.sourcesCount, lastRun: value.lastRun });
    }).catch(() => {
      if (active) toast.error("تعذر تحميل حالة التقارير التلقائية");
    });
    return () => { active = false; };
  }, [loadDigest]);

  async function saveDailyDigest() {
    setDigestBusy(true);
    try {
      await saveDigest({ data: {
        enabled: digestEnabled, sendsPerDay: digestFrequency,
        sources: s.sources.map(({ name, url, type }) => ({ name, url, type })),
      } });
      const info = await loadDigest({ data: {} });
      setDigestInfo({ pendingCount: info.pendingCount, sourcesCount: info.sourcesCount, lastRun: info.lastRun });
      toast.success("تم حفظ جدول التقارير ومصادر البحث في قاعدة البيانات");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر حفظ إعدادات التقارير");
    } finally {
      setDigestBusy(false);
    }
  }

  const [kw, setKw] = useState("");
  const [sending, setSending] = useState(false);
  const [channelBusy, setChannelBusy] = useState(false);

  async function testChannel() {
    setChannelBusy(true);
    try {
      await sendChannel({ data: {} });
      toast.success("تم نشر رسالة الاختبار في قناة سند");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل اختبار قناة تليجرام");
    } finally {
      setChannelBusy(false);
    }
  }
  const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const [src, setSrc] = useState<Omit<Source, "id">>({ type: "RSS", name: "", url: "" });

  async function test(digest: boolean) {
    setSending(true);
    try {
      const matched = (live.data?.items ?? []).filter((o) => matchesKeywords(o, s.keywords) && (s.minBudget <= 0 || o.budgetMax === 0 || (o.budgetCurrency === "USD" && o.budgetMax >= s.minBudget))).slice(0, 5);
      const text = digest
        ? `<b>📡 رادار فرص المحاسبة</b>\n${matched.length} فرص تطابق كلماتك:\n\n` +
          matched.map((o) => `• <b>${escapeHtml(o.title)}</b>\n  ${escapeHtml(o.platform)} | ${o.budgetMax > 0 && o.budgetCurrency ? `${o.budgetMin}-${o.budgetMax} ${o.budgetCurrency}` : "غير محددة"} | ${escapeHtml(o.urgency)}\n  ${escapeHtml(o.url)}`).join("\n\n")
        : "✅ تم ربط رادار فرص المحاسبة بنجاح!";
      await send({ data: { text } });
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

      <Card title="اختبارات البوت الخاصة" desc="هذا القسم لاختبار اتصال البوت مع حساب المالك فقط؛ لا يرسل هنا إلى متابعي القناة. تُحفظ البيانات في أسرار Cloud.">
        
        <div className="space-y-2"><Label>الحد الأدنى للميزانية ($)</Label><Input dir="ltr" type="number" value={s.minBudget} onChange={(e) => update({ minBudget: Number(e.target.value) || 0 })} /></div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={sending} onClick={() => test(false)}>{sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}رسالة تجريبية</Button>
          <Button variant="outline" disabled={sending} onClick={() => test(true)}>إرسال ملخص سريع (5 فرص)</Button>
        </div>
        <p className="text-xs text-muted-foreground">هذا القسم لاختبار الاتصال وإرسال ملخص سريع يدوياً. التنبيهات الفورية لكل فرصة متوقفة؛ التقارير التلقائية المجمعة تُضبط في القسم التالي. توكن البوت محفوظ في أسرار الخادم.</p>
      </Card>

      <Card title="قناة سند العامة" desc="كل من ينضم إلى القناة سيشاهد تقارير الفرص، دون الحاجة إلى تسجيل حساب في الموقع أو استقبال رسالة خاصة من البوت.">
        <p className="text-sm text-muted-foreground">
          أنشئ قناة تليجرام، وأضف @Ahmedelmadni_bot مشرفاً بصلاحية نشر الرسائل.
          بعدها احفظ مُعرّف القناة في أسرار Lovable Cloud باسم <code>TELEGRAM_CHANNEL_ID</code>؛
          يمكنك استخدام <code>@channel_username</code> لقناة عامة أو رقم قناة يبدأ بـ <code>-100</code>.
        </p>
        <Button variant="outline" disabled={channelBusy} onClick={() => void testChannel()}>
          {channelBusy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          نشر رسالة اختبار في القناة
        </Button>
        <p className="text-xs text-muted-foreground">
          رسائل الاختبار الخاصة ما زالت تذهب إلى حساب المالك عبر TELEGRAM_CHAT_ID.
          أما التقارير المجدولة فتُنشر للقناة عبر TELEGRAM_CHANNEL_ID فقط، ولن تُرسل تلقائياً إلى المحادثات الخاصة.
        </p>
      </Card>

      <Card title="التقرير التلقائي للقناة العامة" desc="بعد تفعيل مجدول الخادم يبحث سند كل ساعتين حتى لو كان الموقع مغلقاً، وينشر الفرص الجديدة في قناة تليجرام العامة.">
        <div className="flex items-center justify-between">
          <Label>تفعيل التقرير التلقائي</Label>
          <Switch checked={digestEnabled} onCheckedChange={setDigestEnabled} />
        </div>
        <div className="space-y-2">
          <Label>عدد التقارير اليومية — توقيت الرياض</Label>
          <Select value={String(digestFrequency)} onValueChange={(value) => setDigestFrequency(value === "2" ? 2 : 1)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">مرة يومياً — الساعة 8 صباحاً</SelectItem>
              <SelectItem value="2">مرتان يومياً — 8 صباحاً و8 مساءً</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button disabled={digestBusy} onClick={() => void saveDailyDigest()}>
          {digestBusy && <Loader2 className="size-4 animate-spin" />}
          حفظ جدول الإرسال ومزامنة مصادر البحث
        </Button>
        <p className="text-xs text-muted-foreground">
          تُنشر جميع الفرص الجديدة المكتشفة منذ آخر تقرير في القناة العامة، وليس أول خمس فرص فقط.
          وإذا تجاوزت القائمة الحد المسموح به لرسالة تليجرام تُرسل على عدة أجزاء ضمن التقرير نفسه.
          يحتاج التشغيل المستقل إلى تفعيل مهمة GitHub Actions المجدولة وربط أسرارها بالخادم.
        </p>
        {digestInfo && (
          <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
            <div>فرص مكتشفة تنتظر التقرير: <b>{digestInfo.pendingCount}</b></div>
            <div>مصادر إضافية تمت مزامنتها: <b>{digestInfo.sourcesCount}</b></div>
            <div>آخر تقرير: {digestInfo.lastRun
              ? `${digestInfo.lastRun.status === "sent" ? "تم الإرسال" : digestInfo.lastRun.status === "failed" ? "فشل الإرسال" : "جارٍ الإرسال"} | ${digestInfo.lastRun.opportunity_count} فرصة | ${digestInfo.lastRun.message_count} رسالة`
              : "لم يُرسل أي تقرير مجدول بعد"}
            </div>
          </div>
        )}
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

      <Card title="البيانات الشخصية والملف المهني" desc="تُضاف إلى عروض التقديم؛ احفظ بياناتك المهنية بعناية لأنها تُرسل لخدمة توليد النص عند الطلب.">
        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ["freelancerName", "الاسم الكامل", "text", ""],
            ["jobTitle", "المسمى المهني", "text", "محاسب قانوني"],
            ["phone", "رقم الجوال", "tel", "05xxxxxxxx"],
            ["whatsapp", "واتساب", "tel", "9665xxxxxxxx"],
            ["email", "البريد الإلكتروني", "email", "name@example.com"],
            ["city", "المدينة", "text", "الرياض"],
            ["experienceYears", "سنوات الخبرة", "text", "8"],
            ["linkedin", "رابط لينكدإن", "url", "https://linkedin.com/in/..."],
            ["website", "الموقع / معرض الأعمال", "url", "https://"],
            ["certifications", "الشهادات المهنية", "text", "SOCPA، CMA"],
          ] as const).map(([k, label, type, ph]) => (
            <div key={k} className="space-y-2">
              <Label>{label}</Label>
              <Input type={type} dir={type === "text" ? undefined : "ltr"} placeholder={ph} value={s[k]} onChange={(e) => update({ [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="space-y-2"><Label>نبذة وخبرات</Label><Textarea value={s.bio} onChange={(e) => update({ bio: e.target.value })} className="min-h-28" /></div>
      </Card>
    </div>
  );
}
