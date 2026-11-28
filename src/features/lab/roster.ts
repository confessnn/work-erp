import type { Researcher, ResearcherState } from "./types";

/**
 * 연구소 명단.
 *
 * 소장(사용자)은 넣지 않는다 — 명단은 '일을 맡기는 대상'만 담는다.
 * 연구원은 ERP 안에서 도는 것이 아니라 Claude Code 세션·예약 작업이므로, 이 화면은 지금 누가
 * 무슨 일을 맡고 있는지 보여 주기만 한다 (상태를 ERP가 실시간으로 읽어 오지는 않는다).
 *
 * 얼굴 그림은 public/lab/<id>.png. 몸 그림과 연구실 배경은 구글드라이브 work-erp/연구소 에 있다.
 */
export const ROSTER: Researcher[] = [
  {
    id: "chief",
    name: "실장",
    duty: "전체 업무 조율·총괄",
    model: "Opus",
    state: "운영중",
    note: "Claude Code 주 세션. 말을 거는 창구",
  },
  {
    id: "scout",
    name: "공고 감시",
    duty: "나라장터 원가 용역 공고 수집·1차 판정",
    model: "Haiku",
    state: "준비",
    note: "매일 도는 예약 작업으로 만들면 바로 시작",
  },
  {
    id: "cost",
    name: "원가 용역",
    duty: "공고 분석 · 투찰가 · 견적·착수계 · 제안서·보고서",
    model: "Opus",
    state: "준비",
    note: "공고 하나당 세션 하나로 끝까지 맡는다",
  },
  {
    id: "dev",
    name: "개발",
    duty: "work-erp · 배치 시뮬레이터",
    model: "Opus",
    state: "운영중",
    note: "지금은 실장이 겸임",
  },
  {
    id: "content",
    name: "콘텐츠",
    duty: "ERP 콘텐츠 자동 제작",
    model: "미정",
    state: "예정",
    note: "자리만 만들어 둠. 아직 연결하지 않았다",
  },
  {
    id: "spare",
    name: "예비",
    duty: "맡길 일이 생기면 배정",
    model: "미정",
    state: "예정",
    note: "그림에만 있는 빈 자리",
  },
];

/** 얼굴 아이콘 주소 */
export const iconOf = (id: string) => `/lab/${id}.png`;

/** 보여 주는 차례: 지금 일하는 사람이 위로 */
export const STATE_ORDER: ResearcherState[] = ["운영중", "준비", "예정"];

/** 상태 차례대로 (같은 상태면 명단 순서 그대로) */
export function sortByState(list: Researcher[]): Researcher[] {
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => STATE_ORDER.indexOf(a.r.state) - STATE_ORDER.indexOf(b.r.state) || a.i - b.i)
    .map(({ r }) => r);
}

/** 상태별 인원 (화면 위 한 줄 요약) */
export function countByState(list: Researcher[]): Record<ResearcherState, number> {
  const out: Record<ResearcherState, number> = { 운영중: 0, 준비: 0, 예정: 0 };
  for (const r of list) out[r.state]++;
  return out;
}
