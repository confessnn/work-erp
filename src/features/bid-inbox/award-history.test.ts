import { describe, expect, it } from "vitest";
import { caseWeight, isCostWork, mergeAwards, modeOf, pickSimilar, titleCore, toAward, weekWindows, type Award } from "./award-history";

describe("toAward", () => {
  const item = {
    bidNtceNo: "R26BK01780258",
    bidNtceOrd: "000",
    bidNtceNm: "2027년도 조성원가 재산정 용역",
    prtcptCnum: "5",
    bidwinnrNm: "가나회계법인",
    bidwinnrCeoNm: "홍길동",
    bidwinnrTelNo: "070-0000-0000",
    bidwinnrAdrs: "어딘가",
    sucsfbidAmt: "32405380",
    sucsfbidRate: "89.136",
    dminsttNm: "인천광역시 경제자유구역청",
    fnlSucsfDate: "2026-11-05",
  };

  it("필요한 값만 옮기고 대표자·전화·주소는 버린다", () => {
    const a = toAward(item);
    expect(a).toEqual({
      bidNo: "R26BK01780258-000",
      title: "2027년도 조성원가 재산정 용역",
      org: "인천광역시 경제자유구역청",
      amount: 32405380,
      rate: 89.136,
      participants: 5,
      winner: "가나회계법인",
      date: "2026-11-05",
    });
    expect(JSON.stringify(a)).not.toMatch(/홍길동|070-|어딘가/);
  });

  it("금액이나 낙찰률이 이상하면 뺀다", () => {
    expect(toAward({ ...item, sucsfbidAmt: "0" })).toBeNull();
    expect(toAward({ ...item, sucsfbidRate: "" })).toBeNull();
    expect(toAward({ ...item, sucsfbidRate: "250" })).toBeNull();
  });
});

describe("weekWindows", () => {
  it("1년을 날짜 기준 7일씩 거꾸로 나눈다 (한국 날짜)", () => {
    const w = weekWindows(new Date("2026-11-18T09:00:00Z"), 365); // 한국 18시
    expect(w).toHaveLength(53);
    expect(w[0]).toEqual({ begin: "202611120000", end: "202611182359" });
    expect(w[1]).toEqual({ begin: "202611050000", end: "202611112359" });
  });
});

describe("titleCore", () => {
  it("연도·차수·괄호를 빼서 같은 용역을 알아본다", () => {
    expect(titleCore("[2차 재공고]제13차 2027년도 송도 조성원가 재산정 용역")).toBe(titleCore("2026년도 송도 조성원가 재산정 용역(긴급)"));
  });
});

describe("pickSimilar", () => {
  const a = (over: Partial<Award>): Award => ({ bidNo: "X-000", title: "원가계산 용역", org: "다른기관", amount: 50_000_000, rate: 88, participants: 3, winner: null, date: "2026-10-01", ...over });
  const awards = [
    a({ bidNo: "A-000", amount: 10_000_000, date: "2026-09-01" }), // 너무 작음
    a({ bidNo: "B-000", amount: 60_000_000, date: "2026-10-01" }), // 비슷한 금액
    a({ bidNo: "C-000", org: "한국수자원공사", amount: 500_000_000, date: "2026-03-01" }), // 같은 기관 (금액 무관)
    a({ bidNo: "D-000", title: "2026년도 상수도 요금 원가 산정 용역", amount: 900_000_000, date: "2025-12-01" }), // 같은 용역
    a({ bidNo: "SELF-000", amount: 50_000_000 }), // 이번 공고 자신
  ];
  const rows = pickSimilar(awards, { title: "2027년도 상수도 요금 원가 산정 용역", org: "한국수자원공사", base: 55_000_000, bidNo: "SELF" });

  it("같은 용역 → 같은 기관 → 최근 순으로, 금액이 너무 다른 건 뺀다", () => {
    expect(rows.map((r) => r.bidNo)).toEqual(["D-000", "C-000", "B-000"]);
    expect(rows[0].sameWork).toBe(true);
    expect(rows[1].sameOrg).toBe(true);
  });
});

describe("isCostWork", () => {
  it("원가 용역만 남긴다", () => {
    expect(isCostWork("2026년도 처분시설 경상정비 원가조사 용역")).toBe(true);
    expect(isCostWork("2026년 한국생산기술연구원 원가계산용역 단가계약")).toBe(true);
    expect(isCostWork("제13차 2027년도 송도 조성원가 재산정 용역")).toBe(true);
    expect(isCostWork("온라인도매시장 바우처 지원사업 원가정산용역")).toBe(true);
    expect(isCostWork("2026년 양주나리농원 가을개장 관리운영 용역")).toBe(false);
    expect(isCostWork("보호대상아동 원가정 복귀 지원체계 구축 연구")).toBe(false);
    expect(isCostWork("수자원 가용성 통합평가 체계구축")).toBe(false);
  });
});

describe("mergeAwards", () => {
  const a = (bidNo: string, date: string, rate = 88): Award => ({ bidNo, title: "원가계산 용역", org: null, amount: 1, rate, participants: null, winner: null, date });
  it("같은 공고는 새 값으로, 1년 넘은 것은 뺀다", () => {
    const merged = mergeAwards([a("A", "2026-11-01", 80), a("OLD", "2025-10-01")], [a("A", "2026-11-01", 90), a("B", "2026-11-17")], 365, new Date("2026-11-18T00:00:00Z"));
    expect(merged.map((m) => `${m.bidNo}:${m.rate}`).sort()).toEqual(["A:90", "B:88"]);
  });
});

describe("경쟁·낙찰 방식 거르기", () => {
  const a = (over: Partial<Award>): Award => ({ bidNo: "X-000", title: "원가계산 용역", org: "기관", amount: 50_000_000, rate: 88, participants: 5, winner: null, date: "2026-10-01", ...over });

  it("참여 2곳 이하나 다른 방식은 계산에서 빼고 이유를 단다", () => {
    const rows = pickSimilar(
      [
        a({ bidNo: "ONE", participants: 1, rate: 99.9 }),
        a({ bidNo: "QUAL", method: "적격심사제-용역", rate: 87.7 }),
        a({ bidNo: "NEGO", method: "협상에의한계약", rate: 85 }),
        a({ bidNo: "UNKNOWN", rate: 86 }),
      ],
      { title: "다른 원가계산 용역", org: null, base: 50_000_000, mode: "negotiation" },
    );
    const by = Object.fromEntries(rows.map((r) => [r.bidNo, r]));
    expect(by.ONE).toMatchObject({ use: false, skip: "경쟁 적음 (1곳 참여)" });
    expect(by.QUAL).toMatchObject({ use: false, skip: "다른 방식 (적격심사)" });
    expect(by.NEGO.use).toBe(true);
    expect(by.UNKNOWN.use).toBe(true); // 방식을 아직 모르면 일단 쓴다
    expect(rows.slice(0, 2).every((r) => r.use)).toBe(true); // 쓰는 것이 위로
  });

  it("쓰는 건수는 12건까지", () => {
    const many = Array.from({ length: 15 }, (_, i) => a({ bidNo: `N${i}`, date: `2026-10-${String(i + 1).padStart(2, "0")}` }));
    const rows = pickSimilar(many, { title: "다른 원가계산 용역", org: null, base: 50_000_000 });
    expect(rows.filter((r) => r.use)).toHaveLength(12);
    expect(rows.find((r) => !r.use)?.skip).toBe("12건 초과");
  });

  it("modeOf", () => {
    expect(modeOf("협상에의한계약-협상에 의한 낙찰자 결정")).toBe("negotiation");
    expect(modeOf("적격심사제-관리규정외 수기심사(총점입력)")).toBe("qualified");
    expect(modeOf("최저가낙찰제")).toBe("price");
    expect(modeOf("")).toBeNull();
  });

  it("다시 받아도 찾아 둔 낙찰방법을 잃지 않는다", () => {
    const merged = mergeAwards([a({ bidNo: "A", method: "협상" })], [a({ bidNo: "A", rate: 90 })], 365, new Date("2026-11-18T00:00:00Z"));
    expect(merged[0]).toMatchObject({ rate: 90, method: "협상" });
  });
});

describe("caseWeight", () => {
  const now = new Date("2026-11-18T00:00:00Z");
  it("같은 용역·기관·최근·비슷한 금액이면 크게 센다", () => {
    expect(caseWeight({ amount: 50, date: "2026-10-01" }, { sameWork: true, sameOrg: true }, 50, now)).toBeCloseTo(3 * 2 * 1.5 * 1.5);
    expect(caseWeight({ amount: 10, date: "2025-12-01" }, { sameWork: false, sameOrg: false }, 50, now)).toBe(1);
  });
});
