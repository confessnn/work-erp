/**
 * 백업 파일 만들기 규칙 (순수 함수).
 * 드라이브 work-erp/백업/<YYYY-MM>/ 에 주차별 파일을 쌓고, 지우지 않는다 (파일 하나가 그 시점 기록 전체).
 */

export const BACKUP_FOLDER_NAME = "백업";
export const BACKUP_PREFIX = "work-erp-backup-";

export type BackupFile = {
  format: "work-erp-backup";
  version: 1;
  created_at: string;
  /** 표 이름 → 행 개수 (한눈에 보기용) */
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

/** 한국 시간 "YYYY-MM-DDTHH:MM" */
const kst = (now: Date) => new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 16);

/** 월 폴더 이름 (한국 시간): 2026-11 */
export function monthFolderName(now: Date): string {
  return kst(now).slice(0, 7);
}

/** 그 달의 몇째 주인지 (1~7일 1주차, 8~14일 2주차 …, 한국 시간) */
export function weekOfMonth(now: Date): number {
  return Math.ceil(Number(kst(now).slice(8, 10)) / 7);
}

/**
 * 파일 이름: work-erp-backup-2026-11-30-0300 (5주차).json
 * 날짜·시각이 앞에 있어 이름순 = 시간순이고, 같은 주에 '지금 백업하기'를 여러 번 해도 겹치지 않는다.
 */
export function backupFileName(now: Date): string {
  const t = kst(now);
  return `${BACKUP_PREFIX}${t.slice(0, 10)}-${t.slice(11, 13)}${t.slice(14, 16)} (${weekOfMonth(now)}주차).json`;
}

/** 파일 이름에서 몇째 주인지 (목록 표시용). 규칙에 안 맞으면 null */
export function weekLabelOf(name: string): string | null {
  const week = /\((\d)주차\)\.json$/.exec(name)?.[1];
  return week ? `${week}주차` : null;
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

/** 아침 브리핑에서 읽는 백업 상태 (DB cron_backup_status) */
export type BackupStatus = {
  applicable: boolean;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

/** 마지막 성공이 이보다 오래되면 '자동 백업이 안 돌았다'고 본다 (매주 1번이므로 하루 여유) */
export const STALE_BACKUP_DAYS = 8;
const DAY = 86_400_000;
const HOW_TO_FIX = "ERP 설정 > 백업에서 '지금 백업하기'를 눌러 주세요.";

/** 한국 시간 "11월 30일 03:00" */
function kstLabel(ms: number) {
  const t = kst(new Date(ms));
  return `${Number(t.slice(5, 7))}월 ${Number(t.slice(8, 10))}일 ${t.slice(11, 16)}`;
}

/**
 * 아침 브리핑 맨 위에 붙일 백업 경고. 문제가 없으면 null.
 * - 가장 최근 시도가 실패 → 실패 시각·이유 (성공할 때까지 매일 알림)
 * - 한 번도 성공한 적 없음 → 첫 백업 안내
 * - 마지막 성공이 8일 넘게 지남 → 자동 백업이 안 돌았을 수 있음
 */
export function backupProblem(s: BackupStatus | null, now: Date): string | null {
  if (!s?.applicable) return null;
  const ok = s.last_ok_at ? Date.parse(s.last_ok_at) : 0;
  const err = s.last_error_at ? Date.parse(s.last_error_at) : 0;
  if (err > ok) {
    const why = (s.last_error ?? "알 수 없는 오류").slice(0, 200).replace(/[.\s]+$/, "");
    return `백업 실패 (${kstLabel(err)}): ${why}. ${HOW_TO_FIX}`;
  }
  if (!ok) return `아직 백업이 한 번도 없습니다. ${HOW_TO_FIX}`;
  const days = Math.floor((now.getTime() - ok) / DAY);
  if (days >= STALE_BACKUP_DAYS) return `마지막 백업이 ${days}일 전(${kstLabel(ok)})입니다. 자동 백업이 돌지 않았을 수 있어요. ${HOW_TO_FIX}`;
  return null;
}
