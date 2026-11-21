-- 가족 구성원(아내)도 아기 사진 날짜 바꾸기·삭제
drop policy "baby_photos_update_own" on public.baby_photos;
drop policy "baby_photos_delete_own" on public.baby_photos;
create policy "baby_photos_update_family" on public.baby_photos
  for update to authenticated using (user_id = (select public.my_family())) with check (user_id = (select public.my_family()));
create policy "baby_photos_delete_family" on public.baby_photos
  for delete to authenticated using (user_id = (select public.my_family()));
