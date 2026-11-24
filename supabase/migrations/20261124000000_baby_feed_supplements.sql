-- 육아 기록: 분유·유축수유에 같이 넣은 영양제 (철분제·유산균). 메모 대신 버튼으로 체크한다.
alter table public.baby_logs add column supplements text[] not null default '{}'
  check (supplements <@ array['iron', 'probiotic']::text[]);
