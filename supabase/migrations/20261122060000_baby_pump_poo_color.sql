-- 육아 기록: '유축'(엄마가 짠 양, 아기 수유량에는 안 넣음) 종류와 대변 색 추가.
alter table public.baby_logs drop constraint baby_logs_kind_check;
alter table public.baby_logs add constraint baby_logs_kind_check check (kind in (
  'formula', 'breast', 'pumped', 'pump', 'diaper', 'sleep', 'weight', 'medicine',
  'bath', 'hospital', 'water', 'solid', 'temperature', 'other'
));

-- 대변 색: 노랑·갈색·짙은 갈색·초록·빨강·회백색
alter table public.baby_logs add column poo_color text
  check (poo_color is null or poo_color in ('yellow', 'brown', 'dark', 'green', 'red', 'white'));

-- 전에 '기타'로 넣어 둔 유축 기록("유축 50ml", "양쪽 유축 50ml (…)")을 유축 종류로 옮긴다
update public.baby_logs
set kind = 'pump',
    amount_ml = substring(label from '(\d+)\s*ml')::int,
    side = case when label like '양쪽%' then 'both' end,
    note = case when label like '%(%' then concat_ws(' ', note, substring(label from '\((.*)\)')) else note end,
    label = null
where kind = 'other' and label ~ '^(양쪽 )?유축 \d+\s*ml';

-- 메모로 적어 둔 '녹색 변'을 대변 색으로 옮긴다
update public.baby_logs set poo_color = 'green', note = null
where kind = 'diaper' and diaper in ('poo', 'both') and note = '녹색 변';
