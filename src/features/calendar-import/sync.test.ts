import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./ics";
import {
  eventToRow,
  findDuplicate,
  isErpCalendarUrl,
  isOwnErpEvent,
  lectureUpdate,
  planRemovals,
  type RemovalCandidate,
  matchesKeyword,
  planImport,
  type ExistingLecture,
} from "./sync";

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  uid: "u1",
  title: "원가계산 특강",
  location: "OO대학교",
  date: "2026-11-10",
  start: "14:00",
  end: "16:00",
  allDay: false,
  ...over,
});

describe("matchesKeyword", () => {
  it("비우면 전부", () => expect(matchesKeyword(ev({}), null)).toBe(true));
  it("쉼표로 여러 개, 제목·장소 검색", () => {
    expect(matchesKeyword(ev({}), "세미나, 특강")).toBe(true);
    expect(matchesKeyword(ev({ title: "치과" }), "강의, 특강")).toBe(false);
    expect(matchesKeyword(ev({ title: "출강" }), "대학교")).toBe(true);
  });
});

const erp = (over: Partial<ExistingLecture>): ExistingLecture => ({
  id: "L1",
  lecture_date: "2026-11-10",
  start_time: "14:00:00",
  title: "원가 특강",
  external_uid: null,
  ...over,
});

describe("findDuplicate", () => {
  it("같은 날짜 + 같은 시작 시각이면 제목이 달라도 같은 강의", () => {
    expect(findDuplicate(ev({ title: "OO대 원가계산" }), [erp({})])?.id).toBe("L1");
  });
  it("시작 시각이 다르면 다른 강의", () => {
    expect(findDuplicate(ev({ start: "15:00" }), [erp({})])).toBeNull();
  });
  it("종일 일정은 같은 날짜 + 같은 제목일 때만", () => {
    const allDay = ev({ start: null, end: null, allDay: true, title: "워크숍 " });
    expect(findDuplicate(allDay, [erp({ start_time: null, title: "워크숍" })])?.id).toBe("L1");
    expect(findDuplicate(allDay, [erp({ start_time: null, title: "다른 일" })])).toBeNull();
    expect(findDuplicate(allDay, [erp({})])).toBeNull();
  });
});

describe("isOwnErpEvent", () => {
  it("ERP가 내보낸 일정 구분", () => {
    expect(isOwnErpEvent("erp3f2504e04f8911d39a0c0305e82c3301@google.com")).toBe(true);
    expect(isOwnErpEvent("lec-1@work-erp")).toBe(true);
    expect(isOwnErpEvent("abc123@google.com")).toBe(false);
    expect(isOwnErpEvent("error-report@google.com")).toBe(false);
  });
});

describe("planImport", () => {
  it("이미 불러온·삭제한 일정과 키워드 불일치 제외", () => {
    const list = [ev({ uid: "a" }), ev({ uid: "b", start: "09:00" }), ev({ uid: "c", title: "가족 모임", location: null, start: "18:00" })];
    const plan = planImport(list, "특강", new Set(["a"]), []);
    expect(plan.newEvents.map((e) => e.uid)).toEqual(["b"]);
  });

  it("ERP에 같은 강의가 있으면 새로 만들지 않고 연결", () => {
    const plan = planImport([ev({ uid: "g1" })], null, new Set(), [erp({})]);
    expect(plan.newEvents).toEqual([]);
    expect(plan.links).toEqual([{ lecture_id: "L1", external_uid: "g1" }]);
  });

  it("이미 다른 구글 일정과 연결된 ERP 일정이면 건너뜀", () => {
    const plan = planImport([ev({ uid: "g2" })], null, new Set(), [erp({ external_uid: "g1" })]);
    expect(plan).toEqual({ newEvents: [], links: [], updates: [] });
  });

  it("ERP가 내보낸 일정은 다시 불러오지 않음", () => {
    const plan = planImport([ev({ uid: "erp3f2504e04f8911d39a0c0305e82c3301@google.com" })], null, new Set(), []);
    expect(plan.newEvents).toEqual([]);
  });

  it("같은 캘린더에 똑같은 일정이 두 개여도 하나만", () => {
    const plan = planImport([ev({ uid: "x1" }), ev({ uid: "x2" })], null, new Set(), []);
    expect(plan.newEvents.map((e) => e.uid)).toEqual(["x1"]);
  });
});

describe("반복 일정 시간 변경 (예: 백석문화대 ITQ 17:30 → 18:00)", () => {
  const SERIES = "4doo@google.com";
  // 옛 형식 ID(회차 시각 포함)로 불러온 강의: 시간당 4만 원 × 3시간
  const old = erp({
    id: "L9",
    lecture_date: "2026-12-01",
    start_time: "17:30:00",
    end_time: "20:30:00",
    title: "백석문화대 ITQ",
    external_uid: `${SERIES}#2026-12-01T17:30:00`,
    hours: "3.00",
    hourly_rate: 40_000,
    gross_amount: 120_000,
    income_type: "business",
    apply_tax_exemption: true,
  });
  const moved = ev({ uid: `${SERIES}#2026-12-01`, title: "백석문화대 ITQ", date: "2026-12-01", start: "18:00", end: "21:30" });

  it("새로 만들지 않고 기존 강의의 시간·강의료를 고친다", () => {
    const plan = planImport([moved], null, new Set([old.external_uid!]), [old]);
    expect(plan.newEvents).toEqual([]);
    expect(plan.links).toEqual([]);
    expect(plan.updates).toEqual([
      expect.objectContaining({
        id: "L9",
        external_uid: `${SERIES}#2026-12-01`,
        start_time: "18:00",
        end_time: "21:30",
        hours: 3.5,
        gross_amount: 140_000,
        income_tax: 4_200,
        local_tax: 420,
        expected_net: 135_380,
      }),
    ]);
  });

  it("고정 금액 강의는 금액을 그대로 둔다", () => {
    const fixed = { ...old, hourly_rate: 0, gross_amount: 500_000 };
    const [u] = planImport([moved], null, new Set(), [fixed]).updates;
    expect(u).toMatchObject({ hours: 3.5, start_time: "18:00" });
    expect(u.gross_amount).toBe(500_000);
  });

  it("시간이 같고 ID만 옛 형식이면 ID만 바꾼다", () => {
    const same = ev({ ...moved, start: "17:30", end: "20:30" });
    expect(planImport([same], null, new Set(), [old]).updates).toEqual([{ id: "L9", external_uid: `${SERIES}#2026-12-01` }]);
  });

  it("이미 새 형식이고 바뀐 게 없으면 할 일 없음", () => {
    const cur = { ...old, start_time: "18:00:00", end_time: "21:30:00", external_uid: moved.uid };
    expect(planImport([moved], null, new Set([moved.uid]), [cur])).toEqual({ newEvents: [], links: [], updates: [] });
  });

  it("옛 형식 ID로 삭제했던 회차는 시간이 바뀌어도 다시 불러오지 않음", () => {
    const plan = planImport([moved], null, new Set([`${SERIES}#2026-12-01T17:30:00`]), []);
    expect(plan).toEqual({ newEvents: [], links: [], updates: [] });
  });

  it("다른 날짜 회차는 따로", () => {
    const next = ev({ ...moved, uid: `${SERIES}#2026-12-02`, date: "2026-12-02" });
    expect(planImport([next], null, new Set([old.external_uid!]), [old]).newEvents.map((e) => e.uid)).toEqual([next.uid]);
  });

  it("lectureUpdate: 종일 일정으로 바뀌면 0시간", () => {
    const u = lectureUpdate(old, ev({ ...moved, start: null, end: null, allDay: true }));
    expect(u).toMatchObject({ start_time: null, end_time: null, hours: 0, gross_amount: 0 });
  });
});

describe("eventToRow", () => {
  it("시간 × 시간당 강의료 + 원천징수", () => {
    const row = eventToRow(ev({}), {
      hourly_rate: 300_000,
      income_type: "business",
      apply_tax_exemption: true,
      org_from_location: true,
    });
    expect(row).toMatchObject({
      external_uid: "u1",
      hours: 2,
      gross_amount: 600_000,
      income_tax: 18_000,
      local_tax: 1_800,
      expected_net: 580_200,
      organization: "OO대학교",
    });
  });

  it("종일 일정은 0시간 0원 (나중에 직접 수정)", () => {
    const row = eventToRow(ev({ start: null, end: null, allDay: true }), {
      hourly_rate: 300_000,
      income_type: "other",
      apply_tax_exemption: true,
      org_from_location: false,
    });
    expect(row).toMatchObject({ hours: 0, gross_amount: 0, expected_net: 0, organization: null });
  });
});

describe("planRemovals (구글에서 지운 일정 → ERP 강의 삭제)", () => {
  const NOW = Date.parse("2026-11-21T15:00:00Z");
  const opts = { from: "2026-11-21", to: "2027-11-21", erpCalendarCovered: true, now: NOW };
  const lec = (over: Partial<RemovalCandidate>): RemovalCandidate => ({
    id: "L1",
    lecture_date: "2026-12-04",
    external_uid: "4doo@google.com#2026-12-04T18:00:00",
    google_event_id: null,
    google_synced_at: null,
    updated_at: "2026-11-18T21:51:36Z",
    ...over,
  });
  const keep = ev({ uid: "4doo@google.com#2026-12-03", date: "2026-12-03" });

  it("구글에서 없어진 불러온 강의는 지움 (옛 형식 ID도)", () => {
    expect(planRemovals([keep], [lec({})], opts).ids).toEqual(["L1"]);
  });

  it("구글에 아직 있으면 (시간이 바뀌었어도) 그대로", () => {
    const still = ev({ uid: "4doo@google.com#2026-12-04", date: "2026-12-04", start: "19:00" });
    expect(planRemovals([still], [lec({})], opts).ids).toEqual([]);
  });

  it("범위 밖(지난) 강의는 지우지 않음", () => {
    expect(planRemovals([keep], [lec({ lecture_date: "2026-11-20" })], opts).ids).toEqual([]);
  });

  it("받아온 일정이 하나도 없으면 아무것도 지우지 않음", () => {
    expect(planRemovals([], [lec({})], opts)).toMatchObject({ ids: [] });
    expect(planRemovals([], [lec({})], opts).blocked).toBeTruthy();
  });

  it("한꺼번에 너무 많이 없어지면 멈춤", () => {
    const many = Array.from({ length: 12 }, (_, i) => lec({ id: `L${i}`, external_uid: `x${i}@google.com` }));
    const r = planRemovals([keep], many, opts);
    expect(r.ids).toEqual([]);
    expect(r.blocked).toContain("12건");
  });

  describe("ERP가 구글에 올린 강의", () => {
    const pushed = lec({
      id: "P1",
      lecture_date: "2026-12-21",
      external_uid: null,
      google_event_id: "erp84f1e44f8d1c4cb984d50fcc9a0c4d11",
      google_synced_at: "2026-11-19T07:29:10Z",
      updated_at: "2026-11-19T07:29:08Z",
    });

    it("구글에서 지웠으면 지움", () => {
      expect(planRemovals([keep], [pushed], opts).ids).toEqual(["P1"]);
    });
    it("구글에 있으면 그대로", () => {
      const copy = ev({ uid: "erp84f1e44f8d1c4cb984d50fcc9a0c4d11@google.com", date: "2026-12-21" });
      expect(planRemovals([keep, copy], [pushed], opts).ids).toEqual([]);
    });
    it("ERP 캘린더를 받아오지 않았으면 판단하지 않음", () => {
      expect(planRemovals([keep], [pushed], { ...opts, erpCalendarCovered: false }).ids).toEqual([]);
    });
    it("올린 뒤 ERP에서 고쳤거나(아직 안 올라감) 올린 지 하루가 안 됐으면 그대로", () => {
      expect(planRemovals([keep], [{ ...pushed, updated_at: "2026-11-20T00:00:00Z" }], opts).ids).toEqual([]);
      expect(planRemovals([keep], [{ ...pushed, google_synced_at: "2026-11-21T10:00:00Z", updated_at: "2026-11-21T09:00:00Z" }], opts).ids).toEqual([]);
      expect(planRemovals([keep], [{ ...pushed, google_synced_at: null }], opts).ids).toEqual([]);
    });
  });
});

describe("isErpCalendarUrl", () => {
  const id = "41c0ba46df13@group.calendar.google.com";
  it("구글 iCal 주소에 들어 있는 캘린더 ID로 판단", () => {
    expect(isErpCalendarUrl("https://calendar.google.com/calendar/ical/41c0ba46df13%40group.calendar.google.com/private-x/basic.ics", id)).toBe(true);
    expect(isErpCalendarUrl("https://calendar.google.com/calendar/ical/other%40gmail.com/private-x/basic.ics", id)).toBe(false);
    expect(isErpCalendarUrl("https://x/basic.ics", null)).toBe(false);
  });
});
