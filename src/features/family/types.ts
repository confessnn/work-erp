/** 가족 달력 (supabase/migrations/20261108000000_family_calendar.sql) */

export type Person = "dad" | "mom" | "baby" | "all";

/** 누구의 일정인지. 색은 달력 칸과 목록에서 같이 쓴다. */
export const PERSONS: { v: Person; label: string; cls: string }[] = [
  { v: "dad", label: "아빠", cls: "bg-lavender/60" },
  { v: "mom", label: "엄마", cls: "bg-peach/60" },
  { v: "baby", label: "아기", cls: "bg-mint/70" },
  { v: "all", label: "가족", cls: "bg-ochre/50" },
];
export const personOf = (v: string) => PERSONS.find((p) => p.v === v) ?? PERSONS[3];

/** 강의 일정은 가족 달력에서 회색 칸으로, 제목·시간만 보인다 */
export const LECTURE_CLS = "bg-line";

export type FamilyEvent = {
  id: string;
  family_id: string;
  person: Person;
  title: string;
  event_date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  memo: string | null;
  created_by: string | null;
  updated_at: string;
  source_id: string | null; // 구글 캘린더에서 가져온 일정이면 원본 id (수정은 구글에서)
};

/** 가족에게 보이는 강의 일정. 금액·수령 여부 열은 DB 함수가 아예 주지 않는다. */
export type FamilyLecture = {
  id: string;
  title: string;
  organization: string | null;
  lecture_date: string;
  start_time: string | null;
  end_time: string | null;
};

export type FamilyRole =
  | { role: "owner"; userId: string }
  | { role: "member"; userId: string; ownerId: string; label: string };
