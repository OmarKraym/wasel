"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Printer, X } from "lucide-react";
import type { Order } from "@/lib/types";

type Layout = "thermal" | "a4";

export function scanUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/scan/${token}`;
}

function amountLine(o: Order): { label: string; value: string; prepaid: boolean } {
  const prepaid = o.payment_method !== "COD" && o.payment_status === "verified";
  return prepaid
    ? { label: "الدفع", value: "مدفوع مسبقاً", prepaid }
    : { label: "المطلوب تحصيله", value: `${Number(o.total_lyd).toLocaleString("en-US", { maximumFractionDigits: 3 })} د.ل`, prepaid };
}

/** One label. Pure black on white, large type: survives cheap thermal printers. */
function Label({ order, merchantName, compact }: { order: Order; merchantName: string; compact?: boolean }) {
  const amount = amountLine(order);
  const pieces = order.items_json.reduce((n, i) => n + i.quantity, 0);
  return (
    <div dir="rtl" className="flex h-full flex-col bg-white p-[5mm] text-black" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="flex items-center justify-between border-b-2 border-black pb-[2mm]">
        <span className="font-display text-[13pt] font-extrabold">{merchantName || "المتجر"}</span>
        <span className="text-[9pt]" style={{ direction: "ltr" }}>{order.tracking_code}</span>
      </div>

      <div className="mt-[3mm] flex-1 space-y-[1.5mm]">
        <p className="text-[9pt]">إلى:</p>
        <p className="font-display text-[16pt] font-extrabold leading-tight">{order.customer_name}</p>
        <p className="font-display text-[20pt] font-extrabold leading-tight">{order.city}</p>
        <p className="text-[11pt] leading-snug">{order.address_details}</p>
        <p className="text-[13pt] font-bold" style={{ direction: "ltr", textAlign: "right" }}>
          {order.phone_primary}
          {order.phone_secondary ? ` / ${order.phone_secondary}` : ""}
        </p>
        <p className="text-[9pt]">عدد القطع: {pieces}</p>
      </div>

      <div className="mt-[2mm] flex items-end justify-between gap-[3mm] border-t-2 border-black pt-[3mm]">
        <div>
          <p className="text-[9pt]">{amount.label}</p>
          <p className={`font-display font-extrabold ${amount.prepaid ? "text-[15pt]" : "text-[22pt]"}`}>{amount.value}</p>
        </div>
        <div className="text-center">
          <QRCodeSVG value={scanUrl(order.qr_token)} level="M" marginSize={0} style={{ width: compact ? "26mm" : "34mm", height: compact ? "26mm" : "34mm" }} />
          <p className="mt-[1mm] text-[7pt]">امسح للتسليم</p>
        </div>
      </div>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function Sheets({ orders, merchantName, layout }: { orders: Order[]; merchantName: string; layout: Layout }) {
  if (layout === "thermal") {
    return (
      <>
        {orders.map((o) => (
          <div key={o.id} className="label-thermal">
            <Label order={o} merchantName={merchantName} />
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      {chunk(orders, 4).map((group, idx) => (
        <div key={idx} className="sheet-a4">
          {group.map((o) => (
            <div key={o.id} className="label-a4">
              <Label order={o} merchantName={merchantName} compact />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * Client-side QR shipping labels: thermal 10×15 cm (one per page)
 * or A4 with 4 labels. Zero server cost — the browser prints.
 */
export function ShippingLabelModal({ orders, merchantName, onClose }: { orders: Order[]; merchantName: string; onClose: () => void }) {
  const [layout, setLayout] = useState<Layout>(orders.length > 1 ? "a4" : "thermal");
  const [mounted, setMounted] = useState(false);
  const printable = orders.filter((o) => o.order_status !== "draft");

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pageCss =
    layout === "thermal" ? "@page { size: 100mm 150mm; margin: 0; }" : "@page { size: A4; margin: 0; }";

  return (
    <>
      <div role="dialog" aria-modal="true" aria-labelledby="label-title" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4">
        <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-panel">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id="label-title" className="font-display text-lg font-semibold">
              ملصق الشحن {printable.length > 1 ? `(${printable.length})` : ""}
            </h2>
            <button onClick={onClose} aria-label="إغلاق" className="rounded p-1.5 hover:bg-mist">
              <X className="size-5" />
            </button>
          </header>

          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-sm" role="radiogroup" aria-label="حجم الطباعة">
            {([
              ["thermal", "طابعة حرارية 10×15 سم"],
              ["a4", "ورقة A4 (4 ملصقات)"],
            ] as const).map(([id, text]) => (
              <button key={id} role="radio" aria-checked={layout === id} onClick={() => setLayout(id)}
                className={`rounded-full border px-3 py-1 ${layout === id ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
                {text}
              </button>
            ))}
            <button onClick={() => window.print()} disabled={!printable.length}
              className="ms-auto flex items-center gap-2 rounded-md bg-ink px-4 py-2 font-medium text-white disabled:opacity-40">
              <Printer className="size-4" /> اطبع
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-mist p-5">
            {printable.length === 0 ? (
              <p className="text-center text-sm text-muted">أكّد الطلب أولاً باش تطبع الملصق.</p>
            ) : (
              <div className="mx-auto w-fit space-y-4 [&>*]:bg-white [&>*]:shadow-md">
                <Sheets orders={printable} merchantName={merchantName} layout={layout} />
              </div>
            )}
          </div>
        </div>
      </div>

      {mounted &&
        createPortal(
          <div className="print-root">
            <style>{pageCss}</style>
            <Sheets orders={printable} merchantName={merchantName} layout={layout} />
          </div>,
          document.body,
        )}
    </>
  );
}
