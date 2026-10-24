-- Dockside Keep: initial Postgres schema (Supabase).
-- Each former MongoDB collection becomes a table of `id uuid` + `doc jsonb`.
-- The app connects server-side with DATABASE_URL only; RLS is enabled with no
-- policies so the public anon/authenticated API keys cannot read or write any table.

create extension if not exists pgcrypto;

do $$
declare t text;
begin
  foreach t in array array[
    'items', 'events', 'blog_posts', 'users', 'admins', 'orders',
    'order_ttl_holds', 'geocode_cache', 'metadata', 'premium_classes',
    'loyalty_users', 'privacy_consents', 'admin_audit_logs',
    'otel_metrics', 'otel_feature_usage', 'otel_traces', 'otel_logs'
  ] loop
    execute format(
      'create table if not exists public.%I (
         id uuid primary key default gen_random_uuid(),
         doc jsonb not null default ''{}''::jsonb
       )', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Natural keys (the former unique Mongo indexes)
create unique index if not exists items_slug_key on public.items ((doc->>'slug'));
create unique index if not exists events_slug_key on public.events ((doc->>'slug'));
create unique index if not exists blog_posts_slug_key on public.blog_posts ((doc->>'slug'));
create unique index if not exists users_email_key on public.users ((doc->>'email'));
create unique index if not exists admins_username_key on public.admins ((doc->>'username'));
create unique index if not exists geocode_cache_key on public.geocode_cache ((doc->>'cacheKey'));
create unique index if not exists metadata_key on public.metadata ((doc->>'key'));
create unique index if not exists premium_classes_id_key on public.premium_classes ((doc->>'id'));
create unique index if not exists loyalty_users_email_key on public.loyalty_users ((doc->>'email'));
create unique index if not exists privacy_consents_email_key on public.privacy_consents ((doc->>'email'));
create unique index if not exists otel_metrics_name_key on public.otel_metrics ((doc->>'name'));
create unique index if not exists otel_feature_usage_key on public.otel_feature_usage ((doc->>'feature'));

-- Query/sort indexes
create index if not exists items_category_created_idx on public.items ((doc->>'category'), (doc->>'createdAtUtc') desc);
create index if not exists items_created_idx on public.items ((doc->>'createdAtUtc') desc);
create index if not exists events_created_idx on public.events ((doc->>'createdAtUtc') desc);
create index if not exists blog_posts_created_idx on public.blog_posts ((doc->>'createdAtUtc') desc);
create index if not exists orders_customer_email_idx on public.orders ((doc->'customer'->>'email'));
create index if not exists orders_status_idx on public.orders ((doc->>'status'));
create index if not exists orders_items_gin on public.orders using gin ((doc->'items') jsonb_path_ops);
create index if not exists order_ttl_holds_expires_idx on public.order_ttl_holds ((doc->>'expiresAt'));
create index if not exists geocode_cache_expires_idx on public.geocode_cache ((doc->>'expiresAt'));

-- Auth.js (next-auth v5) tables are created in 0002_authjs.sql
