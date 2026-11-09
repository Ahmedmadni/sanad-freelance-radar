import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendTelegramTest } from "./ai.functions";
import { alertKey, pickAlerts } from "./feeds";
import { useLiveSources, formatDate } from "./use-live-sources";
import type { Settings } from "./settings";

const SENT_KEY = "gig-radar-sent-alerts";
const MAX_PER_CYCLE = 5;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Watches the user's sources while the app is open and sends one Telegram message per new matching opportunity. */
export function useTelegramAlerts(settings: Settings) {
  const send = useServerFn(sendTelegramTest);
  const q = useLiveSources(settings.sources);
  const busy = useRef(false);
  const ready = settings.alertsEnabled && !!settings.botToken && !!settings.chatId;

  useEffect(() => {
    const items = q.data?.items;
    if (!ready || !items?.length || busy.current) return;
    const stored = localStorage.getItem(SENT_KEY);
    const sent = new Set<string>(stored ? JSON.parse(stored) : []);
    const save = () => localStorage.setItem(SENT_KEY, JSON.stringify([...sent].slice(-2000)));

    // First run: treat what is already there as the baseline so the chat isn't flooded.
    if (stored === null) {
      items.forEach((o) => sent.add(alertKey(o)));
      save();
      return;
    }

    const fresh = pickAlerts(items, settings.keywords, settings.minBudget, sent).slice(0, MAX_PER_CYCLE);
    if (!fresh.length) return;
    busy.current = true;
    (async () => {
      let ok = 0;
      for (const o of fresh) {
        const currency = o.budgetCurrency === "SAR" ? "ريال" : o.budgetCurrency === "USD" ? "USD" : null;
        const budget = o.budgetMax > 0 && currency ? `${o.budgetMin}-${o.budgetMax} ${currency}` : "غير محددة";
        const text =
          `🔔 <b>فرصة جديدة تطابق كلماتك</b>\n\n<b>${esc(o.title)}</b>\n` +
          `${esc(o.description.slice(0, 300))}\n\n` +
          `📍 المصدر: ${esc(o.sourceName ?? o.platform)}\n💰 الميزانية: ${budget}\n🕒 ${formatDate(o.publishedAt)}\n${o.url}`;
        try {
          await send({ data: { token: settings.botToken.trim(), chatId: settings.chatId.trim(), text } });
          sent.add(alertKey(o));
          ok++;
        } catch (e: any) {
          toast.error(`تعذر إرسال تنبيه تليجرام: ${e?.message ?? ""}`);
          break;
        }
      }
      save();
      if (ok) toast.success(`أُرسل ${ok} تنبيه إلى تليجرام`);
      busy.current = false;
    })();
  }, [q.data, ready, settings.keywords, settings.minBudget, settings.botToken, settings.chatId, send]);
}

export function resetAlertBaseline() {
  localStorage.removeItem(SENT_KEY);
}
