-- Run once in Supabase → SQL Editor.
-- Back-in-stock alerts: people who asked to be emailed when Keytags are available again.
create table if not exists public.restock_requests (
  email       text primary key,
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.restock_requests enable row level security;
