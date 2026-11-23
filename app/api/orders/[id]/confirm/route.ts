import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, json, requireMerchant, HttpError } from "@/lib/api";
import { confirmOrder } from "@/lib/orders/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** One-click confirm: validates, deducts stock atomically, issues a tracking code. */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, "معرّف غير صالح");
  const order = await confirmOrder(merchantId, id);
  return json({ order });
});
