/** 연구소 연구원 한 명. DB 행이 아니라 화면에만 쓰는 고정 명단이다. */
export type ResearcherState = "운영중" | "준비" | "예정";

export type Researcher = {
  /** 아이콘 파일 이름이기도 하다 (public/lab/<id>.png) */
  id: string;
  /** 호칭 */
  name: string;
  /** 맡은 일 */
  duty: string;
  /** 붙여 둔 모델 */
  model: string;
  state: ResearcherState;
  /** 지금 어떤 상태인지 한 줄 */
  note: string;
};
