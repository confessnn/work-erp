import Link from "next/link";
import { createLecture } from "@/features/lectures/actions";
import { LectureForm } from "@/features/lectures/components/lecture-form";
import { listOrganizations } from "@/features/lectures/queries";
import { saveFamilyEvent } from "@/features/family/actions";
import { FamilyEventForm } from "@/features/family/components/event-form";
import type { Person } from "@/features/family/types";
import { todayInSeoul } from "@/lib/format";

const KINDS = [
  { v: "lecture", label: "강의" },
  { v: "family", label: "가족 일정 (아내·아기 등)" },
] as const;

/** 일정 추가: 강의와 가족 일정을 한 곳에서. 가족 일정은 가족 달력에도 똑같이 보인다 */
export default async function NewSchedulePage({ searchParams }: PageProps<"/lectures/new">) {
  const sp = await searchParams;
  const kind = sp.type === "family" ? "family" : "lecture";
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayInSeoul();
  const person: Person = sp.person === "mom" || sp.person === "baby" || sp.person === "all" ? sp.person : "mom";
  const organizations = kind === "lecture" ? await listOrganizations() : [];

  return (
    <>
      <h1 className="page-title">일정 추가</h1>
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.v}
            href={k.v === "family" ? `/lectures/new?type=family&date=${date}` : `/lectures/new?date=${date}`}
            className={`choice ${kind === k.v ? "choice-on" : ""}`}
            replace
          >
            {k.label}
          </Link>
        ))}
      </div>

      {kind === "family" ? (
        <FamilyEventForm action={saveFamilyEvent.bind(null, null)} defaultDate={date} defaultPerson={person} submitLabel="저장" back="lectures" />
      ) : (
        <LectureForm action={createLecture} organizations={organizations} defaultDate={date} submitLabel="저장" />
      )}
    </>
  );
}
