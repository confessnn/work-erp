import { describe, expect, it } from "vitest";
import { blockedRecipient, buildIssueRequest, cannotIssue, digitsOnly, isValidBusinessNumber, isValidEmail, taxFromSupply, validateIssue, type IssueInput } from "./invoice";
import type { BusinessFields } from "./types";

const business = (over: Partial<BusinessFields> = {}): BusinessFields => ({
  identification_number: "1000000014",
  tax_registration_id: null,
  organization_name: "공급자",
  representative_name: "대표",
  address: null,
  business_type: null,
  business_item: null,
  manager_email: "a@example.com",
  manager_name: null,
  ...over,
});

const input = (over: Partial<IssueInput> = {}): IssueInput => ({
  date: "2026-11-07",
  purpose: "CLAIM",
  itemName: "에어컨 청소",
  supplyCost: 100_000,
  tax: 10_000,
  ...over,
});

describe("isValidBusinessNumber", () => {
  it("끝자리가 맞는 번호를 통과시킨다", () => {
    for (const n of ["1000000014", "1000000028", "1000000066"]) expect(isValidBusinessNumber(n)).toBe(true);
  });
  it("끝자리가 틀리면 거른다", () => {
    expect(isValidBusinessNumber("1234567890")).toBe(false);
  });
  it("10자리가 아니면 거른다", () => {
    expect(isValidBusinessNumber("100000001")).toBe(false);
  });
  it("하이픈은 지우고 검사한다", () => {
    expect(isValidBusinessNumber(digitsOnly("100-00-00014"))).toBe(true);
  });
});

describe("isValidEmail", () => {
  it("형식과 길이를 본다", () => {
    expect(isValidEmail("a@example.com")).toBe(true);
    expect(isValidEmail("없음")).toBe(false);
    expect(isValidEmail(`${"a".repeat(35)}@example.com`)).toBe(false);
  });
});

describe("taxFromSupply", () => {
  it("10%에서 원 미만을 버린다", () => {
    expect(taxFromSupply(100_000)).toBe(10_000);
    expect(taxFromSupply(12_345)).toBe(1_234);
  });
});

describe("validateIssue", () => {
  it("정상 입력은 통과한다", () => expect(validateIssue(input())).toBeNull());
  it("공급가액 0원을 막는다", () => expect(validateIssue(input({ supplyCost: 0 }))).toContain("공급가액"));
  it("소수 금액을 막는다", () => expect(validateIssue(input({ supplyCost: 10.5 }))).toContain("공급가액"));
  it("음수 세액을 막는다", () => expect(validateIssue(input({ tax: -1 }))).toContain("세액"));
  it("빈 품목을 막는다", () => expect(validateIssue(input({ itemName: "  " }))).toContain("품목"));
  it("날짜 형식을 본다", () => expect(validateIssue(input({ date: "11/07" }))).toContain("작성일자"));
});

describe("buildIssueRequest", () => {
  const body = buildIssueRequest(
    business({ manager_name: "나" }),
    business({ identification_number: "1000000028", organization_name: "거래처", manager_email: "b@example.com" }),
    input({ itemName: " 에어컨 청소 " }),
  );

  it("과세 세금계산서로 보낸다", () => {
    expect(body).toMatchObject({ date: "2026-11-07", purpose: "CLAIM", taxType: "TAXABLE" });
  });
  it("공급자 담당자는 하나, 공급받는자 담당자는 목록이다", () => {
    expect(body.supplier.manager).toEqual({ email: "a@example.com", name: "나" });
    expect(body.supplied.managers).toEqual([{ email: "b@example.com", name: null }]);
  });
  it("공급자와 공급받는자를 뒤바꾸지 않는다", () => {
    expect(body.supplier.identificationNumber).toBe("1000000014");
    expect(body.supplied.identificationNumber).toBe("1000000028");
    expect(body.supplied.organizationName).toBe("거래처");
  });
  it("품목에 금액과 세액을 넣는다", () => {
    expect(body.items).toEqual([{ date: "2026-11-07", name: "에어컨 청소", supplyCost: 100_000, tax: 10_000 }]);
  });
});

describe("발행 제한", () => {
  it("영수증만 낼 수 있는 간이과세자와 면세사업자는 발행할 수 없다", () => {
    expect(cannotIssue("SIMPLIFIED_RECEIPT_ISSUER")).toBe(true);
    expect(cannotIssue("TAX_FREE")).toBe(true);
    expect(cannotIssue("GENERAL")).toBe(false);
    expect(cannotIssue(null)).toBe(false);
  });
  it("폐업·미등록 거래처를 막는다", () => {
    expect(blockedRecipient("CLOSED")).toBe(true);
    expect(blockedRecipient("NOT_REGISTERED")).toBe(true);
    expect(blockedRecipient("ACTIVE")).toBe(false);
  });
});
