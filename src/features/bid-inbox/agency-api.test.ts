import { describe, expect, it } from "vitest";
import { agencyDate, label } from "./data-go-kr";
import { searchMonths, toKwaterNotice } from "./kwater-api";
import { lhLicenses, lhRegion, toLhNotice } from "./lh-api";
import { parseXml } from "./d2b-api";

const NOW = new Date("2026-11-19T09:00:00+09:00");

describe("agencyDate", () => {
  it("여러 날짜 형식을 한국 시간으로 읽는다", () => {
    expect(agencyDate("2026-11-20 10:00")).toBe("2026-11-20T10:00:00+09:00");
    expect(agencyDate("202611201030")).toBe("2026-11-20T10:30:00+09:00");
    expect(agencyDate("2026.11.20 10:00:15")).toBe("2026-11-20T10:00:15+09:00");
    expect(agencyDate("20261120", "23:59:59")).toBe("2026-11-20T23:59:59+09:00");
    expect(agencyDate("")).toBeNull();
    expect(agencyDate(undefined)).toBeNull();
  });
  it("숫자 코드는 이름으로 쓰지 않는다", () => {
    expect(label("01")).toBeNull();
    expect(label(" 일반경쟁 ")).toBe("일반경쟁");
  });
});

describe("parseXml 출처 이름", () => {
  it("오류 메시지에 기관 이름을 붙인다", () => {
    expect(() => parseXml("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", "LH")).toThrow(
      "LH API 오류: 등록되지 않은 서비스키",
    );
  });
});

const LH_BASE = {
  bidNum: "2026-0001234",
  bidDegree: "1",
  bidnmKor: "",
  zoneHqCd: "충북지역본부",
  bidKind: "일반",
  bidProgrsStatus: "진행중",
  tndrCtrctMedCd: "제한경쟁",
  sunjungNm: "적격심사",
  tndrbidRegDt: "2026-11-18",
  tndrdocAcptEndDtm: "2026-11-25 10:00",
  openDtm: "2026-11-25 11:00",
  presmtPrc: "120000000",
};

describe("LH", () => {
  it("업종·면허 칸과 참가지역 칸을 모은다", () => {
    const i = { req1Reqlic1Nm: "도장ㆍ습식ㆍ방수ㆍ석공사업", req2Reqlic3Nm: "실내건축공사업", req3Reqlic1Nm: "도장ㆍ습식ㆍ방수ㆍ석공사업", zoneRstrct1: "충청남도", zoneRstrct2: "" };
    expect(lhLicenses(i)).toEqual(["도장ㆍ습식ㆍ방수ㆍ석공사업", "실내건축공사업"]);
    expect(lhRegion(i)).toBe("충청남도");
    expect(lhRegion({})).toBeNull();
  });

  it("원가 용역은 원가 칸으로, 지역이 맞지 않으면 버린다", () => {
    const cost = { ...LH_BASE, cstrtnJobGbNm: "용역", bidnmKor: "2027년 임대주택 원가계산 용역", zoneRstrct1: "충청북도" };
    const n = toLhNotice(cost, NOW)!;
    expect(n).toMatchObject({ category: "cost", source: "lh", bid_no: "2026-0001234", bid_ord: "1", region_limit: "충청북도", notice_org: "한국토지주택공사 충북지역본부" });
    expect(n.verdict).toBe("check");
    expect(n.closes_at).toBe("2026-11-25T10:00:00+09:00");
    expect(toLhNotice({ ...cost, zoneRstrct1: "경상남도" }, NOW)).toBeNull();
    // '원가'가 없는 용역은 받지 않는다
    expect(toLhNotice({ ...cost, bidnmKor: "설계 용역" }, NOW)).toBeNull();
  });

  it("도장·방수 면허 공사는 업종으로, 공고명만 맞으면 공고명으로 한일ENG 칸에 넣는다", () => {
    const work = { ...LH_BASE, cstrtnJobGbNm: "공사", bidnmKor: "천안 OO단지 보수공사", tndrCtrctMedCd: "일반경쟁", req1Reqlic1Nm: "도장ㆍ습식ㆍ방수ㆍ석공사업" };
    expect(toLhNotice(work, NOW)).toMatchObject({ category: "hanil", matched_by: "industry", verdict: "possible", main_industry: "도장ㆍ습식ㆍ방수ㆍ석공사업" });

    const byTitle = { ...work, req1Reqlic1Nm: "", bidnmKor: "OO단지 옥상 방수공사" };
    expect(toLhNotice(byTitle, NOW)).toMatchObject({ category: "hanil", matched_by: "keyword", verdict: "check" });

    expect(toLhNotice({ ...work, req1Reqlic1Nm: "전기공사업" }, NOW)).toBeNull();
    expect(toLhNotice({ ...work, presmtPrc: "800000000" }, NOW)?.verdict).toBe("impossible");
  });

  it("마감 지난 공고·취소 공고는 버린다", () => {
    const work = { ...LH_BASE, cstrtnJobGbNm: "공사", bidnmKor: "방수공사" };
    expect(toLhNotice({ ...work, tndrdocAcptEndDtm: "2026-11-18 10:00" }, NOW)).toBeNull();
    expect(toLhNotice({ ...work, bidProgrsStatus: "취소공고" }, NOW)).toBeNull();
  });
});

const KW = {
  tndrPbanno: "2026-K-0456",
  tndrPblancNm: "",
  ctrmthdCdNm: "일반경쟁",
  tndrStat: "공고중",
  tndrPlnprc: "50000000",
  cntrctDeptNm: "충청지역협력단",
  tndrPblancDe: "20261117",
  tndrPblancEnddt: "20261126",
};

describe("K-water", () => {
  it("원가 용역은 원가 칸에 넣고, 참가지역이 없어 '가능'을 '자격 확인'으로 낮춘다", () => {
    const n = toKwaterNotice({ ...KW, tndrPblancNm: "수도요금 원가산정 용역" }, "cost", NOW)!;
    expect(n).toMatchObject({ category: "cost", source: "kwater", bid_ord: "000", verdict: "check", notice_org: "한국수자원공사 충청지역협력단" });
    expect(n.verdict_reason).toContain("참가지역");
    expect(n.closes_at).toBe("2026-11-26T23:59:59+09:00");
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "수질 조사 용역" }, "cost", NOW)).toBeNull();
  });

  it("공사는 공고명에 도장·방수가 있어야 한일ENG 칸에 넣는다", () => {
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "정수장 방수공사" }, "hanil", NOW)).toMatchObject({ category: "hanil", matched_by: "keyword", verdict: "check" });
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "관로 교체공사" }, "hanil", NOW)).toBeNull();
    // 부가세 포함 7.7억은 추정 7억으로 보고 불가로 두지 않는다
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "도장공사", tndrPlnprc: "770000000" }, "hanil", NOW)?.verdict).toBe("check");
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "도장공사", tndrPlnprc: "900000000" }, "hanil", NOW)?.verdict).toBe("impossible");
  });

  it("마감 지난 공고·취소 공고는 버린다", () => {
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "방수공사", tndrPblancEnddt: "20261118" }, "hanil", NOW)).toBeNull();
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "방수공사", tndrStat: "취소" }, "hanil", NOW)).toBeNull();
  });

  it("최근 7일이 지난달에 걸치면 두 달을 조회한다", () => {
    expect(searchMonths(NOW)).toEqual(["202611"]);
    expect(searchMonths(new Date("2026-12-03T09:00:00+09:00"))).toEqual(["202611", "202612"]);
  });
});
