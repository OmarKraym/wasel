import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, json, requireMerchant, HttpError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { processConversation } from "@/lib/ai/extractor";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** Re-run the AI on demand ("أعد التحليل"). */
export const POST = handle(async (req: NextRequest, ctx: Ctx) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new HttpError(400, "معرّف غير صالح");

  const { data: conv } = await createAdminClient()
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!conv) throw new HttpError(404, "المحادثة غير موجودة");

  const result = await processConversation(id);
  return json(result);
});
