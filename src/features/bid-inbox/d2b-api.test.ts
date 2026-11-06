import { describe, expect, it } from "vitest";
import { cleanList, parseXml, toD2bNotice } from "./d2b-api";

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
