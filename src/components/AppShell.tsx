import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun, Radar, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "لوحة التحكم" },
  { to: "/feed", label: "التغذية المباشرة" },
  { to: "/settings", label: "التنبيهات والإعدادات" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const d = localStorage.getItem("theme") === "dark";
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
  }, []);
  const toggle = () => {
    const d = !dark;
    setDark(d);
    localStorage.setItem("theme", d ? "dark" : "light");
    document.documentElement.classList.toggle("dark", d);
  };
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Radar className="size-5" /></span>
            <span className="font-display text-xl font-bold">رادار فرص المحاسبة</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                activeProps={{ className: "bg-accent !text-foreground font-semibold" }} activeOptions={{ exact: true }}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={() => void supabase.auth.signOut()}><LogOut className="size-4" />خروج</Button>
          <Button variant="ghost" size="icon" className="ms-auto" onClick={toggle} aria-label="تبديل الوضع">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
