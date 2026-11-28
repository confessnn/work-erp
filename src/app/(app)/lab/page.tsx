import type { Metadata } from "next";
import { LabRoom } from "@/features/lab/components/lab-room";
import { RosterList } from "@/features/lab/components/roster-list";
import { listLabTasks } from "@/features/lab/queries";
import { countByState, ROSTER } from "@/features/lab/roster";

export const metadata: Metadata = { title: "연구소 · work-erp" };

/**
 * 연구소 — 연구원에게 일을 맡기고 보드에서 진행을 본다.
 * ERP 는 지시를 받아 두기만 하고, 실제 작업은 맥에서 도는 워커가 가져가서 한다
 * (웹앱이 맥의 Claude Code 세션을 직접 실행할 수는 없다).
 */
export default async function LabPage() {
  const tasks = await listLabTasks();
  const n = countByState(ROSTER);

  return (
    <>
      <h1 className="page-title">연구소</h1>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">연구원 {ROSTER.length}명</h2>
          <p className="text-xs text-muted">
            운영중 {n.운영중} · 준비 {n.준비} · 예정 {n.예정}
          </p>
        </div>
        <LabRoom tasks={tasks} />
      </section>

      <section className="card space-y-3">
        <h2 className="section-title">명단</h2>
        <RosterList list={ROSTER} />
        <p className="text-xs text-muted">
          연구원은 ERP가 아니라 Claude Code 세션·예약 작업으로 돕니다. 여기서 보낸 일은 맥에서 도는 워커가
          가져가고, 맥이 꺼져 있으면 쌓여 있다가 켤 때 처리됩니다. 명단은{" "}
          <code>features/lab/roster.ts</code>에 있습니다.
        </p>
      </section>
    </>
  );
}
