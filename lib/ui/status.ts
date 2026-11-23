import type { Order } from "@/lib/types";
import { FIELD_LABELS_AR, type RequiredField } from "@/lib/orders/draft";

export type Badge = { tone: "green" | "yellow" | "red" | "neutral" | "done"; label: string };

/** Queue badge: 🔴 high return risk · 🟡 missing data · 🟢 ready for one-click confirm. */
export function badgeFor(order: Pick<Order, "order_status" | "risk_level" | "missing_fields"> | null | undefined): Badge {
  if (!order) return { tone: "neutral", label: "محادثة جديدة" };
  if (order.order_status !== "draft") {
    const labels: Record<string, string> = {
      confirmed: "مؤكد",
      shipped: "مع المندوب",
      delivered: "تم التسليم",
      returned: "مرتجع",
    };
    return { tone: "done", label: labels[order.order_status] ?? order.order_status };
  }
  if (order.risk_level === "high") return { tone: "red", label: "خطر إرجاع عالي" };
  if (order.missing_fields.length > 0) {
    const first = order.missing_fields
      .slice(0, 2)
      .map((f) => FIELD_LABELS_AR[f as RequiredField] ?? f)
      .join(" و");
    return { tone: "yellow", label: `ناقص: ${first}` };
  }
  return { tone: "green", label: "جاهز للتأكيد" };
}

export function formatLyd(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("ar-LY", { minimumFractionDigits: 0, maximumFractionDigits: 3 })} د.ل`;
}
