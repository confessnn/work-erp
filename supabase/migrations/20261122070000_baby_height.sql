-- 육아 기록: 몸무게 기록에 키(cm)를 같이 적는다 (몸무게만·키만·둘 다)
alter table public.baby_logs add column height_cm numeric(5, 1)
  check (height_cm is null or height_cm between 0 and 200);
