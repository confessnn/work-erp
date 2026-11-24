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

/**
 * 같은 폴더에 같은 이름 파일이 여러 개일 때 (내보내기가 동시에 두 번 돌아 둘 다 새로 만든 경우)
 * 남길 파일 하나와 휴지통으로 보낼 나머지. 누가 골라도 같은 결과가 되도록 ID 가 가장 작은 것을 남긴다.
 */
export function splitDuplicates<T extends { id: string }>(same: T[]): { keep: T | null; extra: T[] } {
  const sorted = [...same].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { keep: sorted[0] ?? null, extra: sorted.slice(1) };
}

/** 여러 쪽으로 나눠 읽을 때 한 쪽 크기 (Supabase API 는 한 번에 1000줄까지만 돌려준다) */
export const PAGE_ROWS = 1000;

/** 쪽마다 읽어서 모두 모은다 (max 까지). 쪽이 덜 차면 끝 */
export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = Infinity,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE_ROWS) {
    const { data, error } = await page(from, Math.min(from + PAGE_ROWS, max) - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < Math.min(PAGE_ROWS, max - from)) break;
  }
  return out;
}
