import Link from "next/link";
import { dateLabel, hoursLabel, timeLabel, won } from "@/lib/format";
import { actualPaid } from "@/features/dashboard/summary";
import { personOf, type FamilyEvent } from "@/features/family/types";
import type { Lecture } from "../types";
import { PaidToggle } from "./paid-toggle";

type Row = { kind: "lecture"; key: string; l: Lecture } | { kind: "family"; key: string; e: FamilyEvent };
const sortKey = (date: string, time: string | null) => `${date} ${time ?? "00:00"}`;

/** 강의 + 가족 일정(아내·아기 등)을 날짜·시간 순으로 한 목록에. 가족 일정에는 금액이 없다 */
export function LectureTable({ lectures, familyEvents = [] }: { lectures: Lecture[]; familyEvents?: FamilyEvent[] }) {
  if (lectures.length === 0 && familyEvents.length === 0) {
    return <p className="card text-center text-muted">해당 기간에 등록된 일정이 없습니다.</p>;
  }

  const rows: Row[] = [
    ...lectures.map((l) => ({ kind: "lecture" as const, key: sortKey(l.lecture_date, l.start_time), l })),
    ...familyEvents.map((e) => ({ kind: "family" as const, key: sortKey(e.event_date, e.start_time), e })),
  ].sort((a, b) => a.key.localeCompare(b.key));

  return (
    <ul className="space-y-2">
      {rows.map((r) => (r.kind === "family" ? <FamilyRow key={`f${r.e.id}`} e={r.e} /> : <LectureRow key={r.l.id} l={r.l} />))}
    </ul>
  );
}

function FamilyRow({ e }: { e: FamilyEvent }) {
  const p = personOf(e.person);
  return (
    <li className="card flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="w-24 shrink-0 text-sm">
        <div className="font-semibold">{dateLabel(e.event_date)}</div>
        <div className="text-muted">{e.start_time ? `${timeLabel(e.start_time)}${e.end_time ? `–${timeLabel(e.end_time)}` : ""}` : "종일"}</div>
      </div>
      <Link href={`/family/${e.id}?back=lectures`} className="min-w-0 flex-1 hover:underline">
        <div className="truncate font-medium">{e.title}</div>
        {e.memo && <div className="truncate text-sm text-muted">{e.memo}</div>}
      </Link>
      <span className={`badge ${p.cls}`}>{p.label}</span>
    </li>
  );
}

function LectureRow({ l }: { l: Lecture }) {
  return (
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
  );
}
