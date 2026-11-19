import { describe, expect, it } from "vitest";
import { agencyDate, label } from "./data-go-kr";
import { searchMonths, toKwaterNotice } from "./kwater-api";
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
    expect(() => parseXml("<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>등록되지 않은 서비스키</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>", "K-water")).toThrow(
      "K-water API 오류: 등록되지 않은 서비스키",
    );
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
    // 실제 응답: 끝난 공고가 마감일 없이 '입찰완료'로 온다
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "반월(정) 시설물 도장 공사", tndrStat: "입찰완료", tndrPblancEnddt: "" }, "hanil", NOW)).toBeNull();
    expect(toKwaterNotice({ ...KW, tndrPblancNm: "여과지동 도장공사", tndrStat: "서류제출", tndrPblancEnddt: "" }, "hanil", NOW)).not.toBeNull();
  });

  it("최근 7일이 지난달에 걸치면 두 달을 조회한다", () => {
    expect(searchMonths(NOW)).toEqual(["202611"]);
    expect(searchMonths(new Date("2026-12-03T09:00:00+09:00"))).toEqual(["202611", "202612"]);
  });
});
