/** 백업 파일 만들기·정리 규칙 (순수 함수) */

export const BACKUP_FOLDER_NAME = "백업";
export const BACKUP_PREFIX = "work-erp-backup-";
/** 드라이브에 남겨 두는 백업 개수 (매주 1개 → 약 6개월) */
export const KEEP_BACKUPS = 26;

export type BackupFile = {
  format: "work-erp-backup";
  version: 1;
  created_at: string;
  /** 표 이름 → 행 개수 (한눈에 보기용) */
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

/** 한국 시간 날짜·시각으로 파일 이름: work-erp-backup-2026-11-24-0300.json (같은 날 여러 번 해도 겹치지 않게) */
export function backupFileName(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600_000).toISOString(); // YYYY-MM-DDTHH:MM
  return `${BACKUP_PREFIX}${kst.slice(0, 10)}-${kst.slice(11, 13)}${kst.slice(14, 16)}.json`;
}

/** DB 함수(my_backup·cron_backup_dump) 결과 → 백업 파일 내용 */
export function buildBackup(dump: unknown, now: Date): BackupFile {
  if (!dump || typeof dump !== "object" || Array.isArray(dump)) throw new Error("백업할 데이터를 읽지 못했습니다.");
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(dump as Record<string, unknown>)) {
    const list = Array.isArray(rows) ? rows : [];
    tables[name] = list;
    counts[name] = list.length;
  }
  return { format: "work-erp-backup", version: 1, created_at: now.toISOString(), counts, tables };
}

/** 백업 폴더 파일 중 오래된 것부터 지울 목록 (백업 파일 이름 규칙에 맞는 것만, 최신 keep 개는 남김) */
export function filesToPrune<T extends { name: string }>(files: T[], keep = KEEP_BACKUPS): T[] {
  const backups = files.filter((f) => f.name.startsWith(BACKUP_PREFIX) && f.name.endsWith(".json"));
  backups.sort((a, b) => b.name.localeCompare(a.name)); // 이름에 날짜가 있어 이름순 = 시간순
  return backups.slice(keep);
}

/** 백업 요약 한 줄: "강의 65 · 할 일 26 · 육아 기록 79 …" */
const LABELS: Record<string, string> = {
  lectures: "강의",
  todos: "할 일",
  family_events: "가족 일정",
  baby_logs: "육아 기록",
  baby_photos: "아기 사진",
  documents: "서류",
  bid_notices: "공고",
};
export function backupSummary(counts: Record<string, number>): string {
  return Object.entries(LABELS)
    .filter(([k]) => k in counts)
    .map(([k, label]) => `${label} ${counts[k]}`)
    .join(" · ");
}
