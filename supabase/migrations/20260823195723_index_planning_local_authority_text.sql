create index if not exists planning_applications_local_authority_trgm_idx
on public.planning_applications using gin (local_authority gin_trgm_ops)
where local_authority is not null;
