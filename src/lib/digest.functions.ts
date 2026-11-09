import { createServerFn } from "@tanstack/react-start";
import { requireOwner } from "./owner-auth";
import { safeUrl } from "./feeds.functions";
import type { Source } from "./settings";

type ConfigInput = {
  enabled: boolean;
  sendsPerDay: 1 | 2;
  sources: Pick<Source, "name" | "url" | "type">[];
};

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Generated Supabase types are intentionally not edited by hand.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export const getDigestConfig = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((data: Record<string, never>) => data)
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: current, error } = await db.from("radar_digest_preferences")
      .select("enabled,sends_per_day,sources,updated_at")
      .eq("user_id", context.userId).maybeSingle();
    if (error) throw new Error("تعذر تحميل إعدادات التقرير: " + error.message);

    const { data: recent, error: historyError } = await db.from("radar_digest_runs")
      .select("status,slot_key,opportunity_count,message_count,finished_at,error")
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (historyError) throw new Error("تعذر تحميل سجل التقارير");

    const { count, error: pendingError } = await db.from("radar_found_opportunities")
      .select("opportunity_id", { count: "exact", head: true })
      .eq("user_id", context.userId).is("notified_at", null);
    if (pendingError) throw new Error("تعذر تحميل عدد الفرص الجديدة");

    return {
      enabled: current?.enabled ?? true,
      sendsPerDay: current?.sends_per_day === 2 ? 2 as const : 1 as const,
      sourcesCount: Array.isArray(current?.sources) ? current.sources.length as number : 0,
      updatedAt: current?.updated_at ?? null,
      lastRun: recent ?? null,
      pendingCount: count ?? 0,
    };
  });

export const saveDigestConfig = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: ConfigInput): ConfigInput => {
    if (typeof input?.enabled !== "boolean" || (input.sendsPerDay !== 1 && input.sendsPerDay !== 2)) {
      throw new Error("إعدادات التقرير غير صالحة");
    }
    if (!Array.isArray(input.sources) || input.sources.length > 20) {
      throw new Error("عدد مصادر البيانات غير صالح");
    }
    return {
      enabled: input.enabled,
      sendsPerDay: input.sendsPerDay,
      sources: input.sources.map((source) => {
        if (!source || !["RSS", "Webhook"].includes(source.type) ||
            typeof source.name !== "string" || source.name.trim().length < 1 ||
            source.name.length > 80 || typeof source.url !== "string" || source.url.length > 1000) {
          throw new Error("مصدر بيانات غير صالح");
        }
        return { name: source.name.trim(), url: safeUrl(source.url), type: source.type };
      }),
    };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { error } = await db.from("radar_digest_preferences")
      .upsert({
        user_id: context.userId,
        enabled: data.enabled,
        sends_per_day: data.sendsPerDay,
        sources: data.sources,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (error) throw new Error("تعذر حفظ إعدادات التقرير: " + error.message);
    return { saved: true as const };
  });
