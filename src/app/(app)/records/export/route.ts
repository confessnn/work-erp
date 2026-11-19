import { listRecordEntries } from "@/features/records/queries";
import { groupSeries, matchesQuery, toCsv } from "@/features/records/series";
import { todayInSeoul } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";

/** 기록 CSV 내려받기. ?s=<묶음> 이면 그 일만, ?q=<검색어> 면 찾은 것만 */
export async function GET(request: Request) {
  const { supabase } = await requireUser();
  const url = new URL(request.url);
  const s = url.searchParams.get("s");
  const q = url.searchParams.get("q")?.trim() ?? "";

  let entries = await listRecordEntries(supabase);
  if (s) entries = groupSeries(entries).find((x) => x.key === s)?.entries ?? [];
  if (q) entries = entries.filter((e) => matchesQuery(e, q));

  return new Response(toCsv(entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`기록_${todayInSeoul()}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}
