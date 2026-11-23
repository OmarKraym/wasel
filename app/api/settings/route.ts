import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, handle, json, parseJson, requireMerchant, HttpError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_NAMES } from "@/lib/libya/cities";
import { encryptSecret } from "@/lib/crypto/tokens";
import { serverEnv } from "@/lib/env";
import { describePageToken } from "@/lib/meta/graph";

export const runtime = "nodejs";

const rateKey = z.string().refine((k) => k === "_default" || CITY_NAMES.includes(k), "مدينة غير معروفة");

const Body = z
  .object({
    business_name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(20).nullable(),
    delivery_rates_json: z.record(rateKey, z.number().min(0).max(1000)),
    courier_pin: z.string().regex(/^\d{4}$/),
    meta_page_token: z.string().trim().min(20).max(1000),
  })
  .partial()
  .strict();

/** Merchant settings. Secrets (PIN, Page token) are only ever written, never read back. */
export const PUT = handle(async (req: NextRequest) => {
  assertSameOrigin(req);
  const merchantId = await requireMerchant();
  const body = await parseJson(req, Body);
  const db = createAdminClient();

  const update: Record<string, unknown> = {};
  if (body.business_name !== undefined) update.business_name = body.business_name;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.delivery_rates_json !== undefined) update.delivery_rates_json = body.delivery_rates_json;

  let page: { pageName: string } | null = null;
  if (body.meta_page_token) {
    // Prove ownership: the page id comes from Meta, never from user input.
    let info;
    try {
      info = await describePageToken(body.meta_page_token);
    } catch {
      throw new HttpError(400, "رمز الصفحة غير صالح أو منتهي", "BAD_PAGE_TOKEN");
    }
    update.meta_page_id = info.pageId;
    update.meta_ig_account_id = info.igAccountId;
    update.meta_access_token_encrypted = encryptSecret(body.meta_page_token, serverEnv.tokenEncryptionKey());
    page = { pageName: info.pageName };
  }

  if (Object.keys(update).length) {
    const { error } = await db.from("merchants").update(update).eq("id", merchantId);
    if (error?.code === "23505") throw new HttpError(409, "هذه الصفحة مربوطة بحساب تاجر آخر", "PAGE_TAKEN");
    if (error) throw error;
  }
  if (body.courier_pin) {
    const { error } = await db.rpc("set_courier_pin", { p_merchant_id: merchantId, p_pin: body.courier_pin });
    if (error) throw error;
  }
  return json({ ok: true, page });
});
