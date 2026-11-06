import { describe, expect, it } from "vitest";
import { CATEGORIES } from "./categories";
import { kstToIso, parseResponse, toApiDate, toNotice } from "./g2b-api";

const [COST, HANIL] = CATEGORIES;

const ITEM = {
  bidNtceNo: "R26BK01234567",
  bidNtceOrd: "000",
  ntceKindNm: "등록공고",
  bidNtceNm: "2027년 정수기 유지관리 용역 원가계산 용역",
  ntceInsttNm: "서울특별시교육청",
  dminsttNm: "서울특별시교육청",
  presmptPrce: "18000000",
  cntrctCnclsMthdNm: "제한경쟁",
  sucsfbidMthdNm: "협상에 의한 계약",
  bidNtceDt: "2026-11-05 10:00:00",
  bidClseDt: "2026-11-20 18:00:00",
  opengDt: "2026-11-21 10:00",
  bidNtceDtlUrl: "https://www.g2b.go.kr/example",
};

describe("kstToIso / toApiDate", () => {
  it("한국 시간을 ISO로 바꾼다", () => {
    expect(kstToIso("2026-11-05 10:00:00")).toBe("2026-11-05T10:00:00+09:00");
    expect(kstToIso("2026-11-21 10:00")).toBe("2026-11-21T10:00:00+09:00");
    expect(kstToIso("")).toBeNull();
    expect(kstToIso(undefined)).toBeNull();
  });
  it("조회 일시는 한국 시간 기준", () => {
    expect(toApiDate(new Date("2026-11-05T15:30:00Z"))).toBe("202611060030");
  });
});

describe("toNotice", () => {
  it("API 한 건을 저장 값으로 바꾸고 판정한다", () => {
    expect(toNotice(ITEM, COST, "keyword")).toMatchObject({
      category: "cost",
      source: "g2b",
      bid_no: "R26BK01234567",
      bid_ord: "000",
      presumed_price: 18_000_000,
      closes_at: "2026-11-20T18:00:00+09:00",
      verdict: "check",
    });
  });
  it("오탐·필수값 없는 건은 뺀다", () => {
    expect(toNotice({ ...ITEM, bidNtceNm: "창원가로수 정비 용역" }, COST, "keyword")).toBeNull();
    expect(toNotice({ ...ITEM, bidNtceNo: "" }, COST, "keyword")).toBeNull();
  });
  it("한일ENG는 공고명과 무관하게 받고 찾은 방법을 기록한다", () => {
    const n = toNotice({ ...ITEM, bidNtceNm: "생활관 개선공사", cntrctCnclsMthdNm: "수의계약" }, HANIL, "industry");
    expect(n).toMatchObject({ category: "hanil", matched_by: "industry", verdict: "possible" });
  });
  it("금액이 비거나 0이면 null", () => {
    expect(toNotice({ ...ITEM, presmptPrce: "" }, COST, "keyword")?.presumed_price).toBeNull();
    expect(toNotice({ ...ITEM, presmptPrce: "0" }, COST, "keyword")?.presumed_price).toBeNull();
  });
});

describe("parseResponse", () => {
  const ok = (items: unknown, totalCount = 1) =>
    JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "정상" }, body: { items, totalCount } } });

  it("배열·item 감싸기·빈 값을 모두 읽는다", () => {
    expect(parseResponse(ok([ITEM])).items).toHaveLength(1);
    expect(parseResponse(ok({ item: [ITEM, ITEM] })).items).toHaveLength(2);
    expect(parseResponse(ok({ item: ITEM })).items).toHaveLength(1);
    expect(parseResponse(ok("", 0)).items).toHaveLength(0);
  });
  it("오류 응답은 이유를 담아 실패한다", () => {
    const denied = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE ERROR", returnAuthMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } });
    expect(() => parseResponse(denied)).toThrow("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
    expect(() => parseResponse(JSON.stringify({ response: { header: { resultCode: "07", resultMsg: "입력범위값 초과" } } }))).toThrow("입력범위값 초과");
    expect(() => parseResponse("<OpenAPI_ServiceResponse><returnAuthMsg>LIMITED</returnAuthMsg></OpenAPI_ServiceResponse>")).toThrow("LIMITED");
  });
});
