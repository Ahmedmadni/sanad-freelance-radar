import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Briefcase, Flame, Wallet, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { OpportunityCard } from "@/components/OpportunityCard";
import { SEED, SKILLS, PLATFORMS, URGENCIES, matchesKeywords } from "@/lib/opportunities";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة التحكم | رادار فرص المحاسبة" },
      { name: "description", content: "تابع أحدث مشاريع المحاسبة والمالية من مستقل وخمسات وبعيد في لوحة واحدة." },
      { property: "og:title", content: "رادار فرص المحاسبة" },
      { property: "og:description", content: "لوحة متابعة فرص المحاسبة للمحاسب المستقل مع مولد عروض ذكي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const BUDGETS = [
  { v: "all", l: "كل الميزانيات" },
  { v: "lt250", l: "أقل من 250$" },
  { v: "250-1000", l: "250$ – 1000$" },
  { v: "gt1000", l: "أكثر من 1000$" },
];

function Dashboard() {
  const [settings] = useSettings();
  const [q, setQ] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [budget, setBudget] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [platform, setPlatform] = useState("all");

  const list = useMemo(() => SEED.filter((o) => {
    if (q && !`${o.title} ${o.description} ${o.client} ${o.tools?.join(" ")}`.includes(q)) return false;
    if (skills.length && !skills.some((s) => o.skills.includes(s as any))) return false;
    if (urgency !== "all" && o.urgency !== urgency) return false;
    if (platform !== "all" && o.platform !== platform) return false;
    if (budget === "lt250" && o.budgetMax >= 250) return false;
    if (budget === "250-1000" && (o.budgetMax < 250 || o.budgetMin > 1000)) return false;
    if (budget === "gt1000" && o.budgetMax <= 1000) return false;
    return true;
  }), [q, skills, budget, urgency, platform]);

  const matched = SEED.filter((o) => matchesKeywords(o, settings.keywords)).length;
  const stats = [
    { icon: Briefcase, label: "فرص نشطة", value: SEED.length },
    { icon: Flame, label: "عاجلة", value: SEED.filter((o) => o.urgency === "عاجل").length },
    { icon: Target, label: "تطابق كلماتك", value: matched },
    { icon: Wallet, label: "متوسط الميزانية", value: `$${Math.round(SEED.reduce((a, o) => a + (o.budgetMin + o.budgetMax) / 2, 0) / SEED.length)}` },
  ];

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-muted-foreground">مرحباً {settings.freelancerName} 👋</p>
        <h1 className="mt-1 font-display text-3xl font-bold md:text-4xl">فرص اليوم في المحاسبة والمالية</h1>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <s.icon className="size-5 text-primary" />
            <div className="mt-3 font-mono text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-xl border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative md:col-span-1">
            <Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: ساب، زكاة، فودكس..." className="ps-9" />
          </div>
          <Filter value={budget} onChange={setBudget} items={BUDGETS} />
          <Filter value={urgency} onChange={setUrgency} items={[{ v: "all", l: "كل مستويات الإلحاح" }, ...URGENCIES.map((u) => ({ v: u, l: u }))]} />
          <Filter value={platform} onChange={setPlatform} items={[{ v: "all", l: "كل المنصات" }, ...PLATFORMS.map((u) => ({ v: u, l: u }))]} />
        </div>
        <div className="flex flex-wrap gap-2">
          {SKILLS.map((s) => {
            const on = skills.includes(s);
            return (
              <Badge key={s} variant={on ? "default" : "outline"} className={cn("cursor-pointer px-3 py-1 text-sm font-normal")}
                onClick={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])}>
                {s}
              </Badge>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-4 text-sm text-muted-foreground">{list.length} فرصة مطابقة</p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => <OpportunityCard key={o.id} o={o} settings={settings} />)}
        </div>
        {!list.length && <p className="py-16 text-center text-muted-foreground">لا توجد فرص بهذه المعايير.</p>}
      </section>
    </div>
  );
}

function Filter({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: { v: string; l: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger dir="rtl"><SelectValue /></SelectTrigger>
      <SelectContent dir="rtl">{items.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}</SelectContent>
    </Select>
  );
}
