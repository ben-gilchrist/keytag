-- Keytag database
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Everything is read and written by the site's server functions using the
-- service role key. Row Level Security is switched on with no public policies,
-- so nobody can read these tables directly from a browser.

create extension if not exists pgcrypto;

-- People who own tags. One row per login (Supabase auth user).
create table if not exists public.owners (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text,
  email       text not null,
  phone       text not null,            -- E.164, e.g. +447700900123
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists owners_phone_idx on public.owners (phone);

-- Physical tags. Rows are created in bulk by scripts/generate-codes.mjs
-- before the tags are manufactured.
create table if not exists public.tags (
  code          text primary key check (code ~ '^[A-Z0-9]{6}$'),
  claim_key     text,                   -- no longer used (registration is by code only)
  batch         text,
  owner_id      uuid references public.owners (id) on delete set null,
  gift_to_email text,                   -- set while a gift is waiting to be accepted
  activated_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tags_owner_idx on public.tags (owner_id);

-- Every scan or typed-in code. No IP address or location is stored.
create table if not exists public.scans (
  id          bigint generated always as identity primary key,
  tag_code    text not null references public.tags (code) on delete cascade,
  kind        text not null check (kind in ('finder','owner_test','setup')),
  scanned_at  timestamptz not null default now()
);
create index if not exists scans_tag_idx on public.scans (tag_code, scanned_at desc);

-- One conversation per "found keys" report. The finder's phone is optional
-- and is wiped after 90 days by purge_old_data().
create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  tag_code         text not null references public.tags (code) on delete cascade,
  owner_id         uuid references public.owners (id) on delete cascade,
  finder_phone     text,
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
create index if not exists conv_owner_idx  on public.conversations (owner_id, last_activity_at desc);
create index if not exists conv_finder_idx on public.conversations (finder_phone, last_activity_at desc);

create table if not exists public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  direction        text not null check (direction in ('finder_to_owner','owner_to_finder')),
  body             text not null,
  created_at       timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- "Be first in line" launch list.
create table if not exists public.signups (
  email       text primary key,
  created_at  timestamptz not null default now()
);

-- Lock everything down: only the service role (server functions) can touch these.
alter table public.signups       enable row level security;
alter table public.owners        enable row level security;
alter table public.tags          enable row level security;
alter table public.scans         enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Data minimisation: delete messages and finder numbers after 90 days,
-- and scan logs after a year. Schedule it daily (see README) or run by hand.
create or replace function public.purge_old_data() returns void
language sql security definer as $$
  delete from public.messages      where created_at       < now() - interval '90 days';
  update public.conversations set finder_phone = null
                                    where last_activity_at < now() - interval '90 days';
  delete from public.scans         where scanned_at       < now() - interval '365 days';
$$;

-- Registration by code only: rate limits, email lookup, updated purge.
-- (Same as 002-simple-registration.sql.)
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
create table if not exists public.verifications (
  id               uuid primary key default gen_random_uuid(),
  purpose          text not null check (purpose in ('register','phone_change')),
  tag_code         text references public.tags (code) on delete cascade,
  owner_id         uuid references public.owners (id) on delete cascade,
  email            text,
  phone            text,
  label            text,
  email_code_hash  text,
  phone_code_hash  text,
  attempts         int not null default 0,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now()
);
create index if not exists verifications_email_idx on public.verifications (email, created_at desc);
alter table public.verifications enable row level security;

create or replace function public.purge_old_data() returns void
language sql security definer as $$
  delete from public.messages      where created_at       < now() - interval '90 days';
  update public.conversations set finder_phone = null
                                    where last_activity_at < now() - interval '90 days';
  delete from public.scans         where scanned_at       < now() - interval '365 days';
  delete from public.rate_limits   where at               < now() - interval '1 day';
  delete from public.verifications where created_at       < now() - interval '1 day';
$$;
