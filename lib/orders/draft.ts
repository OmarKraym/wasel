/**
 * Pure helpers for merging AI output into a draft order.
 * Kept free of I/O so they are unit-tested (tests/draft.test.ts).
 */
import { normalizeLibyanPhone, toAsciiDigits } from "@/lib/phone";
import { resolveCity } from "@/lib/libya/cities";

export const ORDER_FIELDS = [
  "customer_name",
  "phone_primary",
  "phone_secondary",
  "city",
  "address_details",
  "items",
  "payment_method",
] as const;
export type OrderField = (typeof ORDER_FIELDS)[number];

export const REQUIRED_FIELDS = ["customer_name", "phone_primary", "city", "address_details", "items"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export const PAYMENT_METHODS = ["COD", "MobiCash", "Sadad", "YusrPay", "Tadawul"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface DraftItem {
  product_id: string;
  quantity: number;
}

export interface DraftFields {
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  city: string | null;
  address_details: string | null;
  items: DraftItem[];
  payment_method: PaymentMethod | null;
}

export interface CleanExtractionInput {
  customer_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  city: string | null;
  address_details: string | null;
  matched_items: DraftItem[];
  payment_method: PaymentMethod | null;
}

/** Find Libyan mobiles in raw customer text (regex safety net for the model). */
export function extractPhonesFromText(text: string): string[] {
  const ascii = toAsciiDigits(text);
  const found = new Set<string>();
  const re = /(?:\+|00)?(?:218[\s-]?)?0?9[1-6](?:[\s-]?\d){7}/g;
  for (const match of ascii.match(re) ?? []) {
    const n = normalizeLibyanPhone(match);
    if (n) found.add(n);
  }
  return [...found];
}

/**
 * Validate + normalise the model's raw answer against reality:
 * phones must be real Libyan mobiles, cities must be canonical,
 * products must exist in this merchant's catalogue.
 */
export function cleanExtraction(
  raw: CleanExtractionInput,
  ctx: { catalogIds: Set<string>; customerText: string },
): DraftFields {
  let phonePrimary = normalizeLibyanPhone(raw.phone_primary);
  let phoneSecondary = normalizeLibyanPhone(raw.phone_secondary);
  const textPhones = extractPhonesFromText(ctx.customerText);
  if (!phonePrimary && textPhones[0]) phonePrimary = textPhones[0];
  if (!phoneSecondary) phoneSecondary = textPhones.find((p) => p !== phonePrimary) ?? null;
  if (phoneSecondary === phonePrimary) phoneSecondary = null;

  const city = resolveCity(raw.city) ?? resolveCity(raw.address_details);

  const qtyById = new Map<string, number>();
  for (const item of raw.matched_items) {
    if (!ctx.catalogIds.has(item.product_id)) continue;
    const q = Math.min(Math.max(Math.round(item.quantity) || 1, 1), 99);
    qtyById.set(item.product_id, (qtyById.get(item.product_id) ?? 0) + q);
  }

  const clean = (s: string | null) => {
    const v = s?.trim();
    return v ? v.slice(0, 300) : null;
  };

  return {
    customer_name: clean(raw.customer_name),
    phone_primary: phonePrimary,
    phone_secondary: phoneSecondary,
    city,
    address_details: clean(raw.address_details),
    items: [...qtyById].map(([product_id, quantity]) => ({ product_id, quantity })),
    payment_method: raw.payment_method,
  };
}

/**
 * Merge new AI values into the existing draft.
 * - fields the merchant locked are never touched
 * - a known value is never replaced by "unknown" (null / empty list)
 */
export function mergeDraft(existing: DraftFields | null, incoming: DraftFields, locked: string[]): DraftFields {
  if (!existing) return incoming;
  const isLocked = (f: OrderField) => locked.includes(f);
  const pick = <K extends Exclude<OrderField, "items">>(f: K): DraftFields[K] =>
    isLocked(f) ? existing[f] : (incoming[f] ?? existing[f]);
  return {
    customer_name: pick("customer_name"),
    phone_primary: pick("phone_primary"),
    phone_secondary: pick("phone_secondary"),
    city: pick("city"),
    address_details: pick("address_details"),
    payment_method: pick("payment_method"),
    items: isLocked("items") || incoming.items.length === 0 ? existing.items : incoming.items,
  };
}

/** Deterministic missing-field list (we do not trust the model for this). */
export function computeMissing(d: DraftFields): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!d.customer_name) missing.push("customer_name");
  if (!d.phone_primary) missing.push("phone_primary");
  if (!d.city) missing.push("city");
  if (!d.address_details) missing.push("address_details");
  if (d.items.length === 0) missing.push("items");
  return missing;
}

export const FIELD_LABELS_AR: Record<RequiredField, string> = {
  customer_name: "اسم الزبون",
  phone_primary: "رقم الهاتف",
  city: "المدينة",
  address_details: "العنوان",
  items: "المنتجات",
};
