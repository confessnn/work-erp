import { describe, expect, it } from "vitest";
import { backupFileName, backupSummary, buildBackup, filesToPrune } from "./backup";

describe("backupFileName", () => {
  it("한국 시간 기준 날짜·시각", () => {
    // UTC 18:00 일요일 = 한국 월요일 03:00
    expect(backupFileName(new Date("2026-11-29T18:00:00Z"))).toBe("work-erp-backup-2026-11-30-0300.json");
    expect(backupFileName(new Date("2026-11-24T05:07:00Z"))).toBe("work-erp-backup-2026-11-24-1407.json");
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

describe("filesToPrune", () => {
  const f = (name: string) => ({ name });
  it("최신 keep 개만 남기고 나머지를 오래된 것부터", () => {
    const files = [
      f("work-erp-backup-2026-11-03-0300.json"),
      f("work-erp-backup-2026-11-24-0300.json"),
      f("work-erp-backup-2026-11-10-0300.json"),
      f("work-erp-backup-2026-11-17-0300.json"),
    ];
    expect(filesToPrune(files, 2).map((x) => x.name)).toEqual(["work-erp-backup-2026-11-10-0300.json", "work-erp-backup-2026-11-03-0300.json"]);
    expect(filesToPrune(files, 10)).toEqual([]);
  });

  it("백업 이름 규칙이 아닌 파일은 건드리지 않음", () => {
    const files = [f("메모.txt"), f("work-erp-backup-2026-11-03-0300.json"), f("work-erp-backup-old.zip")];
    expect(filesToPrune(files, 0).map((x) => x.name)).toEqual(["work-erp-backup-2026-11-03-0300.json"]);
  });
});

describe("backupSummary", () => {
  it("주요 표만 한 줄로", () => {
    expect(backupSummary({ lectures: 65, todos: 26, bid_checked: 3, baby_logs: 79 })).toBe("강의 65 · 할 일 26 · 육아 기록 79");
  });
});
