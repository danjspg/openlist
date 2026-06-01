create extension if not exists pgcrypto;

create table if not exists public.viewings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid null,
  listing_title text null,
  listing_url text null,
  listing_image text null,
  viewer_name text not null,
  viewer_email text not null,
  viewer_phone text null,
  contact_name text not null,
  contact_email text not null,
  contact_phone text null,
  property_location text not null,
  viewing_starts_at timestamp with time zone not null,
  notes text null,
  send_confirmation_to_viewer boolean not null default true,
  send_confirmation_to_seller boolean not null default true,
  send_reminder_to_viewer boolean not null default true,
  send_reminder_to_seller boolean not null default true,
  status text not null default 'scheduled',
  reminder_sent_at timestamp with time zone null,
  cancelled_at timestamp with time zone null,
  constraint viewings_status_check
    check (status in ('scheduled', 'cancelled', 'completed'))
);

alter table public.viewings
  add column if not exists send_confirmation_to_viewer boolean not null default true,
  add column if not exists send_confirmation_to_seller boolean not null default true,
  add column if not exists send_reminder_to_viewer boolean not null default true,
  add column if not exists send_reminder_to_seller boolean not null default true;

create index if not exists viewings_owner_user_id_starts_at_idx
  on public.viewings (owner_user_id, viewing_starts_at);

create index if not exists viewings_reminder_due_idx
  on public.viewings (viewing_starts_at)
  where status = 'scheduled' and reminder_sent_at is null;

create or replace function public.set_viewings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_viewings_updated_at on public.viewings;
create trigger set_viewings_updated_at
before update on public.viewings
for each row
execute function public.set_viewings_updated_at();

alter table public.viewings enable row level security;

drop policy if exists "Sellers can read their viewings" on public.viewings;
create policy "Sellers can read their viewings"
on public.viewings
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "Sellers can create their viewings" on public.viewings;
create policy "Sellers can create their viewings"
on public.viewings
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "Sellers can update their viewings" on public.viewings;
create policy "Sellers can update their viewings"
on public.viewings
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

grant select, insert, update on table public.viewings to authenticated;
grant select, insert, update, delete on table public.viewings to service_role;
