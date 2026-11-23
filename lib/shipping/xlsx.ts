import ExcelJS from "exceljs";
import { toRows, type ExportOrder, type ShippingExporter } from "@/lib/shipping/exporters";

/** XLSX workbook (right-to-left sheet). server only. */
export async function toXlsx(exporter: ShippingExporter, orders: ExportOrder[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet("Orders", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = exporter.columns.map((c) => ({ header: c.header, width: c.width ?? 16 }));
  ws.getRow(1).font = { bold: true };
  for (const row of toRows(exporter, orders)) ws.addRow(row);
  // phones must stay text so Excel keeps the leading 0
  exporter.columns.forEach((c, idx) => {
    if (/phone|هاتف/i.test(c.header)) ws.getColumn(idx + 1).numFmt = "@";
  });
  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
