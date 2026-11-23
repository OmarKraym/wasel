import "server-only";

/** Read a required server env var, failing loudly (never silently default secrets). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const serverEnv = {
  supabaseUrl: () => requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  serviceRoleKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  openaiKey: () => requireEnv("OPENAI_API_KEY"),
  openaiModel: () => process.env.OPENAI_MODEL || "gpt-4o-mini",
  metaAppSecret: () => requireEnv("META_APP_SECRET"),
  metaVerifyToken: () => requireEnv("META_VERIFY_TOKEN"),
  metaGraphVersion: () => process.env.META_GRAPH_VERSION || "v21.0",
  tokenEncryptionKey: () => requireEnv("TOKEN_ENCRYPTION_KEY"),
  phoneHashPepper: () => requireEnv("PHONE_HASH_PEPPER"),
};
