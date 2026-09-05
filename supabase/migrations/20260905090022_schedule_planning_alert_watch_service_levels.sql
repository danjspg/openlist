do $$
begin
  if exists (select 1 from cron.job where jobname = 'openlist-planning-alert-watch-fast') then
    perform cron.unschedule('openlist-planning-alert-watch-fast');
  end if;
  if exists (select 1 from cron.job where jobname = 'openlist-planning-alert-watch-standard') then
    perform cron.unschedule('openlist-planning-alert-watch-standard');
  end if;
end $$;

select cron.schedule(
  'openlist-planning-alert-watch-fast',
  '1,6,11,16,21,26,31,36,41,46,51,56 * * * *',
  $$
  select net.http_post(
    url := 'https://openlist.ie/api/internal/planning-alert-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-openlist-cron-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'planning_alert_delivery_cron_token'
      )
    ),
    body := jsonb_build_object('serviceLevel', 'fast'),
    timeout_milliseconds := 240000
  );
  $$
);

select cron.schedule(
  'openlist-planning-alert-watch-standard',
  '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
  $$
  select net.http_post(
    url := 'https://openlist.ie/api/internal/planning-alert-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-openlist-cron-token', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'planning_alert_delivery_cron_token'
      )
    ),
    body := jsonb_build_object('serviceLevel', 'standard'),
    timeout_milliseconds := 240000
  );
  $$
);
