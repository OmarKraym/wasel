/**
 * Shipping exporters (Adapter pattern).
 * Each courier gets an adapter that maps our order to its column layout.
 * Add a new courier by adding one object to EXPORTERS — nothing else changes.
 */

export interface ExportItem {
  name?: string;
  quantity: number;
}

export interface ExportOrder {
  id: string;
  tracking_code: string | null;
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  city: string | null;
  address_details: string | null;
  total_lyd: number | string;
  payment_method: string;
  payment_status: string;
  items_json: ExportItem[];
  notes: string | null;
}

export interface ExportColumn {
  header: string;
  width?: number;
  value: (o: ExportOrder) => string | number;
}

export interface ShippingExporter {
  id: string;
  label: string;
  columns: ExportColumn[];
}

/** Amount the courier must collect from the customer. */
export function codAmount(o: ExportOrder): number {
  const prepaid = o.payment_method !== "COD" && o.payment_status === "verified";
  return prepaid ? 0 : Math.round(Number(o.total_lyd) * 1000) / 1000;
}

export function itemsSummary(o: ExportOrder): string {
  return (o.items_json ?? []).map((i) => `${i.quantity}× ${i.name ?? "منتج"}`).join("، ");
}

function notesFor(o: ExportOrder): string {
  return [o.tracking_code, itemsSummary(o), o.notes].filter(Boolean).join(" | ");
}

/** Vanex-compatible bulk upload layout. */
export const vanexExporter: ShippingExporter = {
  id: "vanex",
  label: "Vanex (فانكس)",
  columns: [
    { header: "Recipient Name", width: 24, value: (o) => o.customer_name ?? "" },
    { header: "Phone 1", width: 14, value: (o) => o.phone_primary ?? "" },
    { header: "Phone 2", width: 14, value: (o) => o.phone_secondary ?? "" },
    { header: "City", width: 14, value: (o) => o.city ?? "" },
    { header: "Address", width: 40, value: (o) => o.address_details ?? "" },
    { header: "COD Amount", width: 12, value: (o) => codAmount(o) },
    { header: "Notes", width: 50, value: notesFor },
  ],
};

/** Generic Arabic sheet for couriers without a fixed template. */
export const genericArabicExporter: ShippingExporter = {
  id: "generic_ar",
  label: "قالب عام (عربي)",
  columns: [
    { header: "رقم التتبع", width: 18, value: (o) => o.tracking_code ?? "" },
    { header: "اسم المستلم", width: 24, value: (o) => o.customer_name ?? "" },
    { header: "هاتف 1", width: 14, value: (o) => o.phone_primary ?? "" },
    { header: "هاتف 2", width: 14, value: (o) => o.phone_secondary ?? "" },
    { header: "المدينة", width: 14, value: (o) => o.city ?? "" },
    { header: "العنوان", width: 40, value: (o) => o.address_details ?? "" },
    { header: "المبلغ المطلوب تحصيله (د.ل)", width: 16, value: (o) => codAmount(o) },
    { header: "المحتوى", width: 40, value: itemsSummary },
  ],
};

export const EXPORTERS: Record<string, ShippingExporter> = {
  [vanexExporter.id]: vanexExporter,
  [genericArabicExporter.id]: genericArabicExporter,
};

export function getExporter(id: string): ShippingExporter | null {
  return EXPORTERS[id] ?? null;
}

/** Block CSV/Excel formula injection (=, +, -, @, tab, CR at the start of a text cell). */
export function safeCell(value: string | number): string | number {
  if (typeof value === "number") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function toRows(exporter: ShippingExporter, orders: ExportOrder[]): Array<Array<string | number>> {
  return orders.map((o) => exporter.columns.map((c) => safeCell(c.value(o))));
}

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 CSV with BOM so Excel shows Arabic correctly. */
export function toCsv(exporter: ShippingExporter, orders: ExportOrder[]): string {
  const header = exporter.columns.map((c) => csvEscape(c.header)).join(",");
  const body = toRows(exporter, orders).map((r) => r.map(csvEscape).join(","));
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}
