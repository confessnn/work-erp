import { describe, expect, it } from "vitest";
import { calcCost, clearsLowerBound, guessAwardMode, parseRates, plansFromLowerRate, plansFromRates, priceScore, quantile, vatPair } from "./calc";

describe("guessAwardMode", () => {
  it("낙찰 방법 문구로 방식을 고른다", () => {
    expect(guessAwardMode("협상에의한계약-협상에 의한 낙찰자 결정")).toBe("negotiation");
    expect(guessAwardMode("적격심사제-추정가격 2억원 미만")).toBe("qualified");
    expect(guessAwardMode("소액수의견적")).toBe("price");
    expect(guessAwardMode(null)).toBe("price");
  });
});

describe("calcCost", () => {
  it("인건비·경비·일반관리비·이윤·부가세를 쌓아 올린다", () => {
    const c = calcCost({
      staff: [
        { label: "책임연구원", people: 1, months: 2, monthlyPay: 3_000_000 },
        { label: "연구원", people: 2, months: 2, monthlyPay: 1_000_000 },
      ],
      expenses: 2_000_000,
      overheadRate: 5,
      profitRate: 10,
    });
    expect(c).toEqual({ labor: 10_000_000, expenses: 2_000_000, overhead: 600_000, cost: 12_600_000, profit: 1_260_000, supply: 13_860_000, vat: 1_386_000, total: 15_246_000 });
  });
  it("입력이 없으면 0", () => {
    expect(calcCost({ staff: [], expenses: 0, overheadRate: 5, profitRate: 10 }).total).toBe(0);
  });
});

describe("parseRates / quantile", () => {
  it("구분자와 무관하게 낙찰률을 읽고 범위 밖 값을 뺀다", () => {
    expect(parseRates("87.5, 88 / 90.1\n0 500 %")).toEqual([87.5, 88, 90.1]);
    expect(parseRates("")).toEqual([]);
  });
  it("사분위수를 보간한다", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([40, 10, 20, 30], 0.25)).toBeCloseTo(17.5);
    expect(quantile([7], 0.75)).toBe(7);
  });
});

describe("plansFromRates", () => {
  it("유사 낙찰률 사분위로 3안을 만든다", () => {
    const plans = plansFromRates(100_000_000, [80, 85, 90, 95, 100]);
    expect(plans.map((p) => [p.key, p.rate, p.price])).toEqual([
      ["attack", 85, 85_000_000],
      ["balanced", 90, 90_000_000],
      ["safe", 95, 95_000_000],
    ]);
  });
  it("자료나 금액이 없으면 안을 내지 않는다", () => {
    expect(plansFromRates(100, [])).toEqual([]);
    expect(plansFromRates(0, [90])).toEqual([]);
  });
});

describe("plansFromLowerRate", () => {
  it("하한율 바로 위를 공격안으로, 0.5%p씩 올려 3안을 만든다", () => {
    const plans = plansFromLowerRate(100_000_000, 87.745);
    expect(plans[0].rate).toBeCloseTo(88.008, 3);
    expect(plans[1].rate).toBeCloseTo(88.508, 3);
    expect(plans[2].rate).toBeCloseTo(89.008, 3);
    expect(plans[0].price).toBe(Math.ceil(100_000_000 * (87.745 * 1.003) / 100));
  });
  it("하한율이 없으면 안을 내지 않는다", () => {
    expect(plansFromLowerRate(100, 0)).toEqual([]);
  });
});

describe("priceScore", () => {
  it("최저가보다 5% 높으면 배점 10점에서 0.48점 잃는다", () => {
    const { score, loss } = priceScore(105, 100, 100, 10, 60);
    expect(score).toBeCloseTo(9.52, 2);
    expect(loss).toBeCloseTo(0.48, 2);
  });
  it("최저입찰가가 하한 미만이면 하한으로 본다", () => {
    expect(priceScore(80, 40, 100, 10, 60).score).toBeCloseTo(7.5);
  });
  it("최저가 이하 입찰은 만점을 넘지 않는다", () => {
    expect(priceScore(90, 100, 100, 10, 60).score).toBe(10);
  });
});

describe("clearsLowerBound", () => {
  it("예정가격이 오르면 하한도 오른다", () => {
    expect(clearsLowerBound(88_500_000, 100_000_000, 87.745, 2)).toEqual({ low: true, mid: true, high: false });
    expect(clearsLowerBound(85_000_000, 100_000_000, 87.745, 2)).toEqual({ low: false, mid: false, high: false });
  });
});

describe("vatPair", () => {
  it("부가세 포함·별도 금액을 함께 낸다", () => {
    expect(vatPair(1_000_000, false)).toEqual({ excl: 1_000_000, incl: 1_100_000 });
    expect(vatPair(1_100_000, true)).toEqual({ excl: 1_000_000, incl: 1_100_000 });
  });
});
