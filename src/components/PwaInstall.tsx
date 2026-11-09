import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setIsStandalone(standalone);
    setInstalled(standalone);
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setFeedback("تم تثبيت سند. يمكنك فتحه من شاشة هاتفك الرئيسية.");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator && location.protocol === "https:") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installation may still be possible via the browser menu.
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "dismissed") setFeedback("يمكنك التثبيت لاحقاً من قائمة المتصفح.");
      setPrompt(null);
    } catch {
      setFeedback("تعذر فتح التثبيت؛ استخدم قائمة المتصفح ثم تثبيت التطبيق.");
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="تثبيت التطبيق">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">تثبيت سند على الهاتف</h2>
          <p className="text-xs text-muted-foreground">
            {installed || isStandalone
              ? "التطبيق مثبت على جهازك."
              : "افتح سند من الشاشة الرئيسية مثل أي تطبيق، دون الحاجة إلى المتجر."}
          </p>
        </div>
      </div>
      {!installed && !isStandalone && prompt && (
        <Button onClick={() => void install()} className="w-full sm:w-auto">
          <Download className="size-4" /> تثبيت التطبيق
        </Button>
      )}
      {!installed && !isStandalone && !prompt && (
        <p className="text-xs text-muted-foreground sm:max-w-56">
          {isIos
            ? "على Safari: مشاركة ← إضافة إلى الشاشة الرئيسية."
            : "من قائمة Chrome (⋮) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»."}
        </p>
      )}
      {feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
    </section>
  );
}
