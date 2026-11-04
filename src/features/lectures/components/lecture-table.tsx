import Link from "next/link";
import { dateLabel, hoursLabel, timeLabel, won } from "@/lib/format";
import { actualPaid } from "@/features/dashboard/summary";
import type { Lecture } from "../types";
import { PaidToggle } from "./paid-toggle";

export function LectureTable({ lectures }: { lectures: Lecture[] }) {
  if (lectures.length === 0) {
    return <p className="card text-center text-muted">해당 기간에 등록된 일정이 없습니다.</p>;
  }

  return (
    <ul className="space-y-2">
      {lectures.map((l) => (
        <li key={l.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="w-24 shrink-0 text-sm">
            <div className="font-semibold">{dateLabel(l.lecture_date)}</div>
            {l.start_time && (
              <div className="text-muted">
                {timeLabel(l.start_time)}–{timeLabel(l.end_time)}
              </div>
            )}
          </div>
          <Link href={`/lectures/${l.id}`} className="min-w-0 flex-1 hover:underline">
            <div className="truncate font-medium">{l.title}</div>
            <div className="truncate text-sm text-muted">
              {[l.organization, hoursLabel(l.hours), l.income_type === "business" ? "사업 3.3%" : "기타 8.8%"]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </Link>
          <div className="text-right text-sm">
            <div className="font-semibold tabular-nums">{won(l.is_paid ? actualPaid(l) : l.expected_net)}</div>
            <div className="text-muted tabular-nums">세전 {won(l.gross_amount)}</div>
          </div>
          <PaidToggle id={l.id} paid={l.is_paid} />
        </li>
      ))}
    </ul>
  );
}
