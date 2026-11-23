import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — use ONLY in route handlers after you
 * have verified who the caller is, and always scope queries by merchant_id.
 */
export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl(), serverEnv.serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
