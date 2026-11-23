import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, json, parseJson, requireMerchant, HttpError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const Body = z.object({ conversation_id: z.uuid() });

/** Create an empty draft by hand (when the AI found no order in the chat). */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const { conversation_id } = await parseJson(req, Body);
  const db = createAdminClient();

  const { data: conv } = await db
    .from("conversations")
    .select("id, customer_display_name")
    .eq("id", conversation_id)
    .eq("merchant_id", merchantId)
    .maybeSingle<{ id: string; customer_display_name: string | null }>();
  if (!conv) throw new HttpError(404, "المحادثة غير موجودة");

  const { data, error } = await db
    .from("orders")
    .insert({
      merchant_id: merchantId,
      conversation_id,
      customer_name: conv.customer_display_name,
      missing_fields: ["phone_primary", "city", "address_details", "items"],
    })
    .select("*")
    .single();
  if (error?.code === "23505") throw new HttpError(409, "يوجد طلب مفتوح لهذه المحادثة");
  if (error) throw error;
  return json({ order: data }, 201);
});
