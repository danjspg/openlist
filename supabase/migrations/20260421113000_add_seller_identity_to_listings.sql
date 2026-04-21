alter table public.listings
  add column if not exists seller_name text,
  add column if not exists seller_phone text;
