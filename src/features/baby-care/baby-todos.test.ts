import { describe, expect, it } from "vitest";
import { groupBabyTodos, type BabyTodo } from "./baby-todos";

const t = (o: Partial<BabyTodo>): BabyTodo => ({
  id: Math.random().toString(36),
  title: "할 일",
  due_date: "2026-11-22",
  note: null,
  done_at: null,
  done_by: null,
  updated_by: null,
  updated_at: "2026-11-22T00:00:00Z",
  ...o,
});

describe("groupBabyTodos", () => {
  it("밀린 것·오늘·앞으로·끝낸 것으로 나눈다", () => {
    const g = groupBabyTodos(
      [
        t({ title: "예방접종", due_date: "2026-11-25" }),
        t({ title: "기저귀 주문", due_date: "2026-11-20" }),
        t({ title: "목욕", due_date: "2026-11-22" }),
        t({ title: "검진 예약", due_date: "2026-11-21", done_at: "2026-11-21T03:00:00Z" }),
        t({ title: "분유 사기", due_date: "2026-11-22", done_at: "2026-11-22T03:00:00Z" }),
      ],
      "2026-11-22",
    );
    expect(g.late.map((x) => x.title)).toEqual(["기저귀 주문"]);
    expect(g.today.map((x) => x.title)).toEqual(["목욕"]);
    expect(g.later.map((x) => x.title)).toEqual(["예방접종"]);
    expect(g.done.map((x) => x.title)).toEqual(["분유 사기", "검진 예약"]);
  });
});
