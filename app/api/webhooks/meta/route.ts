import { after, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { verifyMetaSignature } from "@/lib/meta/signature";
import { normalizeWebhook, type MetaWebhookBody } from "@/lib/meta/types";
import { ingestMetaEvents } from "@/lib/meta/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Budget for the after() work (AI extraction) on serverless platforms.
export const maxDuration = 60;

/** Meta subscription handshake: echo hub.challenge when the verify token matches. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === serverEnv.metaVerifyToken()) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * Event ingestion. Verify the signature on the RAW body, answer 200 at once
 * (Meta retries and eventually disables slow webhooks), then do the heavy
 * work in `after()`, which keeps the serverless function alive until done.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("Payload too large", { status: 413 });

  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), serverEnv.metaAppSecret())) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(raw) as MetaWebhookBody;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const events = normalizeWebhook(body);
  if (events.length > 0) {
    after(() => ingestMetaEvents(events));
  }
  return new Response("EVENT_RECEIVED", { status: 200 });
}
