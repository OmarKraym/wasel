/** Minimal shapes of Messenger / Instagram messaging webhooks that we use. */
export interface MetaAttachment {
  type: "image" | "video" | "audio" | "file" | "fallback" | "template" | string;
  payload?: { url?: string };
}

export interface MetaMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: MetaAttachment[];
  };
}

export interface MetaWebhookBody {
  object: "page" | "instagram" | string;
  entry?: Array<{ id: string; time: number; messaging?: MetaMessagingEvent[] }>;
}

export interface NormalizedInbound {
  platform: "facebook" | "instagram";
  /** Page id (facebook) or IG professional account id (instagram) */
  accountId: string;
  /** The customer (PSID / IGSID) */
  customerId: string;
  mid: string;
  text: string | null;
  attachments: Array<{ type: string; url: string }>;
  /** true when the page itself sent the message (e.g. from Meta Business Suite) */
  isEcho: boolean;
  timestamp: number;
}

export function normalizeWebhook(body: MetaWebhookBody): NormalizedInbound[] {
  const platform = body.object === "page" ? "facebook" : body.object === "instagram" ? "instagram" : null;
  if (!platform || !Array.isArray(body.entry)) return [];
  const out: NormalizedInbound[] = [];
  for (const entry of body.entry) {
    for (const ev of entry.messaging ?? []) {
      const msg = ev.message;
      if (!msg?.mid || !ev.sender?.id || !ev.recipient?.id) continue;
      const isEcho = Boolean(msg.is_echo);
      out.push({
        platform,
        accountId: entry.id,
        customerId: isEcho ? ev.recipient.id : ev.sender.id,
        mid: msg.mid,
        text: typeof msg.text === "string" ? msg.text.slice(0, 4000) : null,
        attachments: (msg.attachments ?? [])
          .filter((a) => typeof a.payload?.url === "string")
          .map((a) => ({ type: a.type, url: a.payload!.url! })),
        isEcho,
        timestamp: ev.timestamp,
      });
    }
  }
  return out;
}
