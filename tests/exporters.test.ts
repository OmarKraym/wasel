import { describe, expect, it } from "vitest";
import { codAmount, safeCell, toCsv, vanexExporter, type ExportOrder } from "@/lib/shipping/exporters";
import { toXlsx } from "@/lib/shipping/xlsx";

const order: ExportOrder = {
  id: "o1",
  tracking_code: "WS-261123-ABC123",
  customer_name: "=HYPERLINK(\"x\")",
  phone_primary: "0912345678",
  phone_secondary: null,
  city: "طرابلس",
  address_details: "قرقارش، قدام الصيدلية, الدور 2",
  total_lyd: "145.000",
  payment_method: "COD",
  payment_status: "unpaid",
  items_json: [{ name: "فستان أسود", quantity: 2 }],
  notes: null,
};

describe("exporters", () => {
  it("collects nothing when prepaid & verified", () => {
    expect(codAmount(order)).toBe(145);
    expect(codAmount({ ...order, payment_method: "MobiCash", payment_status: "verified" })).toBe(0);
    expect(codAmount({ ...order, payment_method: "MobiCash", payment_status: "pending_verification" })).toBe(145);
  });
  it("blocks formula injection", () => {
    expect(safeCell("=1+1")).toBe("'=1+1");
    expect(safeCell(5)).toBe(5);
  });
  it("writes Vanex CSV with BOM and quoting", () => {
    const csv = toCsv(vanexExporter, [order]);
    expect(csv.startsWith("﻿Recipient Name,Phone 1,Phone 2,City,Address,COD Amount,Notes")).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain("\"قرقارش، قدام الصيدلية, الدور 2\"");
    expect(csv).toContain(",145,");
  });
  it("writes a valid xlsx (zip) file", async () => {
    const bytes = await toXlsx(vanexExporter, [order]);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
