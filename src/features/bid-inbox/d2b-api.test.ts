import { describe, expect, it } from "vitest";
import { cleanList, costAwardText, costKey, parseXml, toD2bCostNotice, toD2bNotice } from "./d2b-api";

const LIST = {
  pblancNo: "MCS0155",
  pblancOdr: "1",
  cntrwkNm: "26-00대대 생활관 개선공사",
  ornt: "국방부계룡대근무지원단",
  opengDt: "202611051030",
};
// 실제 응답에서 가져온 값
const DETAIL = {
  areaLmttList: "[44000] 충청남도",
  lcnsLmttList: "[4992] 도장ㆍ습식ㆍ방수ㆍ석공사업",
  estmPrce: "55711818",
  cntrctMth: "수의계약",
  sucbidrDecsnMth: "최저가격제",
  lc: "부남리",
};
const CLOSES = "2026-11-05T10:00:00+09:00";

describe("parseXml", () => {
  const ok = (body: string) => `<?xml version="1.0"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body>${body}</body></response>`;

  it("목록과 상세를 읽고 특수문자를 푼다", () => {
    const { items, total } = parseXml(ok("<items><item><cntrwkNm>A &amp; B</cntrwkNm><bidStle>전자입찰 </bidStle></item><item><cntrwkNm>C</cntrwkNm></item></items><totalCount>2</totalCount>"));
    expect(total).toBe(2);
    expect(items[0]).toEqual({ cntrwkNm: "A & B", bidStle: "전자입찰" });
    expect(parseXml(ok("<item><estmPrce>100</estmPrce></item>")).items[0].estmPrce).toBe("100");
  });
  it("결과가 없으면 빈 목록", () => {
    expect(parseXml(ok("<items/><totalCount>0</totalCount>")).items).toEqual([]);
  });
  it("오류 응답은 이유를 담아 실패한다", () => {
    expect(() => parseXml("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>E</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>")).toThrow("LIMITED_NUMBER");
    expect(() => parseXml("<response><header><resultCode>99</resultCode><resultMsg>ERR</resultMsg></header></response>")).toThrow("ERR");
    expect(() => parseXml("not xml")).toThrow("읽을 수 없음");
  });
});

describe("cleanList", () => {
  it("코드와 구분자를 지운다", () => {
    expect(cleanList("[44000] 충청남도")).toBe("충청남도");
    expect(cleanList("[0002] 건축공사업^[0003] 토목건축공사업^[4992] 도장ㆍ습식ㆍ방수ㆍ석공사업|[4994] 철근")).toBe("건축공사업, 토목건축공사업, 도장ㆍ습식ㆍ방수ㆍ석공사업, 철근");
    expect(cleanList(undefined)).toBeNull();
  });
});

describe("toD2bNotice", () => {
  it("보내 주신 투찰 내역의 공고를 가능으로 판정한다", () => {
    expect(toD2bNotice(LIST, DETAIL, CLOSES)).toMatchObject({
      category: "hanil",
      source: "d2b",
      matched_by: "industry",
      bid_no: "MCS0155",
      bid_ord: "1",
      presumed_price: 55_711_818,
      region_limit: "충청남도",
      contract_method: "수의계약",
      verdict: "possible",
    });
  });
  it("여러 면허 중 하나로 들어 있어도 받는다", () => {
    const detail = { ...DETAIL, lcnsLmttList: "[0002] 건축공사업^[4991] 금속창호|[4992] 도장ㆍ습식ㆍ방수ㆍ석공사업" };
    expect(toD2bNotice(LIST, detail, CLOSES)).not.toBeNull();
  });
  it("면허가 다르면 뺀다", () => {
    expect(toD2bNotice(LIST, { ...DETAIL, lcnsLmttList: "[4996] 상ㆍ하수도설비공사업" }, CLOSES)).toBeNull();
    expect(toD2bNotice(LIST, { ...DETAIL, lcnsLmttList: "" }, CLOSES)).toBeNull();
  });
  it("지역 제한이 없으면 지역 판정 없이 통과", () => {
    expect(toD2bNotice(LIST, { ...DETAIL, areaLmttList: "" }, CLOSES)).toMatchObject({ region_limit: null, verdict: "possible" });
  });
});

// 교수님이 보내 주신 국방부 원가 공고 (2026-11-19 실제 응답)
const COST_LIST = {
  busiDivs: "용역",
  othbcNtatNm: "26-2차 과학화 경계시스템 외주정비 원가정산 용역",
  ornt: "육군 탄약지원사령부",
  pblancNo: "LDG0088",
  pblancOdr: "1",
  ntatPlanDate: "20261123",
  opengDt: "202611231030",
  progrsSttus: "진행중",
};
const COST_DETAIL = {
  asessRtLwlt: "-2.00",
  asessRtUplmt: "2.00",
  bsisPreparPc: "2567000",
  budgetAmount: "2567000",
  cntrctMth: "수의계약",
  estmPrce: "2333636",
  scsbidLwltRt: "88.000",
  sucbidrDecsnMth: "최저가격제",
};

describe("toD2bCostNotice", () => {
  it("공개수의 원가 용역을 원가계산 공고로 받는다", () => {
    expect(toD2bCostNotice(COST_LIST, COST_DETAIL, "2026-11-23T10:00:00+09:00", true)).toMatchObject({
      category: "cost",
      source: "d2b",
      bid_no: "LDG0088",
      bid_ord: "1",
      title: "26-2차 과학화 경계시스템 외주정비 원가정산 용역",
      notice_kind: "공개수의",
      presumed_price: 2_333_636,
      contract_method: "수의계약",
      award_method: "최저가격제 · 낙찰하한율 88% · 기초금액 2,567,000원(±2%)",
      verdict: "possible",
    });
  });
  it("자격 제한이 있으면 확인 필요", () => {
    expect(toD2bCostNotice(COST_LIST, { ...COST_DETAIL, lcnsLmttList: "[1169] 학술연구용역" }, null, true)?.verdict).toBe("check");
  });
  it("지역 제한이 충북·청주가 아니면 뺀다", () => {
    expect(toD2bCostNotice(COST_LIST, { ...COST_DETAIL, areaLmttList: "[44000] 충청남도" }, null, true)).toBeNull();
    expect(toD2bCostNotice(COST_LIST, { ...COST_DETAIL, areaLmttList: "[43000] 충청북도" }, null, true)).not.toBeNull();
  });
  it("경쟁입찰은 나라장터 원가 공고와 같은 기준으로 판정한다", () => {
    const list = { busiDivs: "용역", bidNm: "원가계산 용역", pblancNo: "SCF1071", pblancOdr: "2", pblancSe: "재공고", pblancDate: "20261113" };
    const n = toD2bCostNotice(list, { cntrctMth: "일반경쟁", sucbidrDecsnMth: "적격심사제", scsbidLwltRt: "87.995", estmPrce: "95241818" }, null, false);
    expect(n).toMatchObject({ title: "원가계산 용역", notice_kind: "재공고", verdict: "possible", award_method: "적격심사제 · 낙찰하한율 87.995%" });
  });
  it("값이 없으면 낙찰방법도 비운다", () => {
    expect(costAwardText({})).toBeNull();
  });
  it("확인 키는 한일ENG 키와 섞이지 않는다", () => {
    expect(costKey(COST_LIST)).toBe("cost:LDG0088-1");
  });
});
