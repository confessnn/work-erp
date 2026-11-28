import { describe, expect, it } from "vitest";
import { countByState, iconOf, ROSTER, sortByState, STATE_ORDER } from "./roster";
import type { Researcher } from "./types";

const who = (id: string, state: Researcher["state"]): Researcher => ({
  id,
  name: id,
  duty: "",
  model: "",
  state,
  note: "",
});

describe("연구소 명단", () => {
  it("id 가 겹치지 않는다 (아이콘 파일 이름이라서)", () => {
    expect(new Set(ROSTER.map((r) => r.id)).size).toBe(ROSTER.length);
  });

  it("상태는 아는 값만 쓴다", () => {
    for (const r of ROSTER) expect(STATE_ORDER).toContain(r.state);
  });

  it("아이콘 주소는 public/lab 의 파일을 가리킨다", () => {
    expect(iconOf("chief")).toBe("/lab/chief.png");
  });

  it("운영중 → 준비 → 예정 차례로 놓고, 같은 상태면 명단 순서를 지킨다", () => {
    const list = [who("a", "예정"), who("b", "운영중"), who("c", "예정"), who("d", "준비")];
    expect(sortByState(list).map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("원래 배열을 건드리지 않는다", () => {
    const list = [who("a", "예정"), who("b", "운영중")];
    sortByState(list);
    expect(list.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("상태별 인원을 센다", () => {
    expect(countByState([who("a", "운영중"), who("b", "예정"), who("c", "예정")])).toEqual({
      운영중: 1,
      준비: 0,
      예정: 2,
    });
  });
});
