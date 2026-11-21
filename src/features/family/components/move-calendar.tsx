"use client";

import { useState, useTransition } from "react";
import { moveFamilyEvent } from "../actions";
import { moveLectureToFamily } from "@/features/lectures/actions";
import { PERSONS, type Person } from "../types";

type Target = "lecture" | Person;

/**
 * 일정을 다른 달력(강의 · 아빠 · 엄마 · 임채현 · 가족)으로 옮기는 버튼 줄.
 * - 강의 → 가족 달력: 가족 일정을 만들고 강의는 지운다 (강의료·수령 기록은 옮겨지지 않음)
 * - 가족 일정 → 다른 사람: 누구의 일정인지만 바꾼다 / → 강의: 강의로 만들고 가족 일정은 지운다
 */
export function MoveCalendar({
  kind,
  id,
  current,
  allowLecture = true,
}: {
  kind: "lecture" | "family";
  id: string;
  current: Target;
  /** 강의로 옮기기 버튼 (가족을 만든 사람만) */
  allowLecture?: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const targets: { v: Target; label: string; cls: string }[] = [
    ...(allowLecture || kind === "lecture" ? [{ v: "lecture" as const, label: "강의", cls: "bg-peach/45" }] : []),
    ...PERSONS,
  ];

  const move = (to: Target) => {
    if (to === current) return;
    const label = targets.find((t) => t.v === to)?.label ?? "";
    const warn =
      kind === "lecture"
        ? `'${label}' 달력으로 옮길까요?\n강의 일정은 지워지고 강의료 정보는 옮겨지지 않아요. 구글에서 불러온 강의면 구글 캘린더에서도 지워져요.`
        : to === "lecture"
          ? "강의 일정으로 옮길까요? 강의료는 비어 있으니 옮긴 뒤 입력해 주세요."
          : `'${label}' 일정으로 바꿀까요?`;
    if (!confirm(warn)) return;
    setErr(null);
    start(async () => {
      const r = kind === "lecture" ? await moveLectureToFamily(id, to) : await moveFamilyEvent(id, to);
      if (r?.error) setErr(r.error);
    });
  };

  return (
    <section className="card space-y-3">
      <h2 className="section-title">다른 달력으로 옮기기</h2>
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => (
          <button
            key={t.v}
            type="button"
            disabled={pending || t.v === current}
            onClick={() => move(t.v)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${t.cls} ${t.v === current ? "outline-2 outline-accent" : "hover:opacity-80"} disabled:cursor-default`}
          >
            {t.v === current ? `✓ ${t.label}` : t.label}
          </button>
        ))}
      </div>
      {pending && <p className="text-sm text-muted">옮기는 중…</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
    </section>
  );
}
