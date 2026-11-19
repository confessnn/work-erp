import type { Metadata } from "next";
import Link from "next/link";
import { BuildGraphButton } from "@/features/records/components/build-graph-button";
import { GraphView } from "@/features/records/components/graph-view";
import { MIN_SERIES, newSince } from "@/features/records/graph";
import { latestGraph, listRecordEntries } from "@/features/records/queries";
import { groupSeries } from "@/features/records/series";

export const metadata: Metadata = { title: "관계도 · work-erp" };

/** 일 간의 관계도: AI가 일정 기록을 읽고 찾은 관계를 그림으로. 결과는 저장해 두고, 버튼을 누를 때만 다시 찾는다 */
export default async function RecordGraphPage() {
  const [entries, saved] = await Promise.all([listRecordEntries(), latestGraph()]);
  const seriesCount = groupSeries(entries).length;
  const added = saved ? newSince(saved.entryCount, entries.length) : 0;
  const enough = seriesCount >= MIN_SERIES;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">일 간의 관계도</h1>
        <Link href="/records" className="chip text-sm">
          기록 모아보기
        </Link>
      </div>
      <p className="text-sm text-muted">
        AI가 일정에 남긴 기록을 읽고, 기록에 근거가 있는 관계만 찾아 그려요. 준비·후속·영향은 화살표로, 같은 자료·같은 대상·비슷한 문제는 점선으로 이어요.
      </p>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {saved
            ? `${new Date(saved.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" })}에 기록 ${saved.entryCount}개로 찾았어요.${added ? ` 그 뒤로 기록이 ${added}개 늘었어요.` : ""}`
            : enough
              ? `기록이 있는 일 ${seriesCount}가지, 기록 ${entries.length}개가 있어요.`
              : `기록이 있는 일이 ${MIN_SERIES}가지 이상 쌓이면 관계를 찾을 수 있어요. (지금 ${seriesCount}가지)`}
        </p>
        {enough && <BuildGraphButton label={saved ? "관계 다시 찾기" : "관계 찾기"} />}
      </div>

      {saved && <GraphView graph={saved.graph} />}
    </>
  );
}
