create table if not exists public.planning_notable_press_seen (
  story_key text primary key,
  title text not null,
  publisher text,
  url text,
  published_at timestamptz,
  outcome text not null,
  application_id uuid references public.planning_applications(id) on delete set null,
  candidate text,
  score numeric,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists planning_notable_press_seen_published_idx
  on public.planning_notable_press_seen (published_at desc);

alter table public.planning_notable_press_seen enable row level security;
