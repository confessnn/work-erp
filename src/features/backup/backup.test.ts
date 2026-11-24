import { describe, expect, it } from "vitest";
import { backupFileName, backupProblem, backupSummary, buildBackup, monthFolderName, weekLabelOf, weekOfMonth } from "./backup";

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

describe("backupProblem", () => {
  const now = new Date("2026-12-01T22:00:00Z"); // 한국 12월 2일 07:00 (아침 브리핑)
  const base = { applicable: true, last_ok_at: null, last_error: null, last_error_at: null };

  it("드라이브가 연결되지 않았으면 알리지 않음", () => {
    expect(backupProblem(null, now)).toBeNull();
    expect(backupProblem({ ...base, applicable: false }, now)).toBeNull();
  });

  it("가장 최근 시도가 실패면 시각·이유", () => {
    const p = backupProblem({ ...base, last_ok_at: "2026-11-23T18:00:00Z", last_error: "드라이브 권한이 없습니다.", last_error_at: "2026-11-30T18:00:00Z" }, now);
    expect(p).toBe("백업 실패 (12월 1일 03:00): 드라이브 권한이 없습니다. ERP 설정 > 백업에서 '지금 백업하기'를 눌러 주세요.");
  });

  it("실패 뒤에 성공했으면 조용", () => {
    expect(backupProblem({ ...base, last_ok_at: "2026-12-01T01:00:00Z", last_error: "x", last_error_at: "2026-11-30T18:00:00Z" }, now)).toBeNull();
  });

  it("한 번도 성공한 적 없으면 첫 백업 안내", () => {
    expect(backupProblem(base, now)).toContain("아직 백업이 한 번도 없습니다");
  });

  it("마지막 성공이 8일 넘게 지나면 알림, 7일이면 조용", () => {
    expect(backupProblem({ ...base, last_ok_at: "2026-11-23T18:00:00Z" }, now)).toContain("마지막 백업이 8일 전(11월 24일 03:00)");
    expect(backupProblem({ ...base, last_ok_at: "2026-11-24T23:00:00Z" }, now)).toBeNull();
  });
});
