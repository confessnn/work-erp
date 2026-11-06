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
  components/           여러 기능이 같이 쓰는 UI (app-nav.tsx = 메뉴 목록)
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
4. 페이지는 `src/app/(app)/<경로>/page.tsx`, 메뉴는 `src/components/app-nav.tsx`의 `NAV`에 한 줄 추가.
5. `npm test && npm run lint && npm run build` 모두 통과 확인.

## 규칙
- 금액은 원 단위 정수(`integer`). 소수 금액 금지.
- 세금 계산은 `src/features/lectures/tax.ts` 한 곳에서만. 저장 시 서버(actions)에서 다시 계산해 DB에 저장한다(세율이 바뀌어도 과거 기록은 그대로 유지).
- 날짜 '오늘'은 한국 시간 기준(`lib/format.ts`의 `todayInSeoul`).
- DB 접근은 로그인 사용자 권한(publishable key + RLS)으로만. service_role 키를 코드나 저장소에 넣지 않는다.
- 비밀값(.env.local)은 커밋하지 않는다. 공개 키만 `.env.example`에 둔다.
- 서버 비밀값(Vercel 환경변수): `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_KEY`, `BID_API_KEY`, `ANTHROPIC_API_KEY`. 목록은 `.env.example` 참고.
- 강의를 쓰는 Server Action(생성·수정·삭제·수령 변경)은 끝에 `schedulePush(supabase)`를 호출해 구글 캘린더에 반영한다.
- 구글 드라이브를 쓰는 기능(서류함·아기 사진)은 서버에서 `features/google-drive/context.ts`의 `driveContext()`를 쓴다. 큰 파일은 브라우저 ↔ 드라이브 직접 전송(`features/documents/drive-browser.ts`).
- 가족 공유(`features/share`)로 나가는 데이터에는 금액을 절대 넣지 않는다. 공유 데이터는 DB 함수 `get_shared_schedule`의 반환 컬럼으로만 정해진다.

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
