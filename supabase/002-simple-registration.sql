-- Update 2: registration with the tag code only (no set-up PIN, no name required).
-- Run once in Supabase → SQL Editor, after schema.sql. Safe to run more than once.

-- Name is now optional; PIN no longer used.
alter table public.owners alter column name drop not null;
alter table public.tags   alter column claim_key drop not null;

-- Optional name for each tag, e.g. "House" or "Car".
alter table public.tags add column if not exists label text;

-- Short-lived abuse protection: counts attempts per scrambled IP address.
-- Rows older than a day are deleted by purge_old_data().
create table if not exists public.rate_limits (
  id    bigint generated always as identity primary key,
  key   text not null,
  at    timestamptz not null default now()
);
create index if not exists rate_limits_key_idx on public.rate_limits (key, at desc);
alter table public.rate_limits enable row level security;

-- Lets the server find an existing login by email.
create or replace function public.user_id_by_email(e text) returns uuid
language sql security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(e) limit 1
$$;
revoke all on function public.user_id_by_email(text) from public, anon, authenticated;

create or replace function public.purge_old_data() returns void
language sql security definer as $$
  delete from public.messages      where created_at       < now() - interval '90 days';
  update public.conversations set finder_phone = null
                                    where last_activity_at < now() - interval '90 days';
  delete from public.scans         where scanned_at       < now() - interval '365 days';
  delete from public.rate_limits   where at               < now() - interval '1 day';
$$;
