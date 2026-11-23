-- =====================================================================
-- Wasla (وصلة) — Social Commerce Order Desk for Libyan merchants
-- Supabase / PostgreSQL migration. Run once in the SQL editor.
--
-- Security model (read this first):
--   * The browser (role `authenticated`) can only READ its own rows, plus
--     full CRUD on its own `products`. Every other write goes through
--     Next.js route handlers that verify the session, then call the
--     SECURITY DEFINER functions below with the service role.
--   * `phone_reputation`, `scan_attempts`, `reputation_events` have RLS on
--     and NO policies: only the service role / definer functions touch them.
--   * Secrets on `merchants` (encrypted Meta token, courier PIN hash) are
--     hidden from the browser with column-level grants.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- merchants  (1 row per auth user; id = auth.users.id)
-- ---------------------------------------------------------------------
create table if not exists public.merchants (
  id                          uuid primary key references auth.users (id) on delete cascade,
  business_name               text not null default '',
  phone                       text,
  -- bcrypt hash of the 4-digit courier PIN (never the plain PIN)
  courier_pin_hash            text,
  courier_pin_set             boolean generated always as (courier_pin_hash is not null) stored,
  meta_page_id                text unique,
  meta_ig_account_id          text unique,
  -- AES-256-GCM ciphertext produced by lib/crypto/tokens.ts
  meta_access_token_encrypted text,
  -- { "طرابلس": 15, "بنغازي": 30, "_default": 35 }  (LYD)
  delivery_rates_json         jsonb not null default '{"_default": 30}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint delivery_rates_is_object check (jsonb_typeof(delivery_rates_json) = 'object')
);

drop trigger if exists merchants_updated_at on public.merchants;
create trigger merchants_updated_at before update on public.merchants
  for each row execute function public.set_updated_at();

-- Auto-create a merchant row when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.merchants (id, business_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'business_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references public.merchants (id) on delete cascade,
  name           text not null check (length(name) between 1 and 200),
  sku            text,
  price_lyd      numeric(12, 3) not null default 0 check (price_lyd >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (merchant_id, sku)
);
create index if not exists products_merchant_idx on public.products (merchant_id);

-- ---------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  merchant_id           uuid not null references public.merchants (id) on delete cascade,
  platform              text not null check (platform in ('facebook', 'instagram')),
  external_sender_id    text not null,
  customer_display_name text,
  status                text not null default 'new'
                        check (status in ('new', 'pending_review', 'confirmed', 'flagged')),
  last_message_at       timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  unique (merchant_id, platform, external_sender_id)
);
create index if not exists conversations_queue_idx
  on public.conversations (merchant_id, last_message_at desc);

-- ---------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  -- denormalised so RLS + Realtime filters are a single column check
  merchant_id         uuid not null references public.merchants (id) on delete cascade,
  sender_type         text not null check (sender_type in ('customer', 'merchant', 'system')),
  content             text,
  -- original Meta CDN url (expires) and our durable copy in Storage
  attachment_url      text,
  attachment_path     text,
  -- Meta "mid": makes webhook retries idempotent
  external_message_id text unique,
  created_at          timestamptz not null default now()
);
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  merchant_id       uuid not null references public.merchants (id) on delete cascade,
  conversation_id   uuid references public.conversations (id) on delete set null,
  customer_name     text,
  phone_primary     text check (phone_primary is null or phone_primary ~ '^09[1-6][0-9]{7}$'),
  phone_secondary   text check (phone_secondary is null or phone_secondary ~ '^09[1-6][0-9]{7}$'),
  city              text,
  address_details   text,
  -- [{product_id, quantity, name, sku, unit_price_lyd, line_total_lyd}]
  -- name/price fields are always (re)written by the totals trigger.
  items_json        jsonb not null default '[]'::jsonb check (jsonb_typeof(items_json) = 'array'),
  subtotal_lyd      numeric(12, 3) not null default 0,
  shipping_fee_lyd  numeric(12, 3) not null default 0,
  total_lyd         numeric(12, 3) not null default 0,
  payment_method    text not null default 'COD'
                    check (payment_method in ('COD', 'MobiCash', 'Sadad', 'YusrPay', 'Tadawul')),
  payment_status    text not null default 'unpaid'
                    check (payment_status in ('unpaid', 'pending_verification', 'verified')),
  order_status      text not null default 'draft'
                    check (order_status in ('draft', 'confirmed', 'shipped', 'delivered', 'returned')),
  qr_token          uuid not null unique default gen_random_uuid(),
  tracking_code     text unique,
  -- reputation / AI metadata
  phone_hash        text,
  risk_level        text not null default 'unknown'
                    check (risk_level in ('unknown', 'low', 'medium', 'high')),
  risk_delivered    integer not null default 0,
  risk_returned     integer not null default 0,
  missing_fields    text[] not null default '{}',
  ai_confidence     numeric(4, 3),
  -- AI-drafted Libyan-dialect reply asking for the missing fields
  suggested_reply   text,
  -- fields the merchant edited by hand; the AI never overwrites these
  locked_fields     text[] not null default '{}',
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  returned_at       timestamptz
);
create index if not exists orders_merchant_status_idx on public.orders (merchant_id, order_status, created_at desc);
-- at most ONE open draft per conversation
create unique index if not exists orders_one_draft_per_conversation
  on public.orders (conversation_id) where order_status = 'draft';

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Server-authoritative totals: prices always come from `products`,
-- shipping from the merchant's city rates. Frozen once confirmed.
create or replace function public.orders_compute_totals()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_items    jsonb := '[]'::jsonb;
  v_subtotal numeric(12, 3) := 0;
  v_rates    jsonb;
  v_item     record;
begin
  if new.order_status <> 'draft' then
    return new;
  end if;

  for v_item in
    select p.id, p.name, p.sku, p.price_lyd, sum(greatest((e ->> 'quantity')::int, 1)) as qty
    from jsonb_array_elements(coalesce(new.items_json, '[]'::jsonb)) e
    join public.products p
      on p.id = (e ->> 'product_id')::uuid and p.merchant_id = new.merchant_id
    group by p.id, p.name, p.sku, p.price_lyd
  loop
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_item.id,
      'name', v_item.name,
      'sku', v_item.sku,
      'quantity', v_item.qty,
      'unit_price_lyd', v_item.price_lyd,
      'line_total_lyd', v_item.price_lyd * v_item.qty
    ));
    v_subtotal := v_subtotal + v_item.price_lyd * v_item.qty;
  end loop;

  select delivery_rates_json into v_rates from public.merchants where id = new.merchant_id;

  new.items_json       := v_items;
  new.subtotal_lyd     := v_subtotal;
  new.shipping_fee_lyd := case
    when new.city is null then 0
    else coalesce((v_rates ->> new.city)::numeric, (v_rates ->> '_default')::numeric, 0)
  end;
  new.total_lyd        := new.subtotal_lyd + new.shipping_fee_lyd;
  return new;
end;
$$;

drop trigger if exists orders_totals on public.orders;
create trigger orders_totals before insert or update of items_json, city, merchant_id, order_status
  on public.orders for each row execute function public.orders_compute_totals();

-- ---------------------------------------------------------------------
-- phone_reputation (cross-merchant, keyed by HMAC-SHA256 of the phone)
-- ---------------------------------------------------------------------
create table if not exists public.phone_reputation (
  phone_hash      text primary key check (phone_hash ~ '^[0-9a-f]{64}$'),
  delivered_count integer not null default 0,
  returned_count  integer not null default 0,
  last_updated    timestamptz not null default now()
);

-- Audit trail + anti-poisoning: one merchant can add at most ONE return
-- per phone per 30 days to the shared score.
create table if not exists public.reputation_events (
  id          bigint generated always as identity primary key,
  phone_hash  text not null,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  order_id    uuid not null references public.orders (id) on delete cascade,
  outcome     text not null check (outcome in ('delivered', 'returned')),
  counted     boolean not null,
  created_at  timestamptz not null default now(),
  unique (order_id)
);
create index if not exists reputation_events_lookup
  on public.reputation_events (phone_hash, merchant_id, outcome, created_at desc);

-- Courier PIN brute-force protection (per QR token)
create table if not exists public.scan_attempts (
  qr_token        uuid primary key,
  failed_count    integer not null default 0,
  locked_until    timestamptz,
  last_attempt_at timestamptz not null default now()
);

-- =====================================================================
-- Row-Level Security
-- =====================================================================
alter table public.merchants         enable row level security;
alter table public.products          enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.orders            enable row level security;
alter table public.phone_reputation  enable row level security;
alter table public.reputation_events enable row level security;
alter table public.scan_attempts     enable row level security;

-- Start from zero, then grant exactly what the browser needs.
revoke all on public.merchants, public.products, public.conversations, public.messages,
  public.orders, public.phone_reputation, public.reputation_events, public.scan_attempts
  from anon, authenticated;

-- merchants: read own row, non-secret columns only
grant select (id, business_name, phone, courier_pin_set, meta_page_id, meta_ig_account_id,
              delivery_rates_json, created_at, updated_at)
  on public.merchants to authenticated;
drop policy if exists merchants_select_own on public.merchants;
create policy merchants_select_own on public.merchants
  for select to authenticated using (id = (select auth.uid()));

-- products: full CRUD on own catalogue
grant select, insert, update, delete on public.products to authenticated;
drop policy if exists products_own on public.products;
create policy products_own on public.products
  for all to authenticated
  using (merchant_id = (select auth.uid()))
  with check (merchant_id = (select auth.uid()));

-- conversations / messages / orders: read-only from the browser
grant select on public.conversations, public.messages, public.orders to authenticated;

drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
  for select to authenticated using (merchant_id = (select auth.uid()));

drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
  for select to authenticated using (merchant_id = (select auth.uid()));

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated using (merchant_id = (select auth.uid()));

-- (phone_reputation, reputation_events, scan_attempts: no policies on purpose)

-- =====================================================================
-- Business functions (service role only)
-- =====================================================================

-- Set / change the courier PIN (stored as bcrypt).
create or replace function public.set_courier_pin(p_merchant_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_pin !~ '^[0-9]{4}$' then
    raise exception 'INVALID_PIN' using errcode = 'P0001';
  end if;
  update public.merchants
     set courier_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8))
   where id = p_merchant_id;
  -- a new PIN clears all lockouts for this merchant's labels
  delete from public.scan_attempts sa
   using public.orders o
   where o.qr_token = sa.qr_token and o.merchant_id = p_merchant_id;
end;
$$;

-- Confirm a draft: validate, deduct stock atomically, assign tracking code.
create or replace function public.confirm_order(p_order_id uuid, p_merchant_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.orders;
  v_item    record;
  v_updated integer;
begin
  select * into v_order from public.orders
   where id = p_order_id and merchant_id = p_merchant_id
   for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_order.order_status <> 'draft' then
    raise exception 'ORDER_NOT_DRAFT' using errcode = 'P0001';
  end if;
  if v_order.phone_primary is null or v_order.city is null
     or coalesce(trim(v_order.customer_name), '') = ''
     or jsonb_array_length(v_order.items_json) = 0 then
    raise exception 'MISSING_FIELDS' using errcode = 'P0001';
  end if;
  if v_order.payment_method <> 'COD' and v_order.payment_status <> 'verified' then
    raise exception 'PAYMENT_NOT_VERIFIED' using errcode = 'P0001';
  end if;

  -- Deduct stock; the WHERE guard + row lock make overselling impossible.
  for v_item in
    select (e ->> 'product_id')::uuid as product_id, (e ->> 'quantity')::int as qty, e ->> 'name' as name
    from jsonb_array_elements(v_order.items_json) e
  loop
    update public.products
       set stock_quantity = stock_quantity - v_item.qty
     where id = v_item.product_id
       and merchant_id = p_merchant_id
       and stock_quantity >= v_item.qty;
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'INSUFFICIENT_STOCK:%', v_item.name using errcode = 'P0001';
    end if;
  end loop;

  update public.orders
     set order_status  = 'confirmed',
         confirmed_at  = now(),
         tracking_code = 'WS-' || to_char(now() at time zone 'Africa/Tripoli', 'YYMMDD') || '-'
                         || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
   where id = p_order_id
  returning * into v_order;

  if v_order.conversation_id is not null then
    update public.conversations set status = 'confirmed' where id = v_order.conversation_id;
  end if;

  return v_order;
end;
$$;

-- Mark confirmed orders as handed to the courier (used by bulk export).
create or replace function public.mark_orders_shipped(p_order_ids uuid[], p_merchant_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.orders
     set order_status = 'shipped', shipped_at = now()
   where id = any (p_order_ids)
     and merchant_id = p_merchant_id
     and order_status = 'confirmed';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Internal: record a delivery outcome in the shared reputation table.
create or replace function public.record_reputation(
  p_phone_hash text, p_merchant_id uuid, p_order_id uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counted boolean := true;
begin
  if p_phone_hash is null then
    return;
  end if;

  if p_outcome = 'returned' then
    -- anti-poisoning: max one counted return per merchant per phone per 30 days
    select not exists (
      select 1 from public.reputation_events
       where phone_hash = p_phone_hash and merchant_id = p_merchant_id
         and outcome = 'returned' and counted
         and created_at > now() - interval '30 days'
    ) into v_counted;
  end if;

  insert into public.reputation_events (phone_hash, merchant_id, order_id, outcome, counted)
  values (p_phone_hash, p_merchant_id, p_order_id, p_outcome, v_counted)
  on conflict (order_id) do nothing;
  if not found then
    return; -- this order was already counted
  end if;

  if v_counted then
    insert into public.phone_reputation (phone_hash, delivered_count, returned_count, last_updated)
    values (p_phone_hash,
            case when p_outcome = 'delivered' then 1 else 0 end,
            case when p_outcome = 'returned'  then 1 else 0 end,
            now())
    on conflict (phone_hash) do update
      set delivered_count = public.phone_reputation.delivered_count + excluded.delivered_count,
          returned_count  = public.phone_reputation.returned_count  + excluded.returned_count,
          last_updated    = now();
  end if;
end;
$$;

-- Courier portal: PIN check with lockout, then view / deliver / return.
-- Returns jsonb: { ok, error?, attempts_left?, retry_after?, order? }
create or replace function public.courier_scan(p_token uuid, p_pin text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_attempts constant integer := 5;
  c_lock_minutes constant integer := 15;
  v_attempt public.scan_attempts;
  v_order   public.orders;
  v_pin_hash text;
  v_business text;
  v_item    record;
begin
  if p_action not in ('view', 'delivered', 'returned') then
    return jsonb_build_object('ok', false, 'error', 'BAD_ACTION');
  end if;

  -- serialise attempts per token
  insert into public.scan_attempts (qr_token) values (p_token) on conflict (qr_token) do nothing;
  select * into v_attempt from public.scan_attempts where qr_token = p_token for update;

  if v_attempt.locked_until is not null and v_attempt.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED',
      'retry_after', ceil(extract(epoch from v_attempt.locked_until - now())));
  end if;

  select o.* into v_order from public.orders o where o.qr_token = p_token for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  select m.courier_pin_hash, m.business_name into v_pin_hash, v_business
    from public.merchants m where m.id = v_order.merchant_id;

  if v_pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'PIN_NOT_SET');
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4}$'
     or extensions.crypt(p_pin, v_pin_hash) <> v_pin_hash then
    update public.scan_attempts
       set failed_count = case when failed_count + 1 >= c_max_attempts then 0 else failed_count + 1 end,
           locked_until = case when failed_count + 1 >= c_max_attempts
                               then now() + make_interval(mins => c_lock_minutes) else null end,
           last_attempt_at = now()
     where qr_token = p_token
    returning * into v_attempt;
    if v_attempt.locked_until is not null then
      return jsonb_build_object('ok', false, 'error', 'LOCKED', 'retry_after', c_lock_minutes * 60);
    end if;
    return jsonb_build_object('ok', false, 'error', 'BAD_PIN',
      'attempts_left', c_max_attempts - v_attempt.failed_count);
  end if;

  update public.scan_attempts
     set failed_count = 0, locked_until = null, last_attempt_at = now()
   where qr_token = p_token;

  if p_action = 'delivered' then
    if v_order.order_status not in ('confirmed', 'shipped') then
      return jsonb_build_object('ok', false, 'error', 'INVALID_STATE', 'status', v_order.order_status);
    end if;
    update public.orders
       set order_status = 'delivered', delivered_at = now(), payment_status = 'verified'
     where id = v_order.id
    returning * into v_order;
    perform public.record_reputation(v_order.phone_hash, v_order.merchant_id, v_order.id, 'delivered');

  elsif p_action = 'returned' then
    if v_order.order_status not in ('confirmed', 'shipped') then
      return jsonb_build_object('ok', false, 'error', 'INVALID_STATE', 'status', v_order.order_status);
    end if;
    for v_item in
      select (e ->> 'product_id')::uuid as product_id, (e ->> 'quantity')::int as qty
      from jsonb_array_elements(v_order.items_json) e
    loop
      update public.products
         set stock_quantity = stock_quantity + v_item.qty
       where id = v_item.product_id and merchant_id = v_order.merchant_id;
    end loop;
    update public.orders
       set order_status = 'returned', returned_at = now()
     where id = v_order.id
    returning * into v_order;
    perform public.record_reputation(v_order.phone_hash, v_order.merchant_id, v_order.id, 'returned');
  end if;

  return jsonb_build_object('ok', true, 'order', jsonb_build_object(
    'merchant_name',   v_business,
    'customer_name',   v_order.customer_name,
    'phone_primary',   v_order.phone_primary,
    'phone_secondary', v_order.phone_secondary,
    'city',            v_order.city,
    'address_details', v_order.address_details,
    'items',           v_order.items_json,
    'total_lyd',       v_order.total_lyd,
    'payment_method',  v_order.payment_method,
    'payment_status',  v_order.payment_status,
    'order_status',    v_order.order_status,
    'tracking_code',   v_order.tracking_code
  ));
end;
$$;

-- Lock every function down to the service role.
revoke all on function public.set_courier_pin(uuid, text)                     from public, anon, authenticated;
revoke all on function public.confirm_order(uuid, uuid)                       from public, anon, authenticated;
revoke all on function public.mark_orders_shipped(uuid[], uuid)               from public, anon, authenticated;
revoke all on function public.record_reputation(text, uuid, uuid, text)       from public, anon, authenticated;
revoke all on function public.courier_scan(uuid, text, text)                  from public, anon, authenticated;
revoke all on function public.handle_new_user()                               from public, anon, authenticated;
grant execute on function public.set_courier_pin(uuid, text)                  to service_role;
grant execute on function public.confirm_order(uuid, uuid)                    to service_role;
grant execute on function public.mark_orders_shipped(uuid[], uuid)            to service_role;
grant execute on function public.record_reputation(text, uuid, uuid, text)    to service_role;
grant execute on function public.courier_scan(uuid, text, text)               to service_role;

-- =====================================================================
-- Realtime
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['conversations', 'messages', 'orders'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- Storage: private bucket for payment receipts (path: {merchant_id}/...)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists receipts_read_own on storage.objects;
create policy receipts_read_own on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
