import type { Metadata } from "next";
import { RosterList } from "@/features/lab/components/roster-list";
import { countByState, ROSTER } from "@/features/lab/roster";

export const metadata: Metadata = { title: "연구소 · work-erp" };

/**
 * 연구소 — 일을 맡기는 연구원 명단.
 * 연구원은 ERP 안에서 도는 것이 아니라 Claude Code 세션·예약 작업이라, 이 화면은 지금 누가 무슨 일을
 * 맡고 있는지만 보여 준다 (상태를 실시간으로 읽어 오지 않는다. 명단은 features/lab/roster.ts).
 */
export default function LabPage() {
  const n = countByState(ROSTER);
  return (
    <>
      <h1 className="page-title">연구소</h1>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="section-title">연구원 {ROSTER.length}명</h2>
          <p className="text-xs text-muted">
            운영중 {n.운영중} · 준비 {n.준비} · 예정 {n.예정}
          </p>
        </div>
        <RosterList list={ROSTER} />
        <p className="text-xs text-muted">
          연구원은 ERP가 아니라 Claude Code 세션과 예약 작업으로 돕니다. 상태는 직접 적어 둔 값이라 실시간이
          아니에요. 바꾸려면 <code>features/lab/roster.ts</code>를 고치면 됩니다.
        </p>
      </section>
    </>
  );
}
