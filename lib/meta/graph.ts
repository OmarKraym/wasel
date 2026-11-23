import "server-only";
import { serverEnv } from "@/lib/env";

const base = () => `https://graph.facebook.com/${serverEnv.metaGraphVersion()}`;

async function graphFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    throw new Error(`Graph API ${res.status}: ${json.error?.message ?? "unknown error"}`);
  }
  return json;
}

/** Send a text reply (works for Messenger PSIDs and Instagram IGSIDs with a Page token). */
export async function sendTextMessage(pageToken: string, recipientId: string, text: string) {
  return graphFetch<{ recipient_id: string; message_id: string }>("/me/messages", pageToken, {
    method: "POST",
    body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: "RESPONSE", message: { text } }),
  });
}

/** Resolve which Page (and linked IG account) a Page access token belongs to. */
export async function describePageToken(pageToken: string): Promise<{ pageId: string; pageName: string; igAccountId: string | null }> {
  const me = await graphFetch<{ id: string; name: string }>("/me?fields=id,name", pageToken);
  let igAccountId: string | null = null;
  try {
    const ig = await graphFetch<{ instagram_business_account?: { id: string } }>(
      `/${encodeURIComponent(me.id)}?fields=instagram_business_account`,
      pageToken,
    );
    igAccountId = ig.instagram_business_account?.id ?? null;
  } catch {
    igAccountId = null; // page has no linked Instagram account
  }
  return { pageId: me.id, pageName: me.name, igAccountId };
}

/** Best-effort display name for a customer. */
export async function fetchCustomerName(
  pageToken: string,
  platform: "facebook" | "instagram",
  customerId: string,
): Promise<string | null> {
  try {
    const fields = platform === "facebook" ? "first_name,last_name" : "name,username";
    const p = await graphFetch<{ first_name?: string; last_name?: string; name?: string; username?: string }>(
      `/${encodeURIComponent(customerId)}?fields=${fields}`,
      pageToken,
    );
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || p.username;
    return full?.trim() || null;
  } catch {
    return null;
  }
}

const ALLOWED_MEDIA_HOSTS = [/\.fbcdn\.net$/i, /\.fbsbx\.com$/i, /\.cdninstagram\.com$/i, /\.facebook\.com$/i];
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MEDIA_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/**
 * Download a Meta CDN attachment (receipt screenshot). Host allow-list
 * prevents SSRF; size and type limits prevent abuse.
 */
export async function downloadMetaMedia(url: string): Promise<{ bytes: ArrayBuffer; contentType: string; ext: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_MEDIA_HOSTS.some((re) => re.test(parsed.hostname))) return null;

  const res = await fetch(parsed, { signal: AbortSignal.timeout(20_000), redirect: "error", cache: "no-store" });
  if (!res.ok) return null;
  const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = MEDIA_TYPES[contentType];
  if (!ext) return null;
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_MEDIA_BYTES) return null;
  return { bytes, contentType, ext };
}
