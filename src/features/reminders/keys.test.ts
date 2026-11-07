import { describe, expect, it } from "vitest";
import { familyEventTarget, parseSubscription, parseTarget, reminderKey } from "./keys";

describe("familyEventTarget", () => {
  it("직접 넣은 가족 일정은 id", () => {
    expect(familyEventTarget({ id: "e1", event_date: "2026-11-12", source_id: null, external_uid: null })).toEqual({
      kind: "event",
      ref: "e1",
      date: "2026-11-12",
    });
  });
  it("구글에서 가져온 일정은 원본 id", () => {
    expect(familyEventTarget({ id: "e2", event_date: "2026-11-12", source_id: "s1", external_uid: "abc@google.com" })).toEqual({
      kind: "import",
      ref: "s1:abc@google.com",
      date: "2026-11-12",
    });
  });
  it("키", () => expect(reminderKey("lecture", "l1")).toBe("lecture|l1"));
});

describe("parseTarget", () => {
  it("올바른 값만 통과", () => {
    expect(parseTarget({ kind: "lecture", ref: "l1", date: "2026-11-12" })).toEqual({ kind: "lecture", ref: "l1", date: "2026-11-12" });
    expect(parseTarget({ kind: "x", ref: "l1", date: "2026-11-12" })).toBe(null);
    expect(parseTarget({ kind: "event", ref: "", date: "2026-11-12" })).toBe(null);
    expect(parseTarget({ kind: "event", ref: "a", date: "11/12" })).toBe(null);
    expect(parseTarget(null)).toBe(null);
  });
});

describe("parseSubscription", () => {
  it("https 엔드포인트와 키가 있어야 한다", () => {
    expect(parseSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "p", auth: "a" } })).toEqual({
      endpoint: "https://fcm.googleapis.com/x",
      p256dh: "p",
      auth: "a",
    });
    expect(parseSubscription({ endpoint: "http://x", keys: { p256dh: "p", auth: "a" } })).toBe(null);
    expect(parseSubscription({ endpoint: "https://x", keys: {} })).toBe(null);
  });
});
