alter table public.planning_seo_notable
  add column if not exists description_checked_at timestamptz;

create index if not exists planning_seo_notable_description_checked_at_idx
  on public.planning_seo_notable (description_checked_at)
  where active is true and priority_eligible is true;
