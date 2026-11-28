import Link from "next/link";
import { LabRoom } from "./lab-room";
import { STATE_LABEL, type LabTask } from "../tasks";

/**
 * 대시보드 연구소 칸. 연구소 화면과 같은 것을 보여 준다 — 넓은 화면에서는 연구실 그림,
 * 폰에서는 얼굴 목록. 눌러서 바로 일을 맡길 수 있다.
 * 작업 보드만 여기서는 빼고 건수만 적는다 (대시보드가 너무 길어지지 않게). 보드는 /lab 에 있다.
 */
export function LabWidget({ tasks }: { tasks: LabTask[] }) {
  const open = tasks.filter((t) => t.state !== "done").length;
  const review = tasks.filter((t) => t.state === "review").length;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">연구소</h2>
        <p className="flex items-baseline gap-2 text-xs text-muted">
          <span>
            {open > 0 ? `진행 ${open}건` : "맡긴 일 없음"}
            {review > 0 && ` · ${STATE_LABEL.review} ${review}`}
          </span>
          <Link href="/lab" prefetch={false} className="chip px-3 py-1">
            작업 보드
          </Link>
        </p>
      </div>

      <LabRoom tasks={tasks} board={false} />
    </section>
  );
}
