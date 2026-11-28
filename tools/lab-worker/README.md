# 연구소 워커

ERP의 **연구소**(`/lab`)에서 맡긴 일을 가져와 이 맥에서 Claude 로 처리하고, 결과를 보드에 돌려놓는다.

```
폰·PC 브라우저 → ERP 팝업에 지시 → lab_tasks 에 'queued'
                                        ↓  워커가 3초마다 집어 간다
                              맥에서 claude -p 실행 (연구원별 모델·도구)
                                        ↓  결과를 적는다
                                 보드의 '확인 대기' 칸
```

맥이 꺼져 있으면 지시는 쌓여 있다가 켤 때 처리된다. 켜져 있던 중 끊긴 일은 워커가 다시 켜질 때 `맡긴 일`로 되돌린다.

## 준비

**1. Claude Code CLI 로그인** (한 번만)

```bash
claude auth login
```

데스크톱 앱에 로그인돼 있어도 CLI 는 따로 로그인해야 한다. 로그인하면 구독 계정으로 돌아가므로 API 요금이 따로 나가지 않는다.

**2. 설정 파일**

`CRON_SECRET` 이 들어가므로 저장소가 아니라 홈 폴더에 둔다.

```bash
mkdir -p ~/.config/lab-worker
cp tools/lab-worker/config.example.json ~/.config/lab-worker/config.json
```

채울 것 두 가지:

| 칸 | 어디서 |
| --- | --- |
| `cronSecret` | Vercel 환경변수 `CRON_SECRET` 과 같은 값 |
| `userId` | 내 계정 uuid (Supabase → Authentication → Users) |

`workDir` 는 연구원이 파일을 만드는 폴더다. 연구원마다 그 아래 자기 폴더(`~/연구소작업/cost/` 등)를 쓴다.

**3. 돌려 보기**

```bash
node tools/lab-worker/worker.mjs
```

ERP 연구소에서 아무 연구원에게 일을 맡기면 몇 초 안에 `진행 중` → `확인 대기` 로 바뀐다.

**4. 맥을 켜면 저절로 돌게 (선택)**

`com.work-erp.lab-worker.plist` 안의 `<내홈>` 두 곳을 실제 경로로 바꾼 뒤:

```bash
cp tools/lab-worker/com.work-erp.lab-worker.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.work-erp.lab-worker.plist
```

기록은 `~/Library/Logs/lab-worker.log`.

## 연구원마다 다른 설정

`plan.mjs` 한 곳에서 정한다.

| 연구원 | 모델 | 효율 | 쓸 수 있는 도구 |
| --- | --- | --- | --- |
| 실장 chief | opus | high | 읽기·쓰기·고치기 |
| 공고 감시 scout | haiku | medium | 읽기·쓰기 + 웹 |
| 원가 용역 cost | opus | high | 읽기·쓰기·고치기 + 웹 |
| 개발 dev | opus | high | 읽기·쓰기·고치기 |
| 콘텐츠 content | sonnet | medium | 읽기·쓰기·고치기 |
| 예비 spare | sonnet | medium | 읽기·쓰기·고치기 |

## 안전하게 둔 것

- **Bash 는 아무에게도 주지 않는다.** 웹에서 들어온 문장을 맥에서 돌리는 구조라 처음에는 좁게 둔다. 필요해지면 `plan.mjs` 에서 연구원 하나씩 넓힌다.
- **연구원은 자기 작업 폴더 안에서만 돈다** (`cwd` 를 그 폴더로 두고 `--add-dir` 를 주지 않는다). 폴더 이름은 영문·숫자만 받아 경로를 벗어나지 못한다.
- **service_role 키를 쓰지 않는다.** `CRON_SECRET` 으로 잠근 DB 함수(`cron_lab_*`)로만 닿는다. 공개 키(`publishableKey`)는 노출돼도 되는 값이고, 그것만으로는 아무것도 못 읽는다.
- **한 건에 15분**이 넘으면 끊고 '시간이 넘었다'를 결과로 적는다.
- 지시를 넣을 수 있는 사람은 RLS 때문에 본인뿐이다.
