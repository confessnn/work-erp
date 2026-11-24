import { describe, expect, it } from "vitest";
import { backupFileName, backupSummary, buildBackup, monthFolderName, weekLabelOf, weekOfMonth } from "./backup";

describe("월 폴더·주차·파일 이름 (한국 시간)", () => {
  it("UTC 일요일 18:00 = 한국 월요일 03:00 → 다음 날·다음 달로 넘어감", () => {
    const now = new Date("2026-11-30T18:00:00Z"); // 한국 12월 1일 03:00
    expect(monthFolderName(now)).toBe("2026-12");
    expect(weekOfMonth(now)).toBe(1);
    expect(backupFileName(now)).toBe("work-erp-backup-2026-12-01-0300 (1주차).json");
  });

  it("주차: 1~7일 1주차, 8~14일 2주차, 29~31일 5주차", () => {
    expect(weekOfMonth(new Date("2026-11-07T00:00:00Z"))).toBe(1);
    expect(weekOfMonth(new Date("2026-11-08T00:00:00Z"))).toBe(2);
    expect(weekOfMonth(new Date("2026-11-24T05:07:00Z"))).toBe(4);
    expect(weekOfMonth(new Date("2026-11-29T00:00:00Z"))).toBe(5);
  });

  it("같은 날 여러 번 해도 이름이 겹치지 않음", () => {
    expect(backupFileName(new Date("2026-11-24T05:07:00Z"))).toBe("work-erp-backup-2026-11-24-1407 (4주차).json");
    expect(backupFileName(new Date("2026-11-24T05:08:00Z"))).not.toBe(backupFileName(new Date("2026-11-24T05:07:00Z")));
  });

  it("파일 이름에서 주차 읽기", () => {
    expect(weekLabelOf("work-erp-backup-2026-11-24-1407 (4주차).json")).toBe("4주차");
    expect(weekLabelOf("메모.json")).toBeNull();
  });
});

describe("buildBackup", () => {
  it("표별 행 개수를 함께 담음", () => {
    const b = buildBackup({ lectures: [{ id: 1 }, { id: 2 }], todos: [] }, new Date("2026-11-24T00:00:00Z"));
    expect(b.format).toBe("work-erp-backup");
    expect(b.counts).toEqual({ lectures: 2, todos: 0 });
    expect(b.tables.lectures).toHaveLength(2);
    expect(b.created_at).toBe("2026-11-24T00:00:00.000Z");
  });

  it("이상한 값이면 실패", () => {
    expect(() => buildBackup(null, new Date())).toThrow();
    expect(() => buildBackup([1, 2], new Date())).toThrow();
  });
});

describe("backupSummary", () => {
  it("주요 표만 한 줄로", () => {
    expect(backupSummary({ lectures: 65, todos: 26, bid_checked: 3, baby_logs: 79 })).toBe("강의 65 · 할 일 26 · 육아 기록 79");
  });
});
