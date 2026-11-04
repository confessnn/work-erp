import { describe, expect, it } from "vitest";
import type { Lecture } from "@/features/lectures/types";
import { summarize, summarizeByMonth } from "./summary";

const base: Lecture = {
  id: "x",
  user_id: "u",
  title: "강의",
  organization: null,
  lecture_date: "2026-11-01",
  start_time: null,
  end_time: null,
  hours: 2,
  hourly_rate: 500_000,
  gross_amount: 1_000_000,
  income_type: "business",
  apply_tax_exemption: true,
  income_tax: 30_000,
  local_tax: 3_000,
  expected_net: 967_000,
  is_paid: false,
  paid_date: null,
  paid_amount: null,
  memo: null,
  external_uid: null,
  created_at: "",
  updated_at: "",
};

describe("summarize", () => {
  it("수령/미수령 분리", () => {
    const s = summarize([
      { ...base, id: "a" },
      { ...base, id: "b", is_paid: true, paid_amount: 960_000 },
      { ...base, id: "c", is_paid: true, paid_amount: null },
    ]);
    expect(s.count).toBe(3);
    expect(s.grossTotal).toBe(3_000_000);
    expect(s.taxTotal).toBe(99_000);
    expect(s.expectedNet).toBe(2_901_000);
    expect(s.receivedTotal).toBe(960_000 + 967_000);
    expect(s.unpaidTotal).toBe(967_000);
    expect(s.paidCount).toBe(2);
    expect(s.unpaidCount).toBe(1);
  });

  it("월별 합계", () => {
    const rows = summarizeByMonth([
      base,
      { ...base, lecture_date: "2026-03-10" },
    ]);
    expect(rows[2].summary.count).toBe(1);
    expect(rows[10].summary.count).toBe(1);
    expect(rows[0].summary.count).toBe(0);
  });
});
