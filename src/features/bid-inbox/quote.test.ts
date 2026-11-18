import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { calcQuote, DEFAULT_WAGES, defaultExpenses, fillQuoteHwpx, koreanAmount, type QuoteInput } from "./quote";
import { QUOTE_TEMPLATE_B64 } from "./quote-template";

// 지난 정수기 원가분석 견적서와 같은 조건
const input: QuoteInput = {
  service: "2027년 학교 먹는물 정수기 임차 및 유지관리 용역 원가분석 용역 견적서",
  total: 1_530_000,
  months: 0.5,
  wages: DEFAULT_WAGES,
  shares: [398_283, 203_598, 410_297],
  expenses: { ...defaultExpenses(1_530_000), print: { unit: 40, qty: 7_500, unitLabel: "매" } },
  adminRate: 6,
};

describe("calcQuote", () => {
  it("지난 견적서 숫자를 그대로 만든다", () => {
    const q = calcQuote(input);
    expect(q.vat).toBe(139_091);
    expect(q.subtotal).toBe(1_390_909);
    expect(q.admin).toBe(78_731);
    expect(q.expenseSum).toBe(300_000);
    expect(q.laborSum).toBe(1_012_178);
    expect(q.labor.map((l) => l.amount)).toEqual([398_283, 203_598, 410_297]);
    expect(q.labor[0].remark).toBe("7,567,456원×0.5개월×10.52621%");
    expect(q.expenses.print.remark).toBe("40원×7,500매");
  });
  it("경비가 너무 크면 알려 준다", () => {
    expect(() => calcQuote({ ...input, expenses: { ...input.expenses, print: { unit: 40, qty: 100_000, unitLabel: "매" } } })).toThrow("경비");
  });
});

it("koreanAmount", () => {
  expect(koreanAmount(1_530_000)).toBe("일백오십삼만");
  expect(koreanAmount(123_456_789)).toBe("일억이천삼백사십오만육천칠백팔십구");
  expect(koreanAmount(100_000_000)).toBe("일억");
});

it("hwpx 양식에 값을 넣는다", () => {
  const tpl = Uint8Array.from(Buffer.from(QUOTE_TEMPLATE_B64, "base64"));
  const q = calcQuote({ ...input, service: "테스트 <원가> 용역 견적서", total: 22_000_000, months: 2, expenses: defaultExpenses(22_000_000) });
  const files = unzipSync(fillQuoteHwpx(tpl, "테스트 <원가> 용역 견적서", q, 6));
  const xml = strFromU8(files["Contents/section0.xml"]);
  expect(xml).toContain("용역명: 테스트 &lt;원가&gt; 용역 견적서");
  expect(xml).toContain("액: 금 이천이백만원(￦22,000,000)");
  expect(xml).toContain("<hp:t>22,000,000</hp:t>");
  expect(xml).toContain(`<hp:t>${q.admin.toLocaleString("ko-KR")}</hp:t>`);
  expect(xml).not.toContain("1,530,000");
  expect(Object.keys(files)[0]).toBe("mimetype");
  // 문서의 숫자를 다시 더해 본다
  expect(q.laborSum + q.expenseSum + q.admin + q.vat).toBe(22_000_000);
});
