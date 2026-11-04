-- 서류함에서 일정 없이도 제출(압축·공유)할 수 있도록
alter table public.document_submissions alter column lecture_id drop not null;
-- 공유 링크를 일정(메모·구글 캘린더 일정)에 붙였는지
alter table public.document_submissions add column attached_to_lecture boolean not null default false;
