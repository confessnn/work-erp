// Supabase(PostgREST) 는 한 번에 1000줄까지만 돌려준다. 그보다 많을 수 있는 목록은 이걸로 나눠 읽는다.

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
