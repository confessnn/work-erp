import { iconOf, sortByState } from "../roster";
import type { Researcher, ResearcherState } from "../types";

/** 상태 뱃지 색 (globals.css 의 색 이름만 쓴다) */
const STATE_CLS: Record<ResearcherState, string> = {
  운영중: "border-success text-success",
  준비: "border-accent text-accent",
  예정: "border-line text-muted",
};

/**
 * 연구원 목록. 폰에서는 한 줄에 한 명, 화면이 넓어지면 두 줄로 놓는다.
 * 연구실 그림(배경 + 앉은 모습)은 폰에서 연구원이 18픽셀밖에 안 돼 누가 누군지 보이지 않아서,
 * 작은 화면에서는 얼굴 아이콘 목록으로 보여 준다.
 */
export function RosterList({ list }: { list: Researcher[] }) {
  return (
    <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0">
      {sortByState(list).map((r) => (
        <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- 128px 고정 크기 도트 그림이라 최적화가 필요 없다 */}
          <img
            src={iconOf(r.id)}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl bg-bg"
          />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-bold">{r.name}</span>
              <span className="min-w-0 text-xs text-muted">{r.duty}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted">{r.note}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATE_CLS[r.state]}`}>
              {r.state}
            </span>
            <span className="text-[11px] text-muted">{r.model}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
