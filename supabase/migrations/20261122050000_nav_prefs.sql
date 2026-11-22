-- 상단 메뉴 순서·숨김 (설정 화면). [{"href": "/lectures", "hidden": false}, ...] 순서대로.
-- 목록에 없는 새 메뉴는 화면에서 뒤에 붙는다. 비우면(null) 기본 순서.
alter table public.user_settings
  add column nav_prefs jsonb check (nav_prefs is null or (jsonb_typeof(nav_prefs) = 'array' and jsonb_array_length(nav_prefs) <= 50));
