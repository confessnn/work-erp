import { isCostNotice, judgeCost, judgeHanil, type JudgeInput } from "./judge";
import type { BidCategory, BidMatch, BidVerdict } from "./types";

type Search = { params: Record<string, string>; matchedBy: BidMatch };

export type CategoryDef = {
  key: BidCategory;
  label: string;
  /** 조달청 입찰공고정보서비스 오퍼레이션 (용역·공사가 다르다) */
  operation: string;
  /** 앞의 검색이 우선한다. 같은 공고가 업종·공고명 양쪽에 잡히면 앞쪽 결과를 쓴다 */
  searches: Search[];
  accept: (title: string) => boolean;
  judge: (input: JudgeInput) => { verdict: BidVerdict; reason: string };
};

const keyword = (word: string): Search => ({ params: { bidNtceNm: word }, matchedBy: "keyword" });

export const CATEGORIES: CategoryDef[] = [
  {
    key: "cost",
    label: "원가계산",
    operation: "getBidPblancListInfoServcPPSSrch",
    searches: [keyword("원가")],
    accept: isCostNotice,
    judge: judgeCost,
  },
  {
    key: "hanil",
    label: "한일ENG",
    operation: "getBidPblancListInfoCnstwkPPSSrch",
    // 공고명만으로는 놓치는 공사가 많아('보수공사', '개선사업' 등) 업종을 기본으로 찾는다
    searches: [
      { params: { indstrytyNm: "도장ㆍ습식ㆍ방수ㆍ석공사업" }, matchedBy: "industry" },
      keyword("방수"),
      keyword("도장"),
    ],
    accept: () => true,
    judge: judgeHanil,
  },
];

export const CATEGORY_LABEL: Record<BidCategory, string> = { cost: "원가계산", hanil: "한일ENG" };
