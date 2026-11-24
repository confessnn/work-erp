# work-erp — 작업 규칙 (Claude Code · Codex 공통)

이 파일이 두 AI의 공통 규칙이다. `CLAUDE.md`는 이 파일을 불러오기만 한다. 규칙을 바꿀 땐 이 파일만 고친다.

## 무엇을 만드는가
개인 강의 업무 ERP. 1차 기능: 강의 일정 입력 → 시간당 강의료로 강의료 계산 → 사업소득 3.3% / 기타소득 8.8% 원천징수 → 수령 체크 → 대시보드(예상·수령·미수령). 사용자는 한국어 사용자 1명. 화면 문구는 모두 한국어.

## 기술 스택
- Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind CSS v4
- Supabase (Postgres + Auth). 프로젝트 ref: `ggisybrvmxjkolzwmlux` (서울 리전)
- 배포: Vercel (GitHub `main` push → 자동 배포)
- 테스트: Vitest (`npm test`)

## 폴더 구조
```
src/
  app/                  라우트만 (얇게 유지)
    (app)/              로그인 후 화면. layout.tsx = 상단 메뉴
    login/, auth/       로그인 · 이메일 인증
  features/<기능>/      기능별 코드 (새 기능은 새 폴더)
    actions.ts          Server Actions (쓰기)
    queries.ts          데이터 읽기 (server-only)
    types.ts            DB 행 타입
    components/         기능 전용 UI
    *.ts + *.test.ts    순수 계산 로직과 테스트
  components/           여러 기능이 같이 쓰는 UI (nav-items.ts = 메뉴 목록, app-nav.tsx = 메뉴 화면)
  lib/                  supabase 클라이언트, 포맷 함수
  proxy.ts              (구 middleware) 세션 갱신 + 비로그인 시 /login
supabase/migrations/    DB 변경 이력 (SQL)
```

## 새 기능 추가 순서
1. DB가 필요하면 `supabase/migrations/<YYYYMMDDHHMMSS>_<이름>.sql` 추가. 새 테이블은 반드시
   `user_id uuid not null default auth.uid() references auth.users on delete cascade` + RLS 4개 정책
   (`lectures` 마이그레이션을 복사해서 시작). 기존 마이그레이션 파일은 절대 수정하지 않는다.
2. `src/features/<기능>/` 폴더에 types → queries → actions → components 순으로 작성.
3. 계산 로직은 순수 함수로 분리하고 `*.test.ts` 작성.
4. 페이지는 `src/app/(app)/<경로>/page.tsx`, 메뉴는 `src/components/nav-items.ts`의 `NAV`에 한 줄 추가 (사용자가 설정 화면에서 순서·숨김을 바꾼다. 새 메뉴는 맨 뒤에 붙는다).
5. `npm test && npm run lint && npm run build` 모두 통과 확인.

## 규칙
- 금액은 원 단위 정수(`integer`). 소수 금액 금지.
- 세금 계산은 `src/features/lectures/tax.ts` 한 곳에서만. 저장 시 서버(actions)에서 다시 계산해 DB에 저장한다(세율이 바뀌어도 과거 기록은 그대로 유지).
- 날짜 '오늘'은 한국 시간 기준(`lib/format.ts`의 `todayInSeoul`).
- DB 접근은 로그인 사용자 권한(publishable key + RLS)으로만. service_role 키를 코드나 저장소에 넣지 않는다.
- 비밀값(.env.local)은 커밋하지 않는다. 공개 키만 `.env.example`에 둔다.
- 서버 비밀값(Vercel 환경변수): `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY`, `BID_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_ADMIN_KEY`, `OPENAI_ADMIN_KEY`, `RESEND_API_KEY`, `BID_NOTIFY_EMAIL`. 목록은 `.env.example` 참고.
- 강의를 쓰는 Server Action(생성·수정·삭제·수령 변경)은 끝에 `schedulePush(supabase)`를 호출해 구글 캘린더에 반영한다.
- 구글 드라이브를 쓰는 기능(서류함·아기 사진)은 서버에서 `features/google-drive/context.ts`의 `driveContext()`를 쓴다. 큰 파일은 브라우저 ↔ 드라이브 직접 전송(`features/documents/drive-browser.ts`).
- 가족 공유(`features/share`)로 나가는 데이터에는 금액을 절대 넣지 않는다. 공유 데이터는 DB 함수 `get_shared_schedule`의 반환 컬럼으로만 정해진다.

## 기능 지도 (먼저 여기서 고칠 폴더를 찾고, 그 폴더만 읽는다)
| 기능 폴더 `src/features/` | 화면 | 하는 일 · 핵심 파일 |
|---|---|---|
| `lectures` | `/lectures` (첫 화면 달력, `view=list`면 목록) · `/lectures/[id]` | 강의 일정·강의료·세금(`tax.ts`)·수령. 달력 `components/lecture-calendar.tsx`, 수령 가능 판단 `paid-selection.ts`(강의료 0원이면 수령 불가) |
| `dashboard` | `/` | 요약 계산 `summary.ts`. 이번 달 달력은 `LectureCalendar` 재사용 |
| `family` | `/family*`, `/join/[token]` | 가족(아내) 계정·가족 일정·아내 구글 iCal 가져오기(`import.ts`, `auto-import.ts`). 사람 색·이름은 `types.ts`의 `PERSONS` 한 곳 |
| `calendar-import` | `/lectures/import` | 구글 '강의 일정(ERP)' iCal → 강의 불러오기. 회차 uid는 `uid#날짜`(`ics.ts`의 `occurrenceKey`), 구글에서 지운 일정 정리(`sync.ts`의 `planRemovals`) |
| `google-calendar` | `/integrations` | ERP → 구글 반영 `push.ts`(만든 강의 생성·수정·삭제, 불러온 강의 수정·삭제는 `google_import_dirty`·`google_import_deletes`). 권한은 `calendar.app.created`라 ERP 캘린더 일정만 고칠 수 있음 |
| `reminders` | 일정 화면의 🔔 | 웹 푸시 1시간 전 알림. Supabase pg_cron `erp-reminders` → `/api/cron/reminders` |
| `telegram` | `/integrations` | `@work_erp_bot` 아침 요약·알림·일정 빠른 추가(`quick-add.ts`) |
| `baby` | `/baby` (메뉴 '임채현') | 사진·동영상을 대표 계정 드라이브에 날짜별 저장. 아내도 보기·올리기(`drive.ts`의 `babyDriveContext`), 원본·재생 `app/(app)/baby/photo/[id]/route.ts`(동영상은 Range 4MB씩) |
| `baby-care` | `/baby/care`·`/baby/pattern`·`/baby/growth`·`/baby/todos` (메뉴 '임채현') | 육아 기록 `baby_logs`(가족 공용, 요약 `care.ts`), 패턴 `pattern.ts`, 성장 백분위 `growth.ts`+`who-lms.ts`(WHO 표, 서버 전용), 아기 할 일 `baby_todos`(부부 공용 한 건, 할 일 위젯·아침 알림에도 표시). 링크 모음 `baby_links`(서버가 사이트를 읽고 `link-reader.ts`에서 Claude로 짧은 설명, 내부망 주소 차단). 아기 정보는 `set_family_baby_info`로 아내도 수정 |
| `documents` · `google-drive` | `/documents` | 서류함·강의별 제출 서류(드라이브). 큰 파일은 브라우저→드라이브 직접(`drive-browser.ts`) |
| `bid-inbox` · `bid-viewer` | `/bids*`, `/join/bids/[token]` | 나라장터·국방전자조달 등 공고 수신(`fetch-all.ts`), 판정, 입찰가 계산기, 아침 메일(`morning.ts`), 동생용 열람 |
| `records` | `/records*` | 수업 기록·관계도 그래프 |
| `brain` | `/brain`·`/brain/note/[id]`·`/brain/graph` (메뉴 '세컨드브레인') | 옵시디언 볼트(구글 드라이브 폴더) 보기. '동기화'로 .md 를 `brain_notes`에 사본 저장(`sync.ts`의 `planSync`), PARA·[[링크]]·태그 `vault.ts`, 본문 그리기 `markdown.ts`(HTML 안 만듦), 그래프 `graph.ts`. ERP 기록 → 볼트 'ERP 기록' 폴더 .md(`export.ts`, 금액 없음), 대시보드 할 일 → 'ERP 기록/할 일/<날짜>.md'(`todo-notes.ts`, 할 일 Server Action 끝에 `scheduleTodoExport()`). 빠른 메모 → 볼트 Inbox .md(`memo.ts`, `service.ts`의 `saveMemo`, 못 쓰는 볼트면 'ERP 기록/메모'). 서버 작업은 `service.ts`. 읽기는 `drive.readonly`, 쓰기는 ERP가 만든 폴더만(`drive.file`) |
| `todos` | 대시보드 위젯 | 할 일 (`title`, `due_date`, `note`) |
| `content` | `/content` | X·노션 콘텐츠 자동화 (크론 `content`) |
| `share` | `/share-settings` | 가족 공유 링크·iCal 내보내기(금액 없음, `get_shared_schedule`) |
| `api-credits` | 대시보드 카드 | Claude·OpenAI API 잔액 추정 |
| `settings` | `/settings` (상단 ⚙) | 설정(관리자): 상단 메뉴 순서·숨김 `user_settings.nav_prefs`, 적용 `components/nav-items.ts`의 `applyNavPrefs` |
| `backup` | `/settings` 백업 · 크론 `backup` | 기록을 JSON 하나로 모아 대표 드라이브 `work-erp/백업/<YYYY-MM>/`에 주차별로 쌓음(지우지 않음, 이름·주차 규칙 `backup.ts`). 담을 표·뺄 칸(토큰·`ics_url`·`thumb`·`share_url`)은 DB `private.backup_dump` 한 곳. 새 표를 만들면 거기에 추가. 결과는 `backup_status`, 실패·8일 밀림은 아침 7시 브리핑(`bid-digest`) 맨 위에 경고(`backupProblem`) |
| `plan-usage` | (숨김) | 플랜 사용량 위젯. 사용자가 나중에 다시 켜기로 해서 일부러 남겨 둠 — 지우지 않는다 |

- 크론(Vercel, UTC): `calendar-sync`·`bid-sync` 21:00, `bid-digest`·`api-credits` 22:00, `content` 23:30, `backup` 일요일 18:00(한국 월요일 03:00). 5분 간격 알림만 Supabase pg_cron.
- 가족 데이터는 `my_family()`(가족을 만든 사람 uid) 기준 RLS. 대표 계정 비밀값이 필요한 서버 작업은 `CRON_SECRET`으로 잠근 DB 함수(`cron_*`, `family_owner_drive`)를 쓴다.

## 토큰을 아끼는 작업 방법
- 위 기능 지도로 폴더를 고른 뒤 그 폴더만 읽는다. 저장소 전체 검색·전체 파일 읽기는 피한다.
- 테스트는 바뀐 폴더만 먼저: `npx vitest run src/features/<기능>`. 마지막에 `npx tsc --noEmit`·`npx eslint <바뀐 파일>`·전체 `npm test`.
- `gh` CLI가 없다. PR 만들기·합치기는 브라우저(GitHub)로 하고, 합치기는 사용자가 "합쳐줘"라고 한 뒤에만.
- DB 변경은 새 마이그레이션 파일 + Supabase에 적용하고, PR 본문에 "적용함"을 적는다.
- 큰 파일 수정은 `Edit`(바뀌는 부분만)으로. 같은 파일을 다시 통째로 읽지 않는다.

## Git 협업
- `main`에 직접 push하지 않는다. 작업 브랜치 → PR → 합치기.
- 브랜치 이름: Claude는 `claude/<기능>`, Codex는 `codex/<기능>`.
- 커밋 메시지: `feat: …`, `fix: …`, `docs: …`, `refactor: …`, `test: …` (한국어 설명 가능).
- 한 PR에는 한 기능만. PR 본문에 무엇을/왜/어떻게 확인했는지 적는다.
- DB 마이그레이션이 있는 PR은 본문에 반드시 명시한다 (Supabase에 적용해야 하므로).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
