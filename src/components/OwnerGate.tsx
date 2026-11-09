import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Radar, ShieldCheck, LogOut, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { verifyOwnerAccess } from "@/lib/session.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Fail closed: a session by itself does not authorize access to the personal dashboard. */
export function OwnerGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<"checking" | "authorized" | "denied">("checking");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const verify = useServerFn(verifyOwnerAccess);
  const token = session?.access_token;

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) setError("تعذر الاتصال بخدمة تسجيل الدخول. حاول تحديث الصفحة.");
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setError("تعذر الاتصال بخدمة تسجيل الدخول. حاول تحديث الصفحة.");
          setLoading(false);
        }
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (mounted) {
        setSession(next);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setAccess("checking");
      return;
    }
    let active = true;
    setAccess("checking");
    verify({ data: {} })
      .then((result) => {
        if (active) setAccess(result.authorized ? "authorized" : "denied");
      })
      .catch(() => {
        if (active) setAccess("denied");
      });
    return () => { active = false; };
  }, [token, verify, retry]);

  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;
      setPassword("");
    } catch {
      setError("تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور ثم حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || (session && access === "checking")) {
    return (
      <main dir="rtl" className="grid min-h-screen place-items-center bg-background p-6">
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> جارٍ التحقق من حساب المالك...
        </div>
      </main>
    );
  }
  if (session && access === "authorized") return <>{children}</>;

  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center justify-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Radar className="size-7" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold">رادار فرص المحاسبة</h1>
            <p className="text-sm text-muted-foreground">لوحة إدارة الفرص — حساب المالك</p>
          </div>
        </div>
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="font-display text-xl font-semibold">
              {session ? "التحقق من الصلاحيات" : "تسجيل الدخول"}
            </h2>
          </div>

          {session ? (
            <div className="space-y-4">
              <p role="alert" className="text-sm text-destructive">
                الحساب مسجل، لكن لم يتم تأكيد صلاحية مالك النظام. تحقق من إعداد SANAD_OWNER_EMAIL في أسرار Cloud أو أعد المحاولة.
              </p>
              <Button className="w-full" onClick={() => setRetry((x) => x + 1)}>إعادة التحقق</Button>
              <Button className="w-full" variant="outline" onClick={() => void supabase.auth.signOut()}>
                <LogOut className="size-4" /> تسجيل الخروج
              </Button>
            </div>
          ) : (
            <form onSubmit={login} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="owner-email">البريد الإلكتروني</Label>
                <Input
                  id="owner-email" dir="ltr" type="email" autoComplete="username"
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                  placeholder="example@domain.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner-password">كلمة المرور</Label>
                <div className="flex gap-2">
                  <Input
                    id="owner-password" dir="ltr" type={showPassword ? "text" : "password"}
                    autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} required
                    className="flex-1"
                  />
                  <Button type="button" size="icon" variant="outline"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? "جارٍ تسجيل الدخول..." : "دخول لوحة التحكم"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                الدخول مخصص لمالك النظام فقط. لا يمكن إنشاء حسابات من هذه الصفحة.
              </p>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
