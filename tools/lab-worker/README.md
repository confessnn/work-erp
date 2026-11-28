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

**남은 건 하나뿐이다 — Claude Code CLI 로그인.**

```bash
claude auth login
```

데스크톱 앱에 로그인돼 있어도 CLI 는 따로 로그인해야 한다(앱과 자격 증명을 나눠 갖지 않는다).
로그인하면 구독 계정으로 돌아가 API 요금이 따로 나가지 않는다. 로그인 전에는 워커가 일을
집어 가지 않고 기다리므로, 먼저 켜 두어도 지시가 실패로 적히지 않는다.

### 이미 돼 있는 것

| 무엇 | 어디 |
| --- | --- |
| 설정 파일 (권한 600) | `~/.config/lab-worker/config.json` |
| 작업 폴더 | `~/연구소작업/` (연구원마다 그 아래 자기 폴더) |
| 워커 전용 비밀값 | 해시만 `private.app_secrets` 의 `name='lab_worker'` |
| 자동 시작 파일 | `~/Library/LaunchAgents/com.work-erp.lab-worker.plist` (아직 올리지 않음) |

비밀값은 **`CRON_SECRET` 과 다른 값**이다. 워커 쪽이 새더라도 연구소 함수만 열리고 크론
함수(캘린더·백업·공고)는 그대로 잠겨 있게 하려고 따로 만들었다. 바꾸려면 새 임의 문자열(32자 이상)을
만들어 설정 파일에 넣고, 그 sha256 을 `private.app_secrets` 의 `lab_worker` 행에 넣으면 된다.

### 돌리기

```bash
node tools/lab-worker/worker.mjs
```

맥을 켜면 저절로 돌게 하려면:

```bash
launchctl load ~/Library/LaunchAgents/com.work-erp.lab-worker.plist
```

멈추려면 `launchctl unload` 로 같은 파일을 내린다. 기록은 `~/Library/Logs/lab-worker.log`.

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
