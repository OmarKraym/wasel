# وصلة (Wasla) — Social-commerce order desk for Libyan merchants

Facebook/Instagram messages come in → AI (Libyan dialect) drafts the order →
merchant confirms in one click → courier scans a QR label and marks
**delivered** or **returned** → the shared phone-reputation score updates.

**Stack:** Next.js 16 (App Router, route handlers, `proxy.ts`), React 19, TypeScript,
Tailwind CSS 4, Supabase (Postgres + RLS, Auth, Realtime, Storage), OpenAI `gpt-4o-mini`
with Structured Outputs (Zod 4), `qrcode.react`, ExcelJS.

---

## 1. Folder structure

```
app/
  layout.tsx                      RTL root, Cairo + Tajawal (self-hosted via @fontsource)
  login/page.tsx                  sign in / sign up
  dashboard/
    layout.tsx                    auth guard + top bar
    page.tsx                      3-column workspace (server-loads initial data)
    orders/page.tsx               shipping board: export + bulk labels
    settings/page.tsx             store, courier PIN, Meta page, delivery rates, products
  scan/[token]/page.tsx           public courier portal (PIN → deliver / return)
  api/
    webhooks/meta/route.ts        GET verify, POST signed events → after() ingestion
    orders/scan/route.ts          courier API (PIN + lockout in SQL)
    orders/route.ts               create manual draft
    orders/[id]/route.ts          PATCH draft (locks edited fields from AI)
    orders/[id]/confirm/route.ts  one-click confirm (stock deducted atomically)
    orders/export/route.ts        Vanex / generic CSV & XLSX, optional "mark shipped"
    messages/send/route.ts        reply via Graph API
    conversations/[id]/extract/   re-run AI
    settings/route.ts             settings (PIN + Page token write-only)
components/
  dashboard/  Workspace, ConversationQueue, ChatStream, OrderCopilot, nav
  labels/ShippingLabelModal.tsx   thermal 10×15 or A4 4-up, @media print
  orders/ShippingBoard.tsx
  settings/SettingsForm.tsx
  scan/CourierScan.tsx
lib/
  ai/extractor.ts                 dialect prompt, Zod schema, pipeline → draft order
  orders/draft.ts                 pure merge/clean/missing-field logic (unit-tested)
  orders/service.ts               draft edit + confirm (server)
  meta/ signature.ts types.ts graph.ts ingest.ts
  shipping/exporters.ts xlsx.ts   adapter pattern
  libya/cities.ts                 canonical cities + districts → city resolver
  phone.ts                        Libyan phone normaliser + HMAC hash
  crypto/tokens.ts                AES-256-GCM for the Page token
  reputation.ts                   risk levels
  supabase/ client.ts server.ts admin.ts
supabase/schema.sql               tables, RLS, grants, triggers, RPCs, realtime, storage
tests/                            Vitest unit tests (49)
proxy.ts                          session refresh + /dashboard guard (Next 16 "middleware")
```

## 2. Setup

1. `npm install`
2. Create a Supabase project. Run `supabase/schema.sql` in the SQL editor (safe to re-run).
3. Copy `.env.example` → `.env.local` and fill it in. Generate secrets with
   `openssl rand -base64 32` for `TOKEN_ENCRYPTION_KEY` and `PHONE_HASH_PEPPER`.
4. `npm run dev` → `/login` → sign up → **Settings**: set the courier PIN, delivery rates,
   products, and paste a long-lived **Page access token**.
5. Meta app → Webhooks: callback `https://<domain>/api/webhooks/meta`, verify token =
   `META_VERIFY_TOKEN`, subscribe to `messages` and `message_echoes` (Page + Instagram).
   You need the `pages_messaging` (and `instagram_manage_messages`) permissions approved by Meta.

Checks: `npm test` · `npm run typecheck` · `npm run build`

## 3. Decisions that differ from the brief (and why)

| Brief | Built | Why |
|---|---|---|
| SHA-256 + salt phone hash | **HMAC-SHA256 with a secret pepper** | Libyan mobiles are ~60M numbers; an unkeyed hash is reversible in minutes. |
| `courier_pin` column | `courier_pin_hash` (bcrypt) + **lockout**: 5 wrong PINs → label locked 15 min | A 4-digit PIN has 10,000 options. |
| "Return 200, then async" | `after()` from `next/server` | Plain un-awaited promises die on serverless after the response. |
| Extra columns | `orders.phone_hash, risk_*, missing_fields, locked_fields, suggested_reply, ai_confidence`; `messages.merchant_id, external_message_id, attachment_path`; `merchants.meta_ig_account_id` | Realtime filtering, webhook idempotency, receipts copied to private storage (Meta links expire), AI never overwrites merchant edits. |
| Reputation counts | + `reputation_events` (one counted return per merchant per phone per 30 days) | Limits poisoning by a single merchant. |
| Prices | Always recomputed in a DB trigger from `products` | The AI and the browser never set prices. |

Order lifecycle: `draft → confirmed → shipped (via export) → delivered | returned`.
Confirm deducts stock with a row-locked `UPDATE … WHERE stock >= qty` (no overselling);
"returned" restores stock.

## 4. Security model (short)

- Browser = read-only on its own rows (RLS) + CRUD on its own products. All writes go
  through route handlers that verify the session (`auth.getUser()`), then call
  service-role functions scoped by `merchant_id`.
- Secret columns hidden by column-level grants. SECURITY DEFINER functions are executable by
  `service_role` only.
- Meta webhook: `X-Hub-Signature-256` checked on the raw body; media downloads limited to
  Meta CDN hosts, HTTPS, no redirects, 10 MB, image/PDF only.
- CSRF: JSON content type + same-origin check on cookie-auth endpoints.
- The schema was executed in PGlite (Postgres 17) with a scenario test: RLS isolation,
  grants, stock locking, PIN lockout, reputation capping.

A security review was run before the first release; its register is kept private.

## 5. Known limits of the MVP

- Instagram messaging needs the IG account linked to the Facebook Page.
- Meta only allows free-form replies within 24 h of the customer's last message.
- One merchant = one Supabase user (no staff accounts yet).
- Libya has no single courier API standard; `lib/shipping/exporters.ts` ships a
  Vanex-style column mapping. Check it against your courier's current template.
