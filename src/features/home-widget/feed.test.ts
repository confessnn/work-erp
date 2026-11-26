import { describe, expect, it } from "vitest";
import { buildFeed, type WidgetRow } from "./feed";

const row = (p: Partial<WidgetRow>): WidgetRow => ({
  kind: "lecture",
  id: "1",
  title: "강의",
  organization: null,
  person: null,
  event_date: "2026-11-10",
  start_time: null,
  end_time: null,
  ...p,
});

const NOW = new Date("2026-11-26T00:00:00Z");

describe("buildFeed", () => {
  it("시간을 HH:MM 으로 줄이고 종일이면 아예 넣지 않는다", () => {
    const { items } = buildFeed(
      [row({ title: "시간건", start_time: "09:30:00", end_time: "12:00:00" }), row({ id: "2", title: "종일건" })],
      NOW,
    );
    const timed = items.find((i) => i.t === "시간건")!;
    const allDay = items.find((i) => i.t === "종일건")!;
    expect(timed).toMatchObject({ s: "09:30", n: "12:00" });
    expect(allDay.s).toBeUndefined();
    expect(allDay.n).toBeUndefined();
  });

  it("가족 일정에만 사람(p)을 넣는다", () => {
    const { items } = buildFeed(
      [row({ kind: "event", person: "mom", title: "병원" }), row({ kind: "lecture", person: "mom", title: "강의" })],
      NOW,
    );
    const mom = items.find((i) => i.t === "병원")!;
    const lec = items.find((i) => i.t === "강의")!;
    expect(mom).toMatchObject({ k: "e", p: "mom" });
    expect(lec.k).toBe("l");
    expect(lec.p).toBeUndefined();
  });

  it("금액으로 쓸 수 있는 칸을 내보내지 않는다", () => {
    const { items } = buildFeed([row({ start_time: "09:00:00", end_time: "10:00:00", kind: "event", person: "all" })], NOW);
    expect(Object.keys(items[0]).sort()).toEqual(["d", "k", "n", "p", "s", "t"]);
  });

  it("날짜 → 종일 먼저 → 시작 시간 → 제목순", () => {
    const { items } = buildFeed(
      [
        row({ id: "a", title: "나중", event_date: "2026-11-11", start_time: "10:00:00" }),
        row({ id: "b", title: "늦은시간", event_date: "2026-11-10", start_time: "14:00:00" }),
        row({ id: "c", title: "종일", event_date: "2026-11-10" }),
        row({ id: "d", title: "이른시간", event_date: "2026-11-10", start_time: "09:00:00" }),
      ],
      NOW,
    );
    expect(items.map((i) => i.t)).toEqual(["종일", "이른시간", "늦은시간", "나중"]);
  });

  it("아주 긴 제목은 끊어서 보낸다", () => {
    const { items } = buildFeed([row({ title: "가".repeat(200) })], NOW);
    expect(items[0].t.length).toBe(60);
  });

  it("만든 시각을 함께 보낸다", () => {
    expect(buildFeed([], NOW).at).toBe("2026-11-26T00:00:00.000Z");
  });
});
