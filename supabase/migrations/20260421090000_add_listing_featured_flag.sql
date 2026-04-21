alter table public.listings
add column if not exists featured boolean not null default false;

update public.listings
set
  featured = true,
  status = 'For Sale'
where status = 'Featured';

create index if not exists listings_featured_idx
on public.listings (featured)
where featured = true;
