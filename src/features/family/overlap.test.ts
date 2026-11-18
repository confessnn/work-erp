import { expect, it } from "vitest";
import { overlapLabel } from "./overlap";

it("overlapLabel: 가족 일정과 강의", () => {
  expect(overlapLabel({ kind: "event", title: "치과", person: "dad", start_time: "15:00:00", end_time: "16:00:00" })).toBe("15:00~16:00 치과 (아빠)");
  expect(overlapLabel({ kind: "lecture", title: "원가계산 특강", person: null, start_time: "14:30:00", end_time: null })).toBe("14:30 원가계산 특강 (강의)");
  expect(overlapLabel({ kind: "event", title: "외식", person: "all", start_time: "18:00", end_time: null })).toBe("18:00 외식 (가족)");
});
