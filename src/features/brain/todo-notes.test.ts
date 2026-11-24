import { describe, expect, it } from "vitest";
import { planTodoNotes, todoNote, type TodoRow } from "./todo-notes";

const t = (over: Partial<TodoRow>): TodoRow => ({
  id: "1",
  title: "할 일",
  due_date: "2026-11-24",
  done_at: null,
  created_at: "2026-11-24T00:00:00Z",
  note: null,
  ...over,
});

describe("todoNote", () => {
  it("안 한 것 먼저 체크박스로, 메모는 들여쓴 줄", () => {
    const md = todoNote("2026-11-24", [
      t({ id: "a", title: "끝낸 일", done_at: "2026-11-24T03:00:00Z", created_at: "2026-11-24T01:00:00Z" }),
      t({ id: "b", title: "견적서 보내기", note: "담당: 김주무관\n010-0000-0000", created_at: "2026-11-24T02:00:00Z" }),
    ]);
    expect(md).toContain("# 2026-11-24 (화) 할 일");
    expect(md).toContain("- [ ] 견적서 보내기\n\t- 담당: 김주무관\n\t- 010-0000-0000\n- [x] 끝낸 일");
    expect(md).toContain("done: 1\ntotal: 2");
  });
  it("할 일이 없는 날", () => {
    expect(todoNote("2026-11-24", [])).toContain("할 일이 없어요.");
  });
});

describe("planTodoNotes", () => {
  it("기간 안의 날짜만, 날짜 순으로", () => {
    const plans = planTodoNotes(
      [t({ due_date: "2026-11-25" }), t({ due_date: "2026-11-24" }), t({ due_date: "2025-01-01" }), t({ due_date: "2027-12-31" })],
      [],
      "2026-11-24",
    );
    expect(plans.map((p) => p.fileName)).toEqual(["2026-11-24.md", "2026-11-25.md"]);
    expect(plans[0].key).toBe("todo:2026-11-24");
  });
  it("예전에 올렸는데 이제 비어 있는 날은 비운 노트로 고친다 (기록 노트 키는 무시)", () => {
    const plans = planTodoNotes([], ["todo:2026-11-20", "todo:2020-01-01", "재경관리사"], "2026-11-24");
    expect(plans.map((p) => p.key)).toEqual(["todo:2026-11-20"]);
    expect(plans[0].content).toContain("할 일이 없어요.");
  });
});
