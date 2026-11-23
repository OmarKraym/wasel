import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { hashPhone } from "@/lib/phone";
import { computeRisk } from "@/lib/reputation";
import { HttpError } from "@/lib/api";
import { computeMissing, type DraftFields, type PaymentMethod } from "@/lib/orders/draft";
import type { Order } from "@/lib/types";

export interface DraftPatch {
  customer_name?: string | null;
  phone_primary?: string | null;
  phone_secondary?: string | null;
  city?: string | null;
  address_details?: string | null;
  items?: Array<{ product_id: string; quantity: number }>;
  payment_method?: PaymentMethod;
  payment_status?: "unpaid" | "pending_verification" | "verified";
  notes?: string | null;
}

/** Look up shared reputation for a phone, returning the columns we cache on the order. */
export async function reputationFor(phone: string | null) {
  if (!phone) return { phone_hash: null, risk_level: "unknown" as const, risk_delivered: 0, risk_returned: 0 };
  const phone_hash = hashPhone(phone, serverEnv.phoneHashPepper());
  const { data } = await createAdminClient()
    .from("phone_reputation")
    .select("delivered_count, returned_count")
    .eq("phone_hash", phone_hash)
    .maybeSingle();
  return {
    phone_hash,
    risk_level: computeRisk(data),
    risk_delivered: data?.delivered_count ?? 0,
    risk_returned: data?.returned_count ?? 0,
  };
}

/** Merchant edits a draft. Edited fields get locked so the AI won't overwrite them. */
export async function updateDraft(merchantId: string, orderId: string, patch: DraftPatch): Promise<Order> {
  const db = createAdminClient();
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .maybeSingle<Order>();
  if (!order) throw new HttpError(404, "الطلب غير موجود", "NOT_FOUND");
  if (order.order_status !== "draft") throw new HttpError(409, "لا يمكن تعديل طلب مؤكد", "NOT_DRAFT");

  if (patch.items) {
    const ids = [...new Set(patch.items.map((i) => i.product_id))];
    if (ids.length) {
      const { count } = await db
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .in("id", ids);
      if (count !== ids.length) throw new HttpError(400, "منتج غير موجود في الكتالوج", "BAD_PRODUCT");
    }
  }

  const update: Record<string, unknown> = {};
  const locked = new Set(order.locked_fields);
  const touch = (field: string, value: unknown, lockAs = field) => {
    update[field] = value;
    locked.add(lockAs);
  };
  if (patch.customer_name !== undefined) touch("customer_name", patch.customer_name);
  if (patch.phone_primary !== undefined) touch("phone_primary", patch.phone_primary);
  if (patch.phone_secondary !== undefined) touch("phone_secondary", patch.phone_secondary);
  if (patch.city !== undefined) touch("city", patch.city);
  if (patch.address_details !== undefined) touch("address_details", patch.address_details);
  if (patch.items !== undefined) touch("items_json", patch.items, "items");
  if (patch.payment_method !== undefined) touch("payment_method", patch.payment_method);
  if (patch.payment_status !== undefined) update.payment_status = patch.payment_status;
  if (patch.notes !== undefined) update.notes = patch.notes;

  if (patch.phone_primary !== undefined) Object.assign(update, await reputationFor(patch.phone_primary));

  const next: DraftFields = {
    customer_name: patch.customer_name !== undefined ? patch.customer_name : order.customer_name,
    phone_primary: patch.phone_primary !== undefined ? patch.phone_primary : order.phone_primary,
    phone_secondary: patch.phone_secondary !== undefined ? patch.phone_secondary : order.phone_secondary,
    city: patch.city !== undefined ? patch.city : order.city,
    address_details: patch.address_details !== undefined ? patch.address_details : order.address_details,
    items: patch.items ?? order.items_json.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    payment_method: patch.payment_method ?? order.payment_method,
  };
  update.missing_fields = computeMissing(next);
  update.locked_fields = [...locked];

  const { data: saved, error } = await db
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .eq("merchant_id", merchantId)
    .eq("order_status", "draft")
    .select("*")
    .single<Order>();
  if (error || !saved) throw error ?? new HttpError(409, "تغيّر الطلب، حدّث الصفحة", "CONFLICT");

  if (saved.conversation_id) {
    await db
      .from("conversations")
      .update({ status: saved.risk_level === "high" ? "flagged" : "pending_review" })
      .eq("id", saved.conversation_id)
      .eq("merchant_id", merchantId);
  }
  return saved;
}

const CONFIRM_ERRORS: Record<string, [number, string]> = {
  ORDER_NOT_FOUND: [404, "الطلب غير موجود"],
  ORDER_NOT_DRAFT: [409, "الطلب مؤكد من قبل"],
  MISSING_FIELDS: [422, "كمّل الاسم والهاتف والمدينة والمنتجات قبل التأكيد"],
  PAYMENT_NOT_VERIFIED: [422, "أكّد استلام الدفع الإلكتروني أولاً"],
};

export async function confirmOrder(merchantId: string, orderId: string): Promise<Order> {
  const { data, error } = await createAdminClient()
    .rpc("confirm_order", { p_order_id: orderId, p_merchant_id: merchantId })
    .single<Order>();
  if (error) {
    const code = error.message ?? "";
    if (code.startsWith("INSUFFICIENT_STOCK:")) {
      throw new HttpError(409, `المخزون لا يكفي: ${code.split(":")[1] ?? ""}`, "INSUFFICIENT_STOCK");
    }
    const known = CONFIRM_ERRORS[code];
    if (known) throw new HttpError(known[0], known[1], code);
    throw error;
  }
  return data;
}
