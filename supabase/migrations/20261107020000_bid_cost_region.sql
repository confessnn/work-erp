-- 원가계산 공고는 지역 제한이 없거나 충북 전체·청주·전국인 것만 받는다.
-- 이미 저장된 공고 중 조건에 맞지 않는 것을 지운다 (src/features/bid-inbox/judge.ts의 costRegionOk와 같은 기준)
delete from public.bid_notices n
where n.category = 'cost'
  and n.region_limit is not null
  and not exists (
    select 1
    from unnest(string_to_array(n.region_limit, ',')) as r
    where r ~ '청주|전국' or btrim(r) in ('충북', '충청북도')
  );
