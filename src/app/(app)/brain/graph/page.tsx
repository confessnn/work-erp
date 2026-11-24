import type { Metadata } from "next";
import Link from "next/link";
import { BrainGraphView } from "@/features/brain/components/brain-graph-view";
import { listNoteMeta } from "@/features/brain/queries";

export const metadata: Metadata = { title: "그래프 · 세컨드브레인" };

/** 노트 그래프: [[링크]]로 이어진 노트들. 색은 PARA 구역 */
export default async function BrainGraphPage() {
  const notes = await listNoteMeta();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">노트 그래프</h1>
        <Link href="/brain" className="chip text-sm">
          세컨드브레인
        </Link>
      </div>
      <p className="text-sm text-muted">
        [[링크]]로 이어진 노트를 점과 선으로 그려요. 연결이 많은 노트일수록 점이 커요. ERP 기록 노트는 기관 링크로 같은 기관의 일끼리 모여요.
      </p>
      <BrainGraphView notes={notes} />
    </>
  );
}
