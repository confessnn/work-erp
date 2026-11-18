import { describe, expect, it } from "vitest";
import { escapeTg, findChatByCode, packChunks } from "./api";

describe("findChatByCode", () => {
  const updates = [
    { message: { chat: { id: 1, type: "private" }, text: "/start ERP-ABC123" } },
    { message: { chat: { id: 2, type: "group" }, text: "ERP-ABC123" } },
    { message: { chat: { id: 3, type: "private" }, text: "안녕" } },
  ];
  it("코드를 보낸 1:1 대화방을 찾는다 (/start 링크로 온 것도)", () => {
    expect(findChatByCode(updates, "ERP-ABC123")).toBe(1);
  });
  it("단체방이나 다른 글은 연결하지 않는다", () => {
    expect(findChatByCode(updates.slice(1), "ERP-ABC123")).toBeNull();
  });
  it("소문자로 보내도 찾는다", () => {
    expect(findChatByCode([{ message: { chat: { id: 5, type: "private" }, text: "erp-abc123" } }], "ERP-ABC123")).toBe(5);
  });
});

describe("packChunks", () => {
  it("길이를 넘지 않게 블록을 묶는다", () => {
    expect(packChunks(["a".repeat(6), "b".repeat(6), "c".repeat(6)], 14)).toEqual(["aaaaaa\n\nbbbbbb", "cccccc"]);
  });
  it("너무 긴 블록은 자른다", () => {
    const [only] = packChunks(["x".repeat(30)], 10);
    expect(only.length).toBe(10);
    expect(only.endsWith("…")).toBe(true);
  });
});

it("escapeTg", () => {
  expect(escapeTg("A&B <b>")).toBe("A&amp;B &lt;b&gt;");
});
