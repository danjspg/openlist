alter policy "Sellers can read their viewings" on public.viewings
  using (owner_user_id = (select auth.uid()));
alter policy "Sellers can create their viewings" on public.viewings
  with check (owner_user_id = (select auth.uid()));
alter policy "Sellers can update their viewings" on public.viewings
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));
