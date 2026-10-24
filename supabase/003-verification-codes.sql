-- Update 3: 6-digit codes to confirm email (and mobile, once texts are live).
-- Run once in Supabase → SQL Editor. Safe to run more than once.

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
