# work-erp

강의 일정과 강의료를 관리하는 개인 ERP.

- 일정 입력 (날짜·시간·기관·시간당 강의료) → 강의료 자동 계산
- 소득 구분 선택: 사업소득 3.3% / 기타소득 8.8% 원천징수 (원단위 절사, 소액 면제 선택)
- 수령 체크 (수령일·실제 받은 금액)
- 대시보드: 총 강의료 · 예상 수령액 · 수령한 금액 · 미수령 금액, 월별/연도별, 소득 구분별

## 로컬 실행
```bash
npm install
cp .env.example .env.local
npm run dev
```

## 검사
```bash
npm test && npm run lint && npm run build
```

개발 규칙은 [AGENTS.md](./AGENTS.md) 참고 (Claude Code · Codex 공통).
