import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, json, parseJson, requireMerchant, HttpError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto/tokens";
import { serverEnv } from "@/lib/env";
import { sendTextMessage } from "@/lib/meta/graph";

export const runtime = "nodejs";

const Body = z.object({
  conversation_id: z.uuid(),
  text: z.string().trim().min(1).max(2000),
});

/** Reply to the customer through Messenger / Instagram. */
export const POST = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const { conversation_id, text } = await parseJson(req, Body);
  const db = createAdminClient();

  const [{ data: conv }, { data: merchant }] = await Promise.all([
    db
      .from("conversations")
      .select("id, external_sender_id")
      .eq("id", conversation_id)
      .eq("merchant_id", merchantId)
      .maybeSingle<{ id: string; external_sender_id: string }>(),
    db
      .from("merchants")
      .select("meta_access_token_encrypted")
      .eq("id", merchantId)
      .single<{ meta_access_token_encrypted: string | null }>(),
  ]);
  if (!conv) throw new HttpError(404, "المحادثة غير موجودة");
  if (!merchant?.meta_access_token_encrypted) {
    throw new HttpError(412, "اربط صفحة فيسبوك من الإعدادات أولاً", "META_NOT_CONNECTED");
  }

  const token = decryptSecret(merchant.meta_access_token_encrypted, serverEnv.tokenEncryptionKey());
  let sent: { message_id: string };
  try {
    sent = await sendTextMessage(token, conv.external_sender_id, text);
  } catch (err) {
    console.error("[send] graph error", err);
    throw new HttpError(502, "فيسبوك رفض الإرسال. تأكد أن الزبون راسلك خلال آخر 24 ساعة", "META_SEND_FAILED");
  }

  // external_message_id = Meta mid, so the echo webhook is de-duplicated
  const { data: message, error } = await db
    .from("messages")
    .insert({
      conversation_id,
      merchant_id: merchantId,
      sender_type: "merchant",
      content: text,
      external_message_id: sent.message_id,
    })
    .select("*")
    .single();
  if (error && error.code !== "23505") throw error;
  await db.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);
  return json({ message }, 201);
});
