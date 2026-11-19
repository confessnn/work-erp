import type { Metadata } from "next";
import Link from "next/link";
import { ReviewButton } from "@/features/records/components/review-button";
import { listRecordEntries } from "@/features/records/queries";
import { editHref, groupSeries, matchesQuery } from "@/features/records/series";
import { dateLabel, timeLabel } from "@/lib/format";

export const metadata: Metadata = { title: "기록 · work-erp" };

/**
 * 일정에 남긴 기록 모아보기. 같은 일(회차 표시를 뗀 제목이 같은 일정)끼리 묶어
 * 지난 회차를 돌아보고, AI로 개선점을 정리하고, CSV로 내보낸다.
 */
export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const s = typeof sp.s === "string" ? sp.s : "";
  const all = await listRecordEntries();
  const series = groupSeries(all);
  const picked = s ? series.find((x) => x.key === s) : undefined;

  if (picked) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="page-title">{picked.name}</h1>
          <div className="flex gap-2">
            <a href={`/records/export?s=${encodeURIComponent(picked.key)}`} className="chip text-sm">
              CSV 내보내기
            </a>
            <Link href="/records" className="chip text-sm">
              전체 기록
            </Link>
          </div>
        </div>
        <p className="text-sm text-muted">기록 {picked.entries.length}개 · 최근 회차부터</p>

        {picked.entries.length >= 2 && <ReviewButton seriesKey={picked.key} count={Math.min(picked.entries.length, 30)} />}

        <ol className="space-y-2">
          {picked.entries.map((e) => (
            <li key={`${e.kind}:${e.id}`} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold tabular-nums">{dateLabel(e.date)}</span>
                {e.start_time && <span className="text-muted tabular-nums">{timeLabel(e.start_time)}</span>}
                <span className="text-muted">{[e.title !== picked.name ? e.title : null, e.organization].filter(Boolean).join(" · ")}</span>
                <Link href={editHref(e)} className="ml-auto text-xs text-muted hover:underline">
                  고치기
                </Link>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{e.record}</p>
            </li>
          ))}
        </ol>
      </>
    );
  }

  const shown = q ? series.map((x) => ({ ...x, entries: x.entries.filter((e) => matchesQuery(e, q)) })).filter((x) => x.entries.length) : series;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">기록</h1>
        <div className="flex gap-2">
          <Link href="/records/graph" className="chip text-sm">
            관계도
          </Link>
          <a href={`/records/export${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="chip text-sm">
            CSV 내보내기
          </a>
        </div>
      </div>
      <p className="text-sm text-muted">
        일정을 끝내고 남긴 기록이 같은 일끼리 모여요. 제목의 &apos;2회차&apos;, &apos;3차시&apos;, &apos;(4)&apos; 같은 회차 표시는 빼고 묶어요.
      </p>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="제목·기관·기록 내용으로 찾기" aria-label="기록 찾기" className="input flex-1" />
        <button type="submit" className="btn-primary shrink-0">
          찾기
        </button>
      </form>

      {shown.length === 0 ? (
        <p className="card text-center text-sm text-muted">
          {q ? "찾는 기록이 없어요." : "아직 남긴 기록이 없어요. 대시보드 '오늘 할 일'에서 일정을 끝냈다고 체크하면 기록을 남길 수 있어요."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((x) => {
            const last = x.entries[0];
            return (
              <li key={x.key}>
                <Link href={`/records?s=${encodeURIComponent(x.key)}`} className="card block space-y-1 hover:bg-line/30">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{x.name}</span>
                    <span className="text-xs text-muted">기록 {x.entries.length}개</span>
                    <span className="ml-auto text-xs text-muted tabular-nums">최근 {dateLabel(last.date)}</span>
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted">{last.record}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
