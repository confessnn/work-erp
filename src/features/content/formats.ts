// 콘텐츠 초안 형식 (화면과 서버가 함께 씀)
export type DraftFormat = "blog" | "shorts" | "cards" | "thread";
export const DRAFT_FORMATS: { v: DraftFormat; label: string; guide: string }[] = [
  { v: "blog", label: "블로그 글", guide: "제목, 도입, 소제목 3~5개, 마무리로 된 1,500자 안팎의 블로그 글" },
  { v: "shorts", label: "쇼츠 대본", guide: "60초 안팎 세로 영상 대본. [장면] 설명과 내레이션을 번갈아, 첫 3초 훅 포함" },
  { v: "cards", label: "카드뉴스", guide: "카드 6~8장. 각 카드에 '카드 N' 머리와 한두 줄 문구" },
  { v: "thread", label: "X 스레드", guide: "한국어 X 스레드 5~8개 글. 각 글 280자 이내, 1/n 번호" },
];

