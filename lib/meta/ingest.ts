import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto/tokens";
import { downloadMetaMedia, fetchCustomerName } from "@/lib/meta/graph";
import { processConversation } from "@/lib/ai/extractor";
import type { NormalizedInbound } from "@/lib/meta/types";

type MerchantRow = { id: string; meta_access_token_encrypted: string | null };

/**
 * Store inbound Meta events, then run the AI extractor once per touched
 * conversation. Runs inside `after()` — never throws to the caller.
 */
export async function ingestMetaEvents(events: NormalizedInbound[]): Promise<void> {
  const db = createAdminClient();
  const merchantCache = new Map<string, MerchantRow | null>();
  const toExtract = new Set<string>();

  for (const ev of events) {
    try {
      const cacheKey = `${ev.platform}:${ev.accountId}`;
      if (!merchantCache.has(cacheKey)) {
        const column = ev.platform === "facebook" ? "meta_page_id" : "meta_ig_account_id";
        const { data } = await db
          .from("merchants")
          .select("id, meta_access_token_encrypted")
          .eq(column, ev.accountId)
          .maybeSingle<MerchantRow>();
        merchantCache.set(cacheKey, data ?? null);
      }
      const merchant = merchantCache.get(cacheKey);
      if (!merchant) continue; // page not connected to any merchant

      // conversation (create on first contact)
      let { data: conv } = await db
        .from("conversations")
        .select("id")
        .eq("merchant_id", merchant.id)
        .eq("platform", ev.platform)
        .eq("external_sender_id", ev.customerId)
        .maybeSingle<{ id: string }>();

      if (!conv) {
        let displayName: string | null = null;
        if (merchant.meta_access_token_encrypted) {
          const token = decryptSecret(merchant.meta_access_token_encrypted, serverEnv.tokenEncryptionKey());
          displayName = await fetchCustomerName(token, ev.platform, ev.customerId);
        }
        const { data: created, error } = await db
          .from("conversations")
          .upsert(
            {
              merchant_id: merchant.id,
              platform: ev.platform,
              external_sender_id: ev.customerId,
              customer_display_name: displayName,
            },
            { onConflict: "merchant_id,platform,external_sender_id" },
          )
          .select("id")
          .single<{ id: string }>();
        if (error) throw error;
        conv = created;
      }

      // message (idempotent on Meta mid — retries and our own echoes are skipped)
      const { data: inserted, error: msgErr } = await db
        .from("messages")
        .upsert(
          {
            conversation_id: conv.id,
            merchant_id: merchant.id,
            sender_type: ev.isEcho ? "merchant" : "customer",
            content: ev.text,
            attachment_url: ev.attachments[0]?.url ?? null,
            external_message_id: ev.mid,
            created_at: new Date(ev.timestamp || Date.now()).toISOString(),
          },
          { onConflict: "external_message_id", ignoreDuplicates: true },
        )
        .select("id");
      if (msgErr) throw msgErr;
      const messageId = inserted?.[0]?.id as string | undefined;
      if (!messageId) continue; // duplicate delivery

      // copy the first image/PDF to private storage (Meta CDN links expire)
      const firstAttachment = ev.attachments[0];
      if (firstAttachment && !ev.isEcho) {
        const media = await downloadMetaMedia(firstAttachment.url).catch(() => null);
        if (media) {
          const path = `${merchant.id}/${conv.id}/${messageId}.${media.ext}`;
          const { error: upErr } = await db.storage
            .from("receipts")
            .upload(path, media.bytes, { contentType: media.contentType, upsert: true });
          if (!upErr) await db.from("messages").update({ attachment_path: path }).eq("id", messageId);
        }
      }

      await db
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conv.id);

      if (!ev.isEcho) toExtract.add(conv.id);
    } catch (err) {
      console.error("[meta-ingest] event failed", { mid: ev.mid, err });
    }
  }

  for (const conversationId of toExtract) {
    try {
      await processConversation(conversationId);
    } catch (err) {
      console.error("[meta-ingest] extraction failed", { conversationId, err });
      const { data: conv } = await db
        .from("conversations")
        .select("merchant_id")
        .eq("id", conversationId)
        .single<{ merchant_id: string }>();
      if (conv) {
        await db.from("messages").insert({
          conversation_id: conversationId,
          merchant_id: conv.merchant_id,
          sender_type: "system",
          content: "تعذّر تحليل الرسالة تلقائياً. راجع المحادثة وعبّئ الطلب يدوياً.",
        });
      }
    }
  }
}
