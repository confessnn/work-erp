# 플랜 사용량 보고 스크립트

Claude·Codex 구독의 5시간·주간 한도는 서버에서 읽을 수 없어, 이 PC에서 읽어 ERP로 보낸다.

| 파일 | 하는 일 | 실행 |
|---|---|---|
| `claude-statusline.mjs` | Claude Code 상태줄 입력의 `rate_limits`를 표시하고 전송 | Claude Code `statusLine` 설정 |
| `codex-report.mjs` | Codex app-server의 `account/rateLimits/read`를 읽어 전송 | Windows 작업 스케줄러 15분 간격 |

## 설치 위치

`%USERPROFILE%\.work-erp\`에 `*.mjs`를 복사한다. 저장소 브랜치를 바꿔도 동작이 변하지 않게 하기 위해서다.
같은 폴더의 `plan-usage.json`에 Supabase 주소, 공개 키, 토큰을 둔다. 이 파일은 저장소에 넣지 않는다.
DB의 `private.plan_usage_tokens`에는 토큰의 sha256과 사용자만 저장한다.

## 제거

1. `~/.claude/settings.json`에서 `statusLine`을 지운다.
2. 작업 스케줄러에서 `work-erp-codex-usage`를 지운다.
3. `%USERPROFILE%\.work-erp\` 폴더를 지우고, DB의 토큰 행을 지운다.
