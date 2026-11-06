import { describe, expect, it } from "vitest";
import { isCostNotice, judgeCost, judgeHanil, type JudgeInput } from "./judge";

const base: JudgeInput = { contractMethod: null, awardMethod: null, regionLimit: null, presumedPrice: null, matchedBy: "industry" };

describe("isCostNotice", () => {
  it("원가 용역 공고를 고른다", () => {
    expect(isCostNotice("2027년 정수기 유지관리 용역 원가계산 용역")).toBe(true);
    expect(isCostNotice("적정 원가 산정 연구")).toBe(true);
  });
  it("창원가·지원가 같은 오탐을 뺀다", () => {
    expect(isCostNotice("창원가로수 정비 용역")).toBe(false);
    expect(isCostNotice("다문화 원가족 지원 사업")).toBe(false);
    expect(isCostNotice("창원가로수 원가계산 용역")).toBe(true);
  });
});

describe("judgeCost", () => {
  it("일반경쟁은 가능", () => {
    expect(judgeCost({ ...base, contractMethod: "일반경쟁" }).verdict).toBe("possible");
  });
  it("협상에 의한 계약은 가능", () => {
    expect(judgeCost({ ...base, awardMethod: "협상에 의한 계약" }).verdict).toBe("possible");
  });
  it("제한경쟁은 자격 확인", () => {
    expect(judgeCost({ ...base, contractMethod: "제한경쟁", awardMethod: "협상에 의한 계약" }).verdict).toBe("check");
  });
  it("충북 외 지역 제한은 불가", () => {
    expect(judgeCost({ ...base, contractMethod: "제한경쟁", regionLimit: "서울특별시" }).verdict).toBe("impossible");
  });
  it("충북 지역 제한은 불가가 아니다", () => {
    expect(judgeCost({ ...base, contractMethod: "제한경쟁", regionLimit: "충청북도" }).verdict).toBe("check");
  });
  it("수의계약은 해당 없음", () => {
    expect(judgeCost({ ...base, contractMethod: "수의계약" }).verdict).toBe("na");
  });
  it("정보가 없으면 확인 필요", () => {
    expect(judgeCost(base).verdict).toBe("check");
  });
});

describe("judgeHanil", () => {
  it("7억 원까지는 가능, 넘으면 불가", () => {
    expect(judgeHanil({ ...base, contractMethod: "일반경쟁", presumedPrice: 700_000_000 }).verdict).toBe("possible");
    expect(judgeHanil({ ...base, contractMethod: "일반경쟁", presumedPrice: 700_000_001 }).verdict).toBe("impossible");
  });
  it("수의계약도 투찰 대상", () => {
    expect(judgeHanil({ ...base, contractMethod: "수의계약" }).verdict).toBe("possible");
  });
  it("충남·전국 외 지역 제한은 불가", () => {
    expect(judgeHanil({ ...base, contractMethod: "제한경쟁", regionLimit: "경기도" }).verdict).toBe("impossible");
    expect(judgeHanil({ ...base, contractMethod: "제한경쟁", regionLimit: "충청남도" }).verdict).toBe("check");
    expect(judgeHanil({ ...base, contractMethod: "일반경쟁", regionLimit: "전국" }).verdict).toBe("possible");
  });
  it("충남 안에서도 다른 시·군으로 좁힌 제한은 불가", () => {
    expect(judgeHanil({ ...base, contractMethod: "수의계약", regionLimit: "충청남도 계룡시" }).verdict).toBe("impossible");
    expect(judgeHanil({ ...base, contractMethod: "수의계약", regionLimit: "충청남도 천안시" }).verdict).toBe("possible");
    expect(judgeHanil({ ...base, contractMethod: "수의계약", regionLimit: "충청남도 계룡시, 충청남도" }).verdict).toBe("possible");
  });
  it("공고명으로만 찾으면 업종 확인", () => {
    const r = judgeHanil({ ...base, contractMethod: "일반경쟁", matchedBy: "keyword" });
    expect(r.verdict).toBe("check");
    expect(r.reason).toContain("업종");
  });
});
