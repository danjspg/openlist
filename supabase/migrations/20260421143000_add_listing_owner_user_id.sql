alter table public.listings
  add column if not exists owner_user_id uuid references auth.users(id);

create index if not exists listings_owner_user_id_idx
  on public.listings (owner_user_id);
