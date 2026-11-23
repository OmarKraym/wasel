"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { EXPORTERS } from "@/lib/shipping/exporters";
import { formatLyd } from "@/lib/ui/status";
import { ShippingLabelModal } from "@/components/labels/ShippingLabelModal";
import type { Order } from "@/lib/types";

const STATUS: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "جاهز للشحن", cls: "bg-carbon-soft text-carbon" },
  shipped: { label: "مع المندوب", cls: "bg-warn-bg text-warn" },
  delivered: { label: "تم التسليم", cls: "bg-ok-bg text-ok" },
  returned: { label: "مرتجع", cls: "bg-risk-bg text-risk" },
};

type View = "to_ship" | "in_transit" | "done";

export function ShippingBoard({ orders, merchantName }: { orders: Order[]; merchantName: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("to_ship");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporter, setExporter] = useState("vanex");
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [markShipped, setMarkShipped] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<Order[] | null>(null);

  const visible = useMemo(
    () =>
      orders.filter((o) =>
        view === "to_ship" ? o.order_status === "confirmed" : view === "in_transit" ? o.order_status === "shipped" : ["delivered", "returned"].includes(o.order_status),
      ),
    [orders, view],
  );
  const chosen = visible.filter((o) => selected.has(o.id));
  const allChecked = visible.length > 0 && chosen.length === visible.length;
  const toCollect = chosen.reduce((s, o) => s + (o.payment_method !== "COD" && o.payment_status === "verified" ? 0 : Number(o.total_lyd)), 0);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function exportFile() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: chosen.map((o) => o.id), exporter, format, mark_shipped: markShipped && view === "to_ship" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "تعذّر التصدير");
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `orders.${format}`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<[View, string]> = [
    ["to_ship", "جاهز للشحن"],
    ["in_transit", "مع المندوب"],
    ["done", "مكتمل / مرتجع"],
  ];

  return (
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 sm:p-6">
      <h1 className="font-display text-2xl font-extrabold">الشحن</h1>
      <p className="mt-1 text-sm text-ink-soft">اختار الطلبات، صدّر ملف شركة التوصيل، واطبع الملصقات دفعة وحدة.</p>

      <div className="mt-5 flex gap-1 border-b border-line" role="tablist">
        {tabs.map(([id, text]) => (
          <button key={id} role="tab" aria-selected={view === id} onClick={() => { setView(id); setSelected(new Set()); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${view === id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {text}
          </button>
        ))}
      </div>

      {view !== "done" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3 text-sm">
          <span className="font-medium">
            محدد: <span className="ltr-nums">{chosen.length}</span>
            {chosen.length > 0 && <span className="text-ink-soft"> · التحصيل {formatLyd(toCollect)}</span>}
          </span>
          <label className="flex items-center gap-2">
            <span className="text-ink-soft">القالب</span>
            <select value={exporter} onChange={(e) => setExporter(e.target.value)} className="rounded border border-line px-2 py-1.5">
              {Object.values(EXPORTERS).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-soft">الصيغة</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")} className="rounded border border-line px-2 py-1.5">
              <option value="xlsx">Excel</option>
              <option value="csv">CSV</option>
            </select>
          </label>
          {view === "to_ship" && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={markShipped} onChange={(e) => setMarkShipped(e.target.checked)} className="size-4" />
              <span>حوّلها لـ«مع المندوب» بعد التصدير</span>
            </label>
          )}
          <div className="ms-auto flex gap-2">
            <button disabled={!chosen.length} onClick={() => setLabels(chosen)}
              className="flex items-center gap-1.5 rounded-md border border-ink px-3 py-2 font-medium disabled:opacity-40">
              <Printer className="size-4" /> طباعة الملصقات
            </button>
            <button disabled={!chosen.length || busy} onClick={exportFile}
              className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 font-medium text-white disabled:opacity-40">
              <Download className="size-4" /> {busy ? "جاري التصدير…" : "تصدير"}
            </button>
          </div>
          {error && <p role="alert" className="w-full text-risk">{error}</p>}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-mist text-start text-xs text-ink-soft">
            <tr>
              <th className="w-10 p-3">
                {view !== "done" && (
                  <input type="checkbox" aria-label="تحديد الكل" checked={allChecked}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(visible.map((o) => o.id)))} className="size-4" />
                )}
              </th>
              <th className="p-3 text-start font-medium">رقم التتبع</th>
              <th className="p-3 text-start font-medium">الزبون</th>
              <th className="p-3 text-start font-medium">المدينة</th>
              <th className="p-3 text-start font-medium">الهاتف</th>
              <th className="p-3 text-start font-medium">التحصيل</th>
              <th className="p-3 text-start font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted">ما فيش طلبات هنا.</td></tr>
            )}
            {visible.map((o) => {
              const prepaid = o.payment_method !== "COD" && o.payment_status === "verified";
              return (
                <tr key={o.id} className="border-b border-line/60 last:border-0 hover:bg-mist/60">
                  <td className="p-3">
                    {view !== "done" && (
                      <input type="checkbox" aria-label={`تحديد ${o.customer_name ?? ""}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="size-4" />
                    )}
                  </td>
                  <td className="ltr-nums p-3 text-start text-xs">{o.tracking_code}</td>
                  <td className="p-3 font-medium">{o.customer_name}</td>
                  <td className="p-3">{o.city}</td>
                  <td className="ltr-nums p-3 text-start">{o.phone_primary}</td>
                  <td className="p-3">{prepaid ? <span className="text-ok">مدفوع</span> : formatLyd(o.total_lyd)}</td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[o.order_status]?.cls ?? ""}`}>{STATUS[o.order_status]?.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {labels && <ShippingLabelModal orders={labels} merchantName={merchantName} onClose={() => setLabels(null)} />}
    </div>
  );
}
