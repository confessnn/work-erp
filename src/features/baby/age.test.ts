import { describe, expect, it } from "vitest";
import { ageLabel, dayOfLife, milestone, monthKey, monthsOld, pickTakenAt, seoulDate } from "./age";

describe("dayOfLife", () => {
  it("태어난 날 = 1일, 백일 = +99일", () => {
    expect(dayOfLife("2026-11-04", "2026-11-04")).toBe(1);
    expect(dayOfLife("2026-11-04", "2026-11-05")).toBe(2);
    expect(dayOfLife("2026-11-04", "2027-02-11")).toBe(100);
    expect(dayOfLife("2026-11-04", "2026-11-03")).toBe(0);
  });
});

describe("monthsOld", () => {
  it("같은 날짜가 지나야 1개월", () => {
    expect(monthsOld("2026-11-04", "2026-12-03")).toBe(0);
    expect(monthsOld("2026-11-04", "2026-12-04")).toBe(1);
    expect(monthsOld("2026-11-04", "2027-11-04")).toBe(12);
  });
});

describe("milestone / ageLabel", () => {
  it("기념일", () => {
    expect(milestone("2026-11-04", "2026-11-04")).toBe("태어난 날");
    expect(milestone("2026-11-04", "2027-02-11")).toBe("백일");
    expect(milestone("2026-11-04", "2027-11-04")).toBe("첫 돌");
    expect(milestone("2026-11-04", "2026-11-20")).toBeNull();
  });
  it("표시 문구", () => {
    expect(ageLabel("2026-11-04", "2026-11-20")).toBe("생후 17일");
    expect(ageLabel("2026-11-04", "2027-01-10")).toBe("생후 68일 · 2개월");
    expect(ageLabel("2026-11-04", "2027-02-11")).toBe("🎉 백일 · 생후 100일 · 3개월");
    expect(ageLabel(null, "2027-02-11")).toBeNull();
    expect(ageLabel("2026-11-04", "2026-10-01")).toBeNull();
  });
});

describe("pickTakenAt", () => {
  it("EXIF 촬영 시각을 한국 시간으로 (자정 근처도 날짜가 밀리지 않음)", () => {
    // exifr 는 시간대 없는 시각을 현지 시각 Date 로 만든다
    const exifLocal = new Date(2026, 10, 5, 0, 30, 0);
    const r = pickTakenAt({ DateTimeOriginal: exifLocal }, 0);
    expect(r.source).toBe("exif");
    expect(seoulDate(r.takenAt)).toBe("2026-11-05");
  });
  it("EXIF 에 시간대가 있으면 사용", () => {
    const r = pickTakenAt({ DateTimeOriginal: new Date(2026, 10, 5, 23, 0, 0), OffsetTimeOriginal: "-08:00" }, 0);
    // 미국 서부 11/5 23:00 = 한국 11/6 16:00
    expect(seoulDate(r.takenAt)).toBe("2026-11-06");
  });
  it("EXIF 없으면 파일 수정 시각", () => {
    const t = Date.UTC(2026, 10, 4, 20, 0, 0); // 한국 11/5 05:00
    const r = pickTakenAt(null, t);
    expect(r).toEqual({ takenAt: new Date(t), source: "file" });
    expect(seoulDate(r.takenAt)).toBe("2026-11-05");
  });
  it("이상한 EXIF 날짜는 무시", () => {
    expect(pickTakenAt({ DateTimeOriginal: "0000:00:00 00:00:00" }, 1).source).toBe("file");
  });
});

describe("monthKey", () => {
  it("월 폴더", () => expect(monthKey("2026-11-05")).toBe("2026-11"));
});
