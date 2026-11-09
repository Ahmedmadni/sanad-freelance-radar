import { useEffect, useState } from "react";
import { DEFAULT_KEYWORDS } from "./opportunities";

export interface Source {
  id: string;
  type: "RSS" | "Webhook";
  name: string;
  url: string;
}

export interface Settings {
  keywords: string[];
  alertsEnabled: boolean;
  minBudget: number;
  sources: Source[];
  freelancerName: string;
  bio: string;
  jobTitle: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  linkedin: string;
  website: string;
  experienceYears: string;
  certifications: string;
}

const KEY = "gig-radar-settings";
export const DEFAULT_SETTINGS: Settings = {
  keywords: DEFAULT_KEYWORDS,
  alertsEnabled: true,
  minBudget: 0,
  sources: [],
  freelancerName: "أحمد المدني",
  bio: "محاسب مستقل بخبرة في مسك الدفاتر وإعداد القوائم المالية والزكاة والضريبة وبرامج ERP مثل قيود ودفترة وفودكس وساب.",
  jobTitle: "محاسب مستقل",
  phone: "",
  whatsapp: "",
  email: "",
  city: "",
  linkedin: "",
  website: "",
  experienceYears: "",
  certifications: "",
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Record<string, unknown>;
          // Purge legacy bot credentials from browser storage on the first load.
          delete saved['botToken'];
          delete saved['chatId'];
          localStorage.setItem(KEY, JSON.stringify(saved));
          setSettings({ ...DEFAULT_SETTINGS, ...saved });
        }
      } catch {}
    };
    load();
    window.addEventListener("gig-settings", load);
    return () => window.removeEventListener("gig-settings", load);
  }, []);
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      localStorage.setItem(KEY, JSON.stringify(next));
      setTimeout(() => window.dispatchEvent(new Event("gig-settings")), 0);
      return next;
    });
  return [settings, update] as const;
}
