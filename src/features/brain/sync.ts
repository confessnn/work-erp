// 동기화 계획: 드라이브 볼트의 노트 목록과 ERP 사본을 비교해 받을 것·지울 것을 고른다 (순수 함수)

export type RemoteNote = { id: string; path: string; modifiedTime: string };
export type LocalNote = { drive_file_id: string; path: string; modified_at: string };

/** 한 번에 받는 최대 노트 수 (서버 시간 제한). 남으면 다시 누르면 이어서 받는다 */
export const MAX_DOWNLOADS = 250;
/** 노트 하나의 최대 크기 — 넘으면 앞부분만 저장 */
export const MAX_NOTE_CHARS = 200_000;

export function planSync(
  remote: RemoteNote[],
  local: LocalNote[],
  max = MAX_DOWNLOADS,
): { download: RemoteNote[]; moved: RemoteNote[]; remove: string[]; remaining: number } {
  const have = new Map(local.map((l) => [l.drive_file_id, l]));
  const changed: RemoteNote[] = [];
  const moved: RemoteNote[] = [];
  for (const r of remote) {
    const l = have.get(r.id);
    if (!l || new Date(l.modified_at).getTime() < new Date(r.modifiedTime).getTime()) changed.push(r);
    else if (l.path !== r.path) moved.push(r); // 내용은 같고 폴더·이름만 바뀜
  }
  // 최근에 고친 노트부터 받는다
  changed.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
  const ids = new Set(remote.map((r) => r.id));
  return {
    download: changed.slice(0, max),
    moved,
    remove: local.filter((l) => !ids.has(l.drive_file_id)).map((l) => l.drive_file_id),
    remaining: Math.max(0, changed.length - max),
  };
}

/** 동기화 결과 한 줄 */
export function syncSummary(r: { total: number; downloaded: number; removed: number; remaining: number }): string {
  const parts = [`노트 ${r.total}개`];
  if (r.downloaded) parts.push(`새로 받음 ${r.downloaded}`);
  if (r.removed) parts.push(`지움 ${r.removed}`);
  if (r.remaining) parts.push(`남음 ${r.remaining} (한 번 더 눌러 주세요)`);
  if (!r.downloaded && !r.removed && !r.remaining) parts.push("바뀐 것 없음");
  return parts.join(" · ");
}
