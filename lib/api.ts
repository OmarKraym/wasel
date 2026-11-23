import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { getMerchantId } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Signed-in merchant id, or 401. */
export async function requireMerchant(): Promise<string> {
  const id = await getMerchantId();
  if (!id) throw new HttpError(401, "انتهت الجلسة، سجّل الدخول من جديد", "UNAUTHENTICATED");
  return id;
}

/**
 * CSRF guard for cookie-authenticated JSON endpoints: require a JSON content
 * type (forces a CORS preflight cross-site) and a same-origin Origin header.
 */
export function assertSameOrigin(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) {
    throw new HttpError(403, "Cross-origin request blocked");
  }
}

export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "صيغة الطلب غير صحيحة", "BAD_JSON");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "بيانات غير صالحة", "VALIDATION");
  }
  return result.data;
}

/** Wrap a handler: HttpError -> JSON error, anything else -> logged 500 (no internals leaked). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      console.error("[api] unhandled", err);
      return json({ error: "حدث خطأ غير متوقع، حاول مرة أخرى" }, 500);
    }
  };
}
