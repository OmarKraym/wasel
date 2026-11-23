/** Small fetch helper for our JSON route handlers. Throws Error(arabicMessage). */
export async function api<T>(path: string, body?: unknown, method: "POST" | "PATCH" | "PUT" = "POST"): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "تعذّر تنفيذ العملية");
  return data;
}
