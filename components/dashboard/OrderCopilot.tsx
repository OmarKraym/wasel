"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Minus, Plus, Printer, RefreshCw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/ui/api";
import { formatLyd } from "@/lib/ui/status";
import { LIBYAN_CITIES } from "@/lib/libya/cities";
import { FIELD_LABELS_AR, PAYMENT_METHODS, type PaymentMethod, type RequiredField } from "@/lib/orders/draft";
import type { Conversation, Order, Product } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  COD: "عند الاستلام",
  MobiCash: "موبي كاش",
  Sadad: "سداد",
  YusrPay: "يسر باي",
  Tadawul: "تداول",
};

const STATUS_STAMP: Record<Order["order_status"], { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "border-carbon text-carbon" },
  confirmed: { label: "مؤكد", cls: "border-ok text-ok" },
  shipped: { label: "مع المندوب", cls: "border-ink text-ink" },
  delivered: { label: "تم التسليم", cls: "border-ok text-ok" },
  returned: { label: "مرتجع", cls: "border-risk text-risk" },
};

type TextField = "customer_name" | "phone_primary" | "phone_secondary" | "address_details";
type Form = Record<TextField, string> & { city: string };

function formFrom(o: Order | null): Form {
  return {
    customer_name: o?.customer_name ?? "",
    phone_primary: o?.phone_primary ?? "",
    phone_secondary: o?.phone_secondary ?? "",
    address_details: o?.address_details ?? "",
    city: o?.city ?? "",
  };
}

export function OrderCopilot(props: {
  conversation: Conversation;
  order: Order | null;
  products: Product[];
  rates: Record<string, number>;
  onOrder: (o: Order) => void;
  onConfirmed: () => void;
  onPrint: (o: Order) => void;
}) {
  const { order, products, rates } = props;
  const [form, setForm] = useState<Form>(() => formFrom(order));
  const dirty = useRef(new Set<keyof Form>());
  const [busy, setBusy] = useState<null | "save" | "confirm" | "extract" | "create">(null);
  const [error, setError] = useState<string | null>(null);
  const [addId, setAddId] = useState("");

  // Pull in AI / realtime updates without clobbering a field the merchant is typing in.
  useEffect(() => {
    const next = formFrom(order);
    setForm((cur) => {
      const merged = { ...next };
      for (const k of dirty.current) merged[k] = cur[k];
      return merged;
    });
  }, [order]);

  async function patch(body: Record<string, unknown>) {
    if (!order) return;
    setBusy("save");
    setError(null);
    try {
      const { order: saved } = await api<{ order: Order }>(`/api/orders/${order.id}`, body, "PATCH");
      props.onOrder(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveField(field: keyof Form) {
    if (!order || !dirty.current.has(field)) return;
    dirty.current.delete(field);
    const value = form[field].trim();
    if ((order[field] ?? "") === value) return;
    await patch({ [field]: value || null });
  }

  function edit(field: keyof Form, value: string) {
    dirty.current.add(field);
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setItems(items: Array<{ product_id: string; quantity: number }>) {
    void patch({ items });
  }

  async function confirm() {
    if (!order) return;
    setBusy("confirm");
    setError(null);
    try {
      const { order: saved } = await api<{ order: Order }>(`/api/orders/${order.id}/confirm`);
      props.onOrder(saved);
      props.onConfirmed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runExtract() {
    setBusy("extract");
    setError(null);
    try {
      await api(`/api/conversations/${props.conversation.id}/extract`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function createManual() {
    setBusy("create");
    setError(null);
    try {
      const { order: created } = await api<{ order: Order }>("/api/orders", { conversation_id: props.conversation.id });
      props.onOrder(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!order) {
    return (
      <div className="p-5">
        <div className="rounded-lg border border-dashed border-line bg-panel p-6 text-center">
          <p className="font-display text-lg font-semibold">ما فيش طلب في هذه المحادثة</p>
          <p className="mt-1 text-sm text-ink-soft">الذكاء الاصطناعي ما لقاش طلب واضح. حلّل من جديد أو افتح طلب يدوي.</p>
          {error && <p role="alert" className="mt-3 text-sm text-risk">{error}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={runExtract} disabled={!!busy} className="flex items-center justify-center gap-2 rounded-md bg-ink py-2.5 text-sm font-medium text-white disabled:opacity-50">
              <Sparkles className="size-4" /> {busy === "extract" ? "جاري التحليل…" : "حلّل المحادثة"}
            </button>
            <button onClick={createManual} disabled={!!busy} className="rounded-md border border-line py-2.5 text-sm font-medium hover:border-ink disabled:opacity-50">
              إنشاء طلب يدوي
            </button>
          </div>
        </div>
      </div>
    );
  }

  const editable = order.order_status === "draft";
  const stamp = STATUS_STAMP[order.order_status];
  const prepaid = order.payment_method !== "COD" && order.payment_status === "verified";
  const collect = prepaid ? 0 : Number(order.total_lyd);
  const missing = order.missing_fields as RequiredField[];
  const paymentBlocks = order.payment_method !== "COD" && order.payment_status !== "verified";
  const canConfirm = editable && missing.length === 0 && !paymentBlocks && busy === null;
  const usedIds = new Set(order.items_json.map((i) => i.product_id));
  const stockOf = (id: string) => products.find((p) => p.id === id)?.stock_quantity;

  const input = "w-full rounded border border-line bg-white/80 px-2.5 py-2 focus:border-carbon focus:bg-white focus:outline-none disabled:border-transparent disabled:bg-transparent disabled:px-0";
  const label = "mb-1 block text-xs font-medium text-ink-soft";

  return (
    <div className="space-y-4 p-4 pb-10">
      <RiskBanner order={order} />

      <article className="waybill rounded-t-lg border border-b-0 border-carbon/25 px-4 pb-6 pt-4 shadow-[0_1px_0_rgba(45,79,163,0.15)]">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-extrabold tracking-tight text-carbon">بوليصة الطلب</h2>
            <p className="ltr-nums mt-0.5 text-start text-xs text-muted">{order.tracking_code ?? "بدون رقم تتبع بعد"}</p>
          </div>
          <div className="flex items-center gap-2">
            {editable && (
              <button onClick={runExtract} disabled={!!busy} title="أعد التحليل بالذكاء الاصطناعي" aria-label="أعد التحليل"
                className="rounded p-1.5 text-carbon hover:bg-carbon-soft disabled:opacity-40">
                <RefreshCw className={`size-4 ${busy === "extract" ? "animate-spin" : ""}`} />
              </button>
            )}
            <span className={`-rotate-6 rounded border-2 px-2 py-0.5 font-display text-sm font-extrabold ${stamp.cls}`}>{stamp.label}</span>
          </div>
        </header>

        {editable && missing.length > 0 && (
          <p className="mb-4 rounded bg-warn-bg px-3 py-2 text-sm text-warn">
            ناقص: {missing.map((f) => FIELD_LABELS_AR[f] ?? f).join("، ")}
          </p>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          <label className="col-span-2">
            <span className={label}>اسم الزبون</span>
            <input className={input} disabled={!editable} value={form.customer_name}
              onChange={(e) => edit("customer_name", e.target.value)} onBlur={() => saveField("customer_name")} />
          </label>
          <label>
            <span className={label}>الهاتف</span>
            <input className={`${input} ltr-nums text-left`} inputMode="tel" disabled={!editable} value={form.phone_primary}
              placeholder="09XXXXXXXX" onChange={(e) => edit("phone_primary", e.target.value)} onBlur={() => saveField("phone_primary")} />
          </label>
          <label>
            <span className={label}>هاتف ثاني</span>
            <input className={`${input} ltr-nums text-left`} inputMode="tel" disabled={!editable} value={form.phone_secondary}
              onChange={(e) => edit("phone_secondary", e.target.value)} onBlur={() => saveField("phone_secondary")} />
          </label>
          <label className="col-span-2">
            <span className={label}>المدينة</span>
            <select className={input} disabled={!editable} value={form.city}
              onChange={(e) => {
                setForm((f) => ({ ...f, city: e.target.value }));
                void patch({ city: e.target.value || null });
              }}>
              <option value="">اختر المدينة</option>
              {LIBYAN_CITIES.map((c) => {
                const fee = rates[c.name] ?? rates._default;
                return (
                  <option key={c.name} value={c.name}>
                    {c.name}{fee !== undefined ? ` — توصيل ${fee} د.ل` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="col-span-2">
            <span className={label}>العنوان وأقرب معلم</span>
            <textarea rows={2} className={`${input} resize-none`} disabled={!editable} value={form.address_details}
              onChange={(e) => edit("address_details", e.target.value)} onBlur={() => saveField("address_details")} />
          </label>
        </div>

        {/* line items */}
        <section className="mt-5" aria-label="المنتجات">
          <h3 className={label}>المنتجات</h3>
          <ul className="divide-y divide-carbon/15 border-y border-carbon/15">
            {order.items_json.length === 0 && <li className="py-3 text-sm text-muted">ما فيش منتجات بعد.</li>}
            {order.items_json.map((item) => {
              const stock = stockOf(item.product_id);
              const low = stock !== undefined && editable && item.quantity > stock;
              return (
                <li key={item.product_id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name ?? "منتج"}</p>
                    <p className={`text-xs ${low ? "text-risk" : "text-muted"}`}>
                      {formatLyd(item.unit_price_lyd)} · المخزون {stock ?? "؟"}{low ? " — لا يكفي" : ""}
                    </p>
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-1">
                      <button aria-label="إنقاص" className="rounded border border-line p-1 hover:border-ink" disabled={!!busy}
                        onClick={() => setItems(order.items_json.map((i) => ({ product_id: i.product_id, quantity: i.product_id === item.product_id ? Math.max(1, i.quantity - 1) : i.quantity })))}>
                        <Minus className="size-3.5" />
                      </button>
                      <span className="ltr-nums w-6 text-center font-display font-semibold">{item.quantity}</span>
                      <button aria-label="زيادة" className="rounded border border-line p-1 hover:border-ink" disabled={!!busy}
                        onClick={() => setItems(order.items_json.map((i) => ({ product_id: i.product_id, quantity: i.product_id === item.product_id ? Math.min(99, i.quantity + 1) : i.quantity })))}>
                        <Plus className="size-3.5" />
                      </button>
                      <button aria-label="حذف" className="ms-1 rounded p-1 text-muted hover:text-risk" disabled={!!busy}
                        onClick={() => setItems(order.items_json.filter((i) => i.product_id !== item.product_id).map((i) => ({ product_id: i.product_id, quantity: i.quantity })))}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="ltr-nums font-display font-semibold">×{item.quantity}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {editable && (
            <div className="mt-2 flex gap-2">
              <select aria-label="إضافة منتج" className={`${input} flex-1`} value={addId} onChange={(e) => setAddId(e.target.value)}>
                <option value="">إضافة منتج…</option>
                {products.filter((p) => !usedIds.has(p.id)).map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stock_quantity === 0}>
                    {p.name} — {p.price_lyd} د.ل{p.stock_quantity === 0 ? " (نفد)" : ""}
                  </option>
                ))}
              </select>
              <button disabled={!addId || !!busy} className="rounded border border-ink px-3 text-sm font-medium disabled:opacity-40"
                onClick={() => {
                  setItems([...order.items_json.map((i) => ({ product_id: i.product_id, quantity: i.quantity })), { product_id: addId, quantity: 1 }]);
                  setAddId("");
                }}>
                إضافة
              </button>
            </div>
          )}
        </section>

        {/* payment */}
        <section className="mt-5" aria-label="الدفع">
          <h3 className={label}>طريقة الدفع</h3>
          <div className="flex flex-wrap gap-1.5" role="radiogroup">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} role="radio" aria-checked={order.payment_method === m} disabled={!editable || !!busy}
                onClick={() => void patch({ payment_method: m })}
                className={`rounded-full border px-3 py-1 text-sm ${order.payment_method === m ? "border-ink bg-ink text-white" : "border-line bg-white/70 hover:border-ink"} disabled:cursor-default`}>
                {PAYMENT_LABELS[m]}
              </button>
            ))}
          </div>
          {order.payment_method !== "COD" && (
            <label className={`mt-3 flex items-center gap-3 rounded-md border px-3 py-2.5 ${order.payment_status === "verified" ? "border-ok/40 bg-ok-bg" : "border-warn/40 bg-warn-bg"}`}>
              <input type="checkbox" className="size-5 accent-[var(--color-ok)]" disabled={!editable || !!busy}
                checked={order.payment_status === "verified"}
                onChange={(e) => void patch({ payment_status: e.target.checked ? "verified" : "pending_verification" })} />
              <span className="text-sm">
                <span className="font-medium">{order.payment_status === "verified" ? "تم التحقق من التحويل" : "راجع صورة الإيصال في الدردشة ثم أكّد"}</span>
                {order.payment_status === "pending_verification" && <span className="block text-xs">الزبون بعت إثبات دفع</span>}
              </span>
            </label>
          )}
        </section>

        {/* totals */}
        <dl className="mt-5 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-ink-soft">المنتجات</dt><dd className="ltr-nums">{formatLyd(order.subtotal_lyd)}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-soft">التوصيل{order.city ? ` (${order.city})` : ""}</dt><dd className="ltr-nums">{formatLyd(order.shipping_fee_lyd)}</dd></div>
          <div className="flex items-end justify-between border-t-2 border-dashed border-carbon/40 pt-3">
            <dt className="font-medium">{prepaid ? "مدفوع مسبقاً" : "المطلوب تحصيله"}</dt>
            <dd className="ltr-nums font-display text-3xl font-extrabold text-ink">{formatLyd(collect)}</dd>
          </div>
        </dl>

        {order.ai_confidence !== null && editable && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="size-3.5" /> ثقة الذكاء الاصطناعي {Math.round(Number(order.ai_confidence) * 100)}٪ — الحقول اللي عدّلتها ما يغيّرهاش.
          </p>
        )}
      </article>

      {error && <p role="alert" className="rounded-md bg-risk-bg px-3 py-2 text-sm text-risk">{error}</p>}

      {editable ? (
        <div className="space-y-2 pt-2">
          <button onClick={confirm} disabled={!canConfirm}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-saffron py-3.5 font-display text-lg font-extrabold text-ink transition-colors hover:bg-saffron-deep hover:text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-muted">
            <BadgeCheck className="size-5" />
            {busy === "confirm" ? "جاري التأكيد…" : "تأكيد الطلب"}
          </button>
          {!canConfirm && busy === null && (
            <p className="text-center text-xs text-muted">
              {paymentBlocks ? "أكّد استلام التحويل أولاً." : missing.length ? "كمّل البيانات الناقصة باش يتفعّل الزر." : ""}
            </p>
          )}
          {busy === "save" && <p className="text-center text-xs text-muted" aria-live="polite">جاري الحفظ…</p>}
        </div>
      ) : (
        <div className="space-y-2 pt-2">
          <p className="text-center text-sm text-ok">الطلب مؤكد وخصمنا الكمية من المخزون.</p>
          <button onClick={() => props.onPrint(order)}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-ink py-3 font-display font-semibold hover:bg-ink hover:text-white">
            <Printer className="size-5" aria-hidden /> طباعة ملصق شحن QR
          </button>
        </div>
      )}
    </div>
  );
}

function RiskBanner({ order }: { order: Order }) {
  const total = order.risk_delivered + order.risk_returned;
  if (order.risk_level === "high") {
    return (
      <div role="alert" className="flex gap-3 rounded-md border border-risk/30 bg-risk-bg p-3 text-risk">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <div className="text-sm">
          <p className="font-display font-extrabold">انتبه: هذا الرقم يرجّع الطلبات</p>
          <p className="mt-0.5">
            رجّع <span className="ltr-nums font-bold">{order.risk_returned}</span> من <span className="ltr-nums">{total}</span> طلبات
            عند المتاجر. اطلب عربون أو دفع إلكتروني قبل الشحن.
          </p>
        </div>
      </div>
    );
  }
  if (order.risk_level === "medium") {
    return (
      <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
        الرقم عنده <span className="ltr-nums font-bold">{order.risk_returned}</span> مرتجع سابق من <span className="ltr-nums">{total}</span> طلبات. اتصل بيه قبل الشحن.
      </p>
    );
  }
  if (order.risk_level === "low") {
    return (
      <p className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">
        زبون موثوق: استلم <span className="ltr-nums font-bold">{order.risk_delivered}</span> طلبات قبل بدون مرتجع.
      </p>
    );
  }
  return null;
}
