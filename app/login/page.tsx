"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ tone: "error", text: "البريد أو كلمة المرور غير صحيحة" });
      else router.replace("/dashboard");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { business_name: businessName } },
      });
      if (error) setMessage({ tone: "error", text: error.message });
      else if (!data.session) setMessage({ tone: "info", text: "أرسلنا لك رابط تفعيل على بريدك. فعّل الحساب ثم سجّل الدخول." });
      else router.replace("/dashboard/settings");
    }
    setBusy(false);
  }

  const input =
    "w-full rounded-md border border-line bg-white px-3 py-2.5 text-ink placeholder:text-muted focus:border-carbon focus:outline-none";

  return (
    <main className="grid min-h-full place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-4xl font-extrabold text-ink">وصلة</h1>
        <p className="mt-1 text-ink-soft">رسائل الزبائن تتحول لطلبات جاهزة للشحن.</p>

        <form onSubmit={submit} className="mt-8 space-y-4 rounded-lg border border-line bg-panel p-6">
          {mode === "signup" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium">اسم المتجر</span>
              <input className={input} required value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">البريد الإلكتروني</span>
            <input className={`${input} ltr-nums text-left`} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">كلمة المرور</span>
            <input className={`${input} ltr-nums text-left`} type="password" required minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          {message && (
            <p role="alert" className={`rounded-md px-3 py-2 text-sm ${message.tone === "error" ? "bg-risk-bg text-risk" : "bg-carbon-soft text-carbon"}`}>
              {message.text}
            </p>
          )}

          <button disabled={busy} className="w-full rounded-md bg-ink py-2.5 font-display font-semibold text-white disabled:opacity-60">
            {busy ? "لحظة…" : mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </button>
        </form>

        <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="mt-4 text-sm text-carbon underline-offset-4 hover:underline">
          {mode === "signin" ? "ما عندكش حساب؟ سجّل متجرك" : "عندك حساب؟ ادخل"}
        </button>
      </div>
    </main>
  );
}
