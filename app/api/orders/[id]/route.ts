import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, json, parseJson, requireMerchant, HttpError } from "@/lib/api";
import { updateDraft } from "@/lib/orders/service";
import { normalizeLibyanPhone } from "@/lib/phone";
import { CITY_NAMES } from "@/lib/libya/cities";
import { PAYMENT_METHODS } from "@/lib/orders/draft";

export const runtime = "nodejs";

const text = (max: number) => z.string().trim().max(max).nullable().transform((v) => (v ? v : null));
const phone = z
  .string()
  .nullable()
  .transform((v, ctx) => {
    if (!v || !v.trim()) return null;
    const n = normalizeLibyanPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "رقم ليبي غير صالح" });
      return z.NEVER;
    }
    return n;
  });

const Patch = z
  .object({
    customer_name: text(120),
    phone_primary: phone,
    phone_secondary: phone,
    city: z.enum(CITY_NAMES as [string, ...string[]]).nullable(),
    address_details: text(300),
    items: z.array(z.object({ product_id: z.uuid(), quantity: z.number().int().min(1).max(99) })).max(30),
    payment_method: z.enum(PAYMENT_METHODS),
    payment_status: z.enum(["unpaid", "pending_verification", "verified"]),
    notes: text(500),
  })
  .partial()
  .strict();

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, "معرّف غير صالح");
  const patch = await parseJson(req, Patch);
  const order = await updateDraft(merchantId, id, patch);
  return json({ order });
});
