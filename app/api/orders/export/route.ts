import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, parseJson, requireMerchant, HttpError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXPORTERS, getExporter, toCsv, type ExportOrder } from "@/lib/shipping/exporters";
import { toXlsx } from "@/lib/shipping/xlsx";

export const runtime = "nodejs";

const Body = z.object({
  order_ids: z.array(z.uuid()).min(1).max(500),
  exporter: z.enum(Object.keys(EXPORTERS) as [string, ...string[]]),
  format: z.enum(["csv", "xlsx"]),
  mark_shipped: z.boolean().default(false),
});

/** Bulk courier export (CSV/XLSX). Optionally moves confirmed orders to "shipped". */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const body = await parseJson(req, Body);
  const exporter = getExporter(body.exporter)!;
  const db = createAdminClient();

  const { data, error } = await db
    .from("orders")
    .select("id, tracking_code, customer_name, phone_primary, phone_secondary, city, address_details, total_lyd, payment_method, payment_status, items_json, notes")
    .eq("merchant_id", merchantId)
    .in("id", body.order_ids)
    .in("order_status", ["confirmed", "shipped"])
    .order("confirmed_at", { ascending: true });
  if (error) throw error;
  const orders = (data ?? []) as ExportOrder[];
  if (orders.length === 0) throw new HttpError(404, "لا توجد طلبات مؤكدة للتصدير");

  if (body.mark_shipped) {
    const { error: shipErr } = await db.rpc("mark_orders_shipped", {
      p_order_ids: orders.map((o) => o.id),
      p_merchant_id: merchantId,
    });
    if (shipErr) throw shipErr;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${exporter.id}-${stamp}.${body.format}`;
  const payload = body.format === "csv" ? toCsv(exporter, orders) : await toXlsx(exporter, orders);
  return new Response(payload as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        body.format === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
