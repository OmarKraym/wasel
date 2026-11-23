import type { NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { handle, json, parseJson, HttpError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.uuid(),
  pin: z.string().regex(/^\d{4}$/),
  action: z.enum(["view", "delivered", "returned"]),
});

const STATUS: Record<string, number> = {
  BAD_PIN: 401,
  PIN_NOT_SET: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  LOCKED: 423,
  BAD_ACTION: 400,
};

/**
 * Courier portal API (public, no login). Every call re-checks the PIN inside
 * one SQL transaction with per-label lockout (5 wrong PINs -> 15 min lock).
 */
export const POST = handle(async (req: NextRequest) => {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new HttpError(415, "JSON only");
  const { token, pin, action } = await parseJson(req, Body);

  const db = createAdminClient();
  const { data, error } = await db.rpc("courier_scan", { p_token: token, p_pin: pin, p_action: action });
  if (error) throw error;

  const result = data as { ok: boolean; error?: string } & Record<string, unknown>;
  if (!result.ok) return json(result, STATUS[result.error ?? ""] ?? 400);
  return json(result);
});
