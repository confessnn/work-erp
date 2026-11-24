import { describe, expect, it } from "vitest";
import { PAGE_ROWS, readAllPages, splitDuplicates } from "./sync";

describe("splitDuplicates", () => {
  it("ID 가 가장 작은 파일을 남기고 나머지를 버린다 (누가 골라도 같다)", () => {
    const a = splitDuplicates([{ id: "b2" }, { id: "a1" }, { id: "c3" }]);
    const b = splitDuplicates([{ id: "c3" }, { id: "a1" }, { id: "b2" }]);
    expect(a.keep?.id).toBe("a1");
    expect(a.extra.map((x) => x.id)).toEqual(["b2", "c3"]);
    expect(b.keep?.id).toBe("a1");
  });

  it("하나뿐이면 버릴 것이 없다", () => {
    expect(splitDuplicates([{ id: "x" }])).toEqual({ keep: { id: "x" }, extra: [] });
    expect(splitDuplicates([])).toEqual({ keep: null, extra: [] });
  });
});

describe("readAllPages", () => {
  const rows = Array.from({ length: 2500 }, (_, i) => i);
  const page = (calls: [number, number][]) => async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };

  it("1000줄 넘게 있으면 쪽을 이어 읽는다", async () => {
    const calls: [number, number][] = [];
    const out = await readAllPages(page(calls));
    expect(out).toHaveLength(2500);
    expect(calls).toEqual([
      [0, PAGE_ROWS - 1],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("max 까지만 읽는다", async () => {
    const calls: [number, number][] = [];
    const out = await readAllPages(page(calls), 1500);
    expect(out).toHaveLength(1500);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1499],
    ]);
  });

  it("딱 1000줄이면 빈 쪽을 한 번 더 확인하고 끝낸다", async () => {
    const calls: [number, number][] = [];
    const out = await readAllPages(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(0, 1000).slice(from, to + 1), error: null };
    });
    expect(out).toHaveLength(1000);
    expect(calls).toHaveLength(2);
  });

  it("오류면 던진다", async () => {
    await expect(readAllPages(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
