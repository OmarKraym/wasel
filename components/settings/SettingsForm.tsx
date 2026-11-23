"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/ui/api";
import { createClient } from "@/lib/supabase/client";
import { LIBYAN_CITIES } from "@/lib/libya/cities";
import type { Merchant, Product } from "@/lib/types";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-line py-8 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-ink-soft">{hint}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function useSaver() {
  const [state, setState] = useState<{ busy: boolean; msg: string | null; error: boolean }>({ busy: false, msg: null, error: false });
  async function save(body: Record<string, unknown>, ok = "تم الحفظ") {
    setState({ busy: true, msg: null, error: false });
    try {
      await api("/api/settings", body, "PUT");
      setState({ busy: false, msg: ok, error: false });
      return true;
    } catch (e) {
      setState({ busy: false, msg: (e as Error).message, error: true });
      return false;
    }
  }
  const note = state.msg ? (
    <p role="status" className={`text-sm ${state.error ? "text-risk" : "text-ok"}`}>{state.msg}</p>
  ) : null;
  return { save, busy: state.busy, note };
}

const input = "w-full rounded-md border border-line bg-white px-3 py-2 focus:border-carbon focus:outline-none";
const btn = "rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function SettingsForm({ merchant, initialProducts, appUrl }: { merchant: Merchant; initialProducts: Product[]; appUrl: string }) {
  const store = useSaver();
  const pin = useSaver();
  const meta = useSaver();
  const rates = useSaver();

  const [name, setName] = useState(merchant.business_name);
  const [phone, setPhone] = useState(merchant.phone ?? "");
  const [pinValue, setPinValue] = useState("");
  const [pinSet, setPinSet] = useState(merchant.courier_pin_set);
  const [token, setToken] = useState("");
  const [rateMap, setRateMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(merchant.delivery_rates_json).map(([k, v]) => [k, String(v)])),
  );

  return (
    <div className="mx-auto h-full max-w-5xl overflow-y-auto px-4 pb-16 sm:px-6">
      <h1 className="pt-6 font-display text-2xl font-extrabold">الإعدادات</h1>

      <Section title="بيانات المتجر" hint="الاسم يظهر على ملصق الشحن.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1 block text-sm">اسم المتجر</span><input className={input} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label><span className="mb-1 block text-sm">هاتف المتجر</span><input className={`${input} ltr-nums text-left`} value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button className={btn} disabled={store.busy || !name.trim()} onClick={() => store.save({ business_name: name, phone: phone || null })}>حفظ</button>
          {store.note}
        </div>
      </Section>

      <Section title="رمز المندوب" hint="4 أرقام يدخلها المندوب بعد مسح الملصق. غيّره لو تبدّل المندوب. 5 محاولات غلط تقفل الملصق 15 دقيقة.">
        <p className="mb-3 text-sm">{pinSet ? "✅ الرمز مفعّل." : "⚠️ ما فيش رمز. المندوب ما يقدرش يسلّم الطلبات."}</p>
        <div className="flex items-center gap-3">
          <input aria-label="رمز جديد" className={`${input} ltr-nums w-32 text-center font-display text-xl tracking-[0.5em]`} inputMode="numeric" maxLength={4}
            value={pinValue} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />
          <button className={btn} disabled={pin.busy || pinValue.length !== 4}
            onClick={async () => { if (await pin.save({ courier_pin: pinValue }, "تم تحديث الرمز")) { setPinSet(true); setPinValue(""); } }}>
            {pinSet ? "تغيير الرمز" : "تفعيل الرمز"}
          </button>
          {pin.note}
        </div>
      </Section>

      <Section title="ربط فيسبوك وإنستغرام" hint="الصق Page Access Token طويل المدة. نتحقق من الصفحة عند Meta ونحفظ الرمز مشفّر.">
        <p className="mb-3 text-sm">
          {merchant.meta_page_id ? <>الصفحة المربوطة: <span className="ltr-nums">{merchant.meta_page_id}</span>{merchant.meta_ig_account_id ? " + حساب إنستغرام" : ""}</> : "ما فيش صفحة مربوطة."}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input type="password" autoComplete="off" className={`${input} ltr-nums text-left`} placeholder="EAAG…" value={token} onChange={(e) => setToken(e.target.value)} />
          <button className={`${btn} shrink-0`} disabled={meta.busy || token.length < 20}
            onClick={async () => { if (await meta.save({ meta_page_token: token }, "تم ربط الصفحة")) setToken(""); }}>
            ربط الصفحة
          </button>
        </div>
        <div className="mt-2">{meta.note}</div>
        <details className="mt-4 rounded-md bg-mist p-3 text-sm">
          <summary className="cursor-pointer font-medium">إعداد Webhook في Meta</summary>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-ink-soft">
            <li>Callback URL: <code className="ltr-nums">{(appUrl || "https://your-domain") + "/api/webhooks/meta"}</code></li>
            <li>Verify token: نفس قيمة <code>META_VERIFY_TOKEN</code>.</li>
            <li>اشترك في: <code>messages</code> و <code>message_echoes</code> للصفحة وحساب إنستغرام.</li>
          </ol>
        </details>
      </Section>

      <Section title="أسعار التوصيل" hint="بالدينار الليبي لكل مدينة. «باقي المدن» يُستعمل للمدن الفاضية.">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {[{ name: "_default", label: "باقي المدن" }, ...LIBYAN_CITIES.map((c) => ({ name: c.name, label: c.name }))].map((c) => (
            <label key={c.name} className="flex items-center justify-between gap-2 text-sm">
              <span className={c.name === "_default" ? "font-medium" : ""}>{c.label}</span>
              <input className={`${input} ltr-nums w-20 py-1 text-center`} inputMode="decimal" value={rateMap[c.name] ?? ""}
                onChange={(e) => setRateMap((m) => ({ ...m, [c.name]: e.target.value.replace(/[^\d.]/g, "") }))} />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className={btn} disabled={rates.busy}
            onClick={() => rates.save({
              delivery_rates_json: Object.fromEntries(Object.entries(rateMap).filter(([, v]) => v !== "" && !Number.isNaN(Number(v))).map(([k, v]) => [k, Number(v)])),
            })}>
            حفظ الأسعار
          </button>
          {rates.note}
        </div>
      </Section>

      <Section title="المنتجات" hint="الذكاء الاصطناعي يطابق رسائل الزبائن مع هذه القائمة. اكتب أسماء واضحة (اللون والمقاس).">
        <ProductsEditor merchantId={merchant.id} initial={initialProducts} />
      </Section>
    </div>
  );
}

function ProductsEditor({ merchantId, initial }: { merchantId: string; initial: Product[] }) {
  const [products, setProducts] = useState(initial);
  const [draft, setDraft] = useState({ name: "", sku: "", price: "", stock: "" });
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function add() {
    setError(null);
    const { data, error: err } = await supabase
      .from("products")
      .insert({
        merchant_id: merchantId,
        name: draft.name.trim(),
        sku: draft.sku.trim() || null,
        price_lyd: Number(draft.price || 0),
        stock_quantity: Math.max(0, Math.floor(Number(draft.stock || 0))),
      })
      .select("*")
      .single();
    if (err) return setError(err.code === "23505" ? "رمز SKU مستعمل" : "تعذّر الإضافة");
    setProducts((p) => [data as Product, ...p]);
    setDraft({ name: "", sku: "", price: "", stock: "" });
  }

  async function update(id: string, patch: Partial<Product>) {
    setProducts((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const { error: err } = await supabase.from("products").update(patch).eq("id", id);
    if (err) setError("تعذّر الحفظ");
  }

  const cell = "w-full rounded border border-transparent bg-transparent px-2 py-1.5 hover:border-line focus:border-carbon focus:bg-white focus:outline-none";

  return (
    <div>
      <div className="grid grid-cols-[1fr_100px_90px_80px_auto] gap-2 rounded-md border border-line bg-white p-2">
        <input aria-label="اسم المنتج" placeholder="اسم المنتج (مثلاً: فستان أسود مقاس M)" className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input aria-label="SKU" placeholder="SKU" className={`${input} ltr-nums`} value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} />
        <input aria-label="السعر" placeholder="السعر" inputMode="decimal" className={`${input} ltr-nums`} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
        <input aria-label="المخزون" placeholder="المخزون" inputMode="numeric" className={`${input} ltr-nums`} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
        <button aria-label="إضافة منتج" disabled={!draft.name.trim()} onClick={add} className="rounded-md bg-ink px-3 text-white disabled:opacity-40"><Plus className="size-4" /></button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-risk">{error}</p>}

      <table className="mt-3 w-full text-sm">
        <thead className="text-xs text-ink-soft">
          <tr><th className="p-2 text-start font-medium">المنتج</th><th className="w-28 p-2 text-start font-medium">SKU</th><th className="w-24 p-2 text-start font-medium">السعر</th><th className="w-20 p-2 text-start font-medium">المخزون</th><th className="w-16 p-2 font-medium">نشط</th></tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className={`border-t border-line/60 ${p.is_active ? "" : "opacity-50"}`}>
              <td className="p-1"><input aria-label="الاسم" className={cell} defaultValue={p.name} onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && update(p.id, { name: e.target.value.trim() })} /></td>
              <td className="p-1"><input aria-label="SKU" className={`${cell} ltr-nums`} defaultValue={p.sku ?? ""} onBlur={(e) => e.target.value !== (p.sku ?? "") && update(p.id, { sku: e.target.value || null })} /></td>
              <td className="p-1"><input aria-label="السعر" inputMode="decimal" className={`${cell} ltr-nums`} defaultValue={p.price_lyd} onBlur={(e) => Number(e.target.value) !== Number(p.price_lyd) && update(p.id, { price_lyd: Number(e.target.value) || 0 })} /></td>
              <td className="p-1"><input aria-label="المخزون" inputMode="numeric" className={`${cell} ltr-nums`} defaultValue={p.stock_quantity} onBlur={(e) => Number(e.target.value) !== p.stock_quantity && update(p.id, { stock_quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} /></td>
              <td className="p-1 text-center"><input type="checkbox" aria-label="نشط" checked={p.is_active} onChange={(e) => update(p.id, { is_active: e.target.checked })} className="size-4" /></td>
            </tr>
          ))}
          {products.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">أضف أول منتج باش الذكاء الاصطناعي يقدر يطابق الطلبات.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
