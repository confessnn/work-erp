import Link from "next/link";
import { iconOf, ROSTER } from "../roster";
import { openCount, STATE_LABEL, type LabTask } from "../tasks";

/**
 * 대시보드 연구소 위젯. 연구원 얼굴과 앞에 쌓인 일 수만 보여 주고, 누르면 연구소 화면으로 간다
 * (일을 맡기는 팝업은 연구소 화면에 있다 — 대시보드에 입력창까지 두면 화면이 무거워진다).
 */
export function LabWidget({ tasks }: { tasks: LabTask[] }) {
  const open = tasks.filter((t) => t.state !== "done");
  const review = tasks.filter((t) => t.state === "review").length;

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">연구소</h2>
        <p className="text-xs text-muted">
          {open.length > 0 ? `진행 ${open.length}건` : "맡긴 일 없음"}
          {review > 0 && ` · ${STATE_LABEL.review} ${review}`}
        </p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {ROSTER.map((r) => {
          const n = openCount(tasks, r.id);
          return (
            <li key={r.id}>
              <Link
                href="/lab"
                prefetch={false}
                aria-label={`${r.name} — 맡긴 일 ${n}건`}
                className="relative flex w-16 flex-col items-center gap-1 rounded-xl border border-line bg-surface p-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 128px 고정 도트 아이콘 */}
                <img src={iconOf(r.id)} alt="" width={40} height={40} className="h-10 w-10 rounded-lg bg-bg" />
                <span className="w-full truncate text-center text-[11px]">{r.name}</span>
                {n > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-[10px] font-semibold text-white">
                    {n}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
