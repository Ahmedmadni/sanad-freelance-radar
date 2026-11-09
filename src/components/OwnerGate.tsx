import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The UI gate improves UX; protected server functions enforce authorization separately. */
export function OwnerGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setSession(data.session); setLoading(false); }
    }).catch(() => { if (mounted) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) { setSession(next); setLoading(false); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
    } catch {
      setError("تعذر تسجيل الدخول. تحقق من حسابك وكلمة المرور وإعدادات Lovable Cloud.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="grid min-h-screen place-items-center" dir="rtl">جارٍ التحقق من الجلسة...</div>;
  if (session) return <>{children}</>;
  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6">
        <h1 className="text-2xl font-bold">رادار فرص المحاسبة</h1>
        <p className="text-sm text-muted-foreground">تسجيل الدخول لحساب المالك. أنشئ الحساب في إعدادات Cloud Auth أولاً.</p>
        <div className="space-y-2"><Label htmlFor="owner-email">البريد الإلكتروني</Label>
          <Input id="owner-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="owner-password">كلمة المرور</Label>
          <Input id="owner-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "جارٍ التحقق..." : "تسجيل الدخول"}</Button>
      </form>
    </main>
  );
}
