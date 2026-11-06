import { describe, expect, it } from "vitest";
import { submissionKind } from "./submission";

describe("submissionKind", () => {
  it("제안서·규격서를 내는 방식", () => {
    for (const m of [
      "협상에의한계약-협상에 의한 낙찰자 결정",
      "협상에의한계약-협상에 의한 낙찰자 결정(SW사업)",
      "규격가격동시입찰-제안적격자 중 예가 내 최저가 투찰자",
      "2단계경쟁입찰-가격입찰서제출자 중 예가 내 최저가 투찰자",
    ]) {
      expect(submissionKind(m)).toBe("proposal");
    }
  });
  it("가격만 내는 방식", () => {
    for (const m of [
      "적격심사제-학술연구용역 적격심사 추정가격 5억원 이상",
      "소액수의견적-소액수의견적(2인 이상 견적 제출)",
      "수의시담-수의시담",
      "수의시담(2인 이상)-2인이상 지정업체의 견적에의한 수의계약",
      "제한적최저가(낙찰하한율)-제한적최저가(낙찰하한율)",
      "최저가낙찰제-최저가낙찰자",
      "최저가격제",
    ]) {
      expect(submissionKind(m)).toBe("price");
    }
  });
  it("나눌 수 없으면 확인 필요", () => {
    expect(submissionKind(null)).toBe("unknown");
    expect(submissionKind("")).toBe("unknown");
    expect(submissionKind("카탈로그계약-적격성평가(카탈로그)")).toBe("unknown");
  });
});
