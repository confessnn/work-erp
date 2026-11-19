import Link from "next/link";
import { dateLabel } from "@/lib/format";
import { listRecordEntries } from "../queries";
import { seriesKey } from "../series";

const SHOWN = 5;

/** 대시보드 '최근 기록' 위젯: 일정에 남긴 기록 최근 5개, 누르면 그 일의 기록 모아보기로 */
export async function RecentRecords() {
  const entries = await listRecordEntries().catch(() => null);
  if (entries === null) return <p className="card text-sm text-danger">기록을 불러오지 못했어요.</p>;
  const recent = [...entries]
    .sort((a, b) => b.date.localeCompare(a.date) || (b.start_time ?? "").localeCompare(a.start_time ?? ""))
    .slice(0, SHOWN);

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">최근 기록</h2>
        <div className="flex gap-3">
          <Link href="/records/graph" className="text-sm text-muted hover:underline">
            관계도
          </Link>
          <Link href="/records" className="text-sm text-muted hover:underline">
            모아보기 ›
          </Link>
        </div>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-muted">일정을 끝냈다고 체크하고 기록을 남기면 여기에 모여요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {recent.map((e) => (
            <li key={`${e.kind}:${e.id}`}>
              <Link href={`/records?s=${encodeURIComponent(seriesKey(e.title))}`} className="block py-2 hover:bg-line/30">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{e.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{dateLabel(e.date)}</span>
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted">{e.record}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
