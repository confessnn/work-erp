-- 5분마다 일정 알림 보내기 (/api/cron/reminders). Vercel 무료 크론은 하루 1번이라 Supabase pg_cron 을 쓴다.
-- 비밀값은 Vault 의 reminder_secret (20261108020000_event_reminders.sql 에서 생성). 배포 뒤에 적용한다.
select cron.schedule(
  'erp-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://work-erp-one.vercel.app/api/cron/reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);
