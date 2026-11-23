"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Lock, MapPin, Phone, Undo2 } from "lucide-react";

interface ScanOrder {
  merchant_name: string;
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  city: string | null;
  address_details: string | null;
  items: Array<{ name?: string; quantity: number }>;
  total_lyd: number;
  payment_method: string;
  payment_status: string;
  order_status: "draft" | "confirmed" | "shipped" | "delivered" | "returned";
  tracking_code: string | null;
}

type Result = { ok: true; order: ScanOrder } | { ok: false; error: string; attempts_left?: number; retry_after?: number; status?: string };

async function call(token: string, pin: string, action: "view" | "delivered" | "returned"): Promise<Result> {
  const res = await fetch("/api/orders/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, pin, action }),
  });
  return (await res.json().catch(() => ({ ok: false, error: "NETWORK" }))) as Result;
}

function errorText(r: Extract<Result, { ok: false }>): string {
  switch (r.error) {
    case "BAD_PIN":
      return `الرمز غلط. باقي ${r.attempts_left ?? 0} محاولات.`;
    case "LOCKED":
      return `محاولات كثيرة. جرّب بعد ${Math.ceil((r.retry_after ?? 900) / 60)} دقيقة.`;
    case "PIN_NOT_SET":
      return "التاجر ما فعّلش رمز المندوب. كلّمه.";
    case "NOT_FOUND":
      return "الملصق هذا مش مسجّل.";
    case "INVALID_STATE":
      return r.status === "delivered" ? "الطلب مسلَّم من قبل." : r.status === "returned" ? "الطلب مسجّل مرتجع من قبل." : "الطلب مش جاهز للتسليم.";
    default:
      return "صار خطأ في الاتصال. حاول مرة ثانية.";
  }
}

export function CourierScan({ token }: { token: string }) {
  const [pin, setPin] = useState("");
  const [order, setOrder] = useState<ScanOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<null | "delivered" | "returned">(null);
  const [done, setDone] = useState<null | "delivered" | "returned">(null);

  async function unlock(p: string) {
    setBusy(true);
    setError(null);
    const r = await call(token, p, "view");
    setBusy(false);
    if (r.ok) setOrder(r.order);
    else {
      setError(errorText(r));
      setPin("");
    }
  }

  useEffect(() => {
    if (pin.length === 4 && !order && !busy) void unlock(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  async function act(action: "delivered" | "returned") {
    setBusy(true);
    setError(null);
    const r = await call(token, pin, action);
    setBusy(false);
    setConfirming(null);
    if (r.ok) {
      setOrder(r.order);
      setDone(action);
    } else setError(errorText(r));
  }

  // ---------- PIN pad ----------
  if (!order) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col px-5 py-10">
        <div className="flex items-center gap-2 text-ink-soft"><Lock className="size-5" /><span>تسليم طلب</span></div>
        <h1 className="mt-3 font-display text-3xl font-extrabold">ادخل رمز المندوب</h1>
        <p className="mt-1 text-ink-soft">4 أرقام من التاجر.</p>

        <div className="mt-8 flex justify-center gap-3" dir="ltr" aria-live="polite" aria-label={`أدخلت ${pin.length} من 4`}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`grid size-14 place-items-center rounded-lg border-2 font-display text-3xl ${i < pin.length ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>
              {i < pin.length ? "•" : ""}
            </span>
          ))}
        </div>
        {error && <p role="alert" className="mt-4 rounded-md bg-risk-bg px-3 py-2 text-center text-risk">{error}</p>}

        <div className="mt-8 grid grid-cols-3 gap-3" dir="ltr">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
            k === "" ? <span key={i} /> : (
              <button key={i} disabled={busy} aria-label={k === "⌫" ? "مسح" : k}
                onClick={() => setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 4 ? p + k : p))}
                className="h-16 rounded-xl bg-white font-display text-2xl font-semibold shadow-sm active:bg-line disabled:opacity-50">
                {k}
              </button>
            ),
          )}
        </div>
      </main>
    );
  }

  // ---------- Order + actions ----------
  const prepaid = order.payment_method !== "COD" && order.payment_status === "verified";
  const final = order.order_status === "delivered" || order.order_status === "returned";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <p className="text-sm text-ink-soft">{order.merchant_name} · <span className="ltr-nums">{order.tracking_code}</span></p>
      <h1 className="mt-1 font-display text-3xl font-extrabold">{order.customer_name}</h1>

      <div className="mt-4 space-y-3 rounded-xl border border-line bg-white p-4">
        <p className="flex items-start gap-2"><MapPin className="mt-1 size-5 shrink-0 text-carbon" />
          <span><span className="font-display text-xl font-extrabold">{order.city}</span><span className="block text-ink-soft">{order.address_details}</span></span>
        </p>
        {[order.phone_primary, order.phone_secondary].filter(Boolean).map((p) => (
          <a key={p} href={`tel:${p}`} className="flex items-center gap-2 rounded-lg bg-mist px-3 py-2.5 font-display text-lg font-semibold">
            <Phone className="size-5 text-carbon" /><span className="ltr-nums">{p}</span><span className="ms-auto text-sm font-normal text-carbon">اتصل</span>
          </a>
        ))}
        <ul className="border-t border-line pt-3 text-sm">
          {order.items.map((i, idx) => <li key={idx}>{i.quantity}× {i.name}</li>)}
        </ul>
      </div>

      <div className={`mt-4 rounded-xl p-4 text-center ${prepaid ? "bg-ok-bg text-ok" : "bg-ink text-white"}`}>
        <p className="text-sm opacity-80">{prepaid ? "الطلب" : "حصّل من الزبون"}</p>
        <p className="font-display text-4xl font-extrabold">{prepaid ? "مدفوع مسبقاً" : <span className="ltr-nums">{Number(order.total_lyd).toLocaleString("en-US", { maximumFractionDigits: 3 })} د.ل</span>}</p>
      </div>

      {error && <p role="alert" className="mt-4 rounded-md bg-risk-bg px-3 py-2 text-center text-risk">{error}</p>}

      {final ? (
        <div className={`mt-6 rounded-xl p-5 text-center font-display text-2xl font-extrabold ${order.order_status === "delivered" ? "bg-ok-bg text-ok" : "bg-risk-bg text-risk"}`}>
          {order.order_status === "delivered" ? "✅ تم التسليم" : "↩️ تم تسجيله مرتجع"}
          {done && <p className="mt-1 font-sans text-sm font-normal">وصل التحديث للتاجر.</p>}
        </div>
      ) : confirming ? (
        <div className="mt-6 rounded-xl border-2 border-ink bg-white p-4" role="alertdialog" aria-labelledby="confirm-q">
          <p id="confirm-q" className="text-center font-display text-lg font-semibold">
            {confirming === "delivered" ? "متأكد إنك سلّمت الطلب واستلمت المبلغ؟" : "متأكد إن الطلب مرتجع؟"}
          </p>
          <p className="mt-1 text-center text-sm text-ink-soft">ما تقدرش ترجع فيها.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button disabled={busy} onClick={() => act(confirming)} className={`rounded-lg py-3 font-display text-lg font-extrabold text-white ${confirming === "delivered" ? "bg-ok" : "bg-risk"}`}>
              {busy ? "…" : "نعم، أكّد"}
            </button>
            <button disabled={busy} onClick={() => setConfirming(null)} className="rounded-lg border border-line py-3 font-medium">رجوع</button>
          </div>
        </div>
      ) : (
        <div className="mt-auto space-y-3 pt-6">
          <button onClick={() => setConfirming("delivered")} className="flex h-20 w-full items-center justify-center gap-3 rounded-xl bg-ok font-display text-xl font-extrabold text-white active:opacity-90">
            <CircleCheck className="size-7" /> تم التسليم وتحصيل المبلغ
          </button>
          <button onClick={() => setConfirming("returned")} className="flex h-16 w-full items-center justify-center gap-3 rounded-xl border-2 border-risk bg-white font-display text-lg font-extrabold text-risk active:bg-risk-bg">
            <Undo2 className="size-6" /> مرتجع / تعذّر التسليم
          </button>
        </div>
      )}
    </main>
  );
}
