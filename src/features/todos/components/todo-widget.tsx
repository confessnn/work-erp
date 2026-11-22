"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { dateLabel } from "@/lib/format";
import {
  addTodo,
  deleteTodo,
  listTodosOn,
  postponeTodo,
  saveScheduleRecord,
  saveTodoNote,
  setSharedTodoDone,
  setTodoDone,
  setTodoShared,
} from "../actions";
import type { BabyTodo } from "@/features/baby-care/baby-todos";
import { setBabyTodoDone } from "@/features/baby-care/todo-actions";
import { addDays, NOTE_MAX, progress, RECORD_MAX, recordTarget, sourceLabel, type SharedTodo, type Todo } from "../todos";

/**
 * 대시보드 '오늘 할 일' 위젯: 적고, 체크하고, 내일로 미루고, 지운다. 누르면 바로 바뀌고 서버에는 뒤에서 저장한다.
 * 오늘 일정과 일정 메모의 줄도 할 일로 들어온다 (출처가 작게 붙는다).
 * 일정 자체 할 일은 끝났다고 체크하면 기록 칸이 열리고, 기록은 그 일정에 저장된다.
 * 다른 할 일에는 메모(담당자 연락처, 금액 등)를 붙일 수 있다.
 * ‹ › 로 날짜를 넘기면 그날의 할 일을 보고, 미래 날짜에 미리 적어 둘 수 있다.
 * '공유'를 켠 할 일은 가족(가족을 만든 사람 ↔ 초대받은 가족)의 '공유받은 할 일'에 보인다.
 * 공유받은 할 일은 보고 완료 체크만 할 수 있다.
 * 아기 할 일(임채현 → 할 일)은 부부 공용 한 건이라, 여기서 체크해도 가족 모두에게 같이 완료된다.
 */
export function TodoWidget({
  initial,
  today,
  shared: sharedInitial = [],
  canShare = false,
  baby: babyInitial = [],
  babyName = "아기",
}: {
  initial: Todo[];
  today: string;
  /** 가족이 나에게 공유한 할 일 */
  shared?: SharedTodo[];
  /** 가족이 있어야 공유 버튼을 보여 준다 */
  canShare?: boolean;
  /** 아기 할 일 (가족 공용) */
  baby?: BabyTodo[];
  babyName?: string;
}) {
  const [shared, setShared] = useState(sharedInitial);
  const [baby, setBaby] = useState(babyInitial);
  const [day, setDay] = useState(today);
  const [items, setItems] = useState(initial);
  const [todayItems, setTodayItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const isToday = day === today;

  /** 날짜 넘기기: 오늘은 처음 받은 목록(밀린 할 일 포함), 다른 날은 그날 적어 둔 할 일 */
  async function go(next: string) {
    if (isToday) setTodayItems(items);
    setEditing(null);
    setError(null);
    setDay(next);
    if (next === today) {
      setItems(todayItems);
      return;
    }
    setLoading(true);
    const r = await listTodosOn(next);
    setLoading(false);
    if (r.ok) setItems(r.todos);
    else {
      setItems([]);
      setError(r.message);
    }
  }
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 기록(일정 할 일)이나 메모(다른 할 일)를 쓰고 있는 할 일 id와 쓰던 내용 */
  const [editing, setEditing] = useState<{ id: string; kind: "record" | "note"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggleBaby = (t: BabyTodo) => {
    const before = baby;
    setBaby(baby.map((x) => (x.id === t.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x)));
    start(async () => {
      const r = await setBabyTodoDone(t.id, !t.done_at);
      if (!r.ok) {
        setBaby(before);
        setError(r.message);
      }
    });
  };
  const { done, total } = progress(items);

  /** 화면을 먼저 바꾸고, 저장이 실패하면 되돌린다 */
  function run(next: Todo[], save: () => Promise<{ ok: boolean; message?: string }>) {
    const before = items;
    setItems(next);
    setError(null);
    start(async () => {
      const r = await save();
      if (!r.ok) {
        setItems(before);
        setError(r.message ?? "저장하지 못했어요.");
      }
    });
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText("");
    setError(null);
    start(async () => {
      const r = await addTodo(title, day);
      if (r.ok && r.todo) setItems((xs) => [...xs.filter((t) => !t.done_at), r.todo!, ...xs.filter((t) => t.done_at)]);
      else if (!r.ok) {
        setText(title);
        setError(r.message);
      }
    });
  }

  const toggle = (t: Todo) => {
    // 일정을 끝냈다고 체크하면, 아직 기록이 없을 때 기록 칸을 바로 연다
    if (!t.done_at && recordTarget(t) && !t.record) setEditing({ id: t.id, kind: "record", text: "" });
    run(
      items.map((x) => (x.id === t.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x)),
      () => setTodoDone(t.id, !t.done_at),
    );
  };
  const saveRecord = (t: Todo, text: string) => {
    setEditing(null);
    const record = text.trim() ? text.trim().slice(0, RECORD_MAX) : null;
    if (record === (t.record ?? null)) return;
    run(
      items.map((x) => (x.id === t.id ? { ...x, record } : x)),
      () => saveScheduleRecord(t.id, text),
    );
  };
  const saveNote = (t: Todo, text: string) => {
    setEditing(null);
    const note = text.trim() ? text.trim().slice(0, NOTE_MAX) : null;
    if (note === (t.note ?? null)) return;
    run(
      items.map((x) => (x.id === t.id ? { ...x, note } : x)),
      () => saveTodoNote(t.id, text),
    );
  };
  const remove = (t: Todo) => run(items.filter((x) => x.id !== t.id), () => deleteTodo(t.id));
  const toggleShare = (t: Todo) =>
    run(
      items.map((x) => (x.id === t.id ? { ...x, shared: !x.shared } : x)),
      () => setTodoShared(t.id, !t.shared),
    );
  const toggleShared = (t: SharedTodo) => {
    const before = shared;
    setShared(shared.map((x) => (x.id === t.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x)));
    setError(null);
    start(async () => {
      const r = await setSharedTodoDone(t.id, !t.done_at);
      if (!r.ok) {
        setShared(before);
        setError(r.message);
      }
    });
  };
  const postpone = (t: Todo) => run(items.filter((x) => x.id !== t.id), () => postponeTodo(t.id, day));

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(addDays(day, -1))} aria-label="전날" className="px-1.5 text-lg text-muted hover:text-fg">
            ‹
          </button>
          <h2 className="section-title">{isToday ? "오늘 할 일" : `${dateLabel(day)} 할 일`}</h2>
          <button type="button" onClick={() => go(addDays(day, 1))} aria-label="다음 날" className="px-1.5 text-lg text-muted hover:text-fg">
            ›
          </button>
          {!isToday && (
            <button type="button" onClick={() => go(today)} className="chip ml-1 text-xs">
              오늘로
            </button>
          )}
        </div>
        <span className="text-sm tabular-nums text-muted">
          {loading ? "불러오는 중…" : total ? `${done}/${total} 완료` : dateLabel(day)}
        </span>
      </div>
      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full bg-success transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder={isToday ? "할 일 적기 (예: 견적서 보내기)" : `${dateLabel(day)}에 할 일 미리 적기`}
          aria-label="새 할 일"
          className="input flex-1"
        />
        <button type="submit" disabled={pending || !text.trim()} className="btn-primary shrink-0">
          추가
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      {total === 0 ? (
        <p className="text-sm text-muted">
          {isToday
            ? "오늘 할 일이 없어요. 위에 적거나, 일정 메모에 적으면 여기에 들어와요."
            : day > today
              ? "이날 적어 둔 할 일이 없어요. 위에 적어 두면 그날 '오늘 할 일'에 나와요."
              : "이날 적어 둔 할 일이 없어요."}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((t) => {
            const late = isToday && t.due_date < today;
            const from = sourceLabel(t);
            const canRecord = !!recordTarget(t);
            const open = editing?.id === t.id;
            const kind = canRecord ? "record" : "note";
            const value = canRecord ? t.record : t.note;
            return (
              <li key={t.id} className="py-2">
                <div className="group flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!t.done_at}
                    onChange={() => toggle(t)}
                    aria-label={`${t.title} ${t.done_at ? "안 한 것으로" : "완료"}`}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-success)]"
                  />
                  <span className={`min-w-0 flex-1 break-words text-sm ${t.done_at ? "text-muted line-through" : ""}`}>
                    {t.title}
                    {from && <span className="ml-2 text-xs text-muted">{from}</span>}
                    {canRecord && t.ended && !t.done_at && <span className="ml-2 text-xs text-warn">끝났나요?</span>}
                    {late && !t.done_at && <span className="ml-2 text-xs text-warn">밀림 · {dateLabel(t.due_date)}</span>}
                  </span>
                  {!open && (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: t.id, kind, text: value ?? "" })}
                      className="shrink-0 text-xs text-muted hover:underline"
                    >
                      {canRecord ? (t.record ? "기록 고치기" : "기록") : t.note ? "메모 고치기" : "메모"}
                    </button>
                  )}
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => toggleShare(t)}
                      aria-pressed={!!t.shared}
                      title={t.shared ? "가족에게 공유 중 (누르면 공유 끄기)" : "가족에게 공유하기"}
                      className={`shrink-0 text-xs hover:underline ${t.shared ? "font-semibold text-success" : "text-muted"}`}
                    >
                      {t.shared ? "공유 중" : "공유"}
                    </button>
                  )}
                  {!t.done_at && (
                    <button type="button" onClick={() => postpone(t)} className="shrink-0 text-xs text-muted hover:underline">
                      {isToday ? "내일로" : "다음 날로"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(t)}
                    aria-label={`${t.title} 지우기`}
                    className="shrink-0 px-1 text-muted hover:text-danger"
                  >
                    ×
                  </button>
                </div>
                {t.previous && !open && (
                <Link
                  href={`/records?s=${encodeURIComponent(t.previous.series)}`}
                  className="mt-1 ml-8 block rounded-lg border border-line px-3 py-2 text-xs hover:bg-line/30"
                >
                  <span className="text-muted">지난 회차 {dateLabel(t.previous.date)} 기록 · 모아보기 ›</span>
                  <span className="mt-0.5 line-clamp-2 block whitespace-pre-wrap break-words">{t.previous.record}</span>
                </Link>
              )}
              {t.note && !open && (
                  <p className="mt-1 ml-8 whitespace-pre-wrap break-words rounded-lg border border-line px-3 py-2 text-xs">{t.note}</p>
                )}
              {canRecord && t.record && !open && (
                  <p className="mt-1 ml-8 whitespace-pre-wrap break-words rounded-lg bg-line/40 px-3 py-2 text-xs">{t.record}</p>
                )}
                {open && (
                  <form
                    className="mt-2 ml-8 space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editing?.kind === "note") saveNote(t, editing.text);
                      else saveRecord(t, editing?.text ?? "");
                    }}
                  >
                    <textarea
                      autoFocus
                      rows={3}
                      maxLength={editing?.kind === "note" ? NOTE_MAX : RECORD_MAX}
                      value={editing?.text ?? ""}
                      onChange={(e) => setEditing({ id: t.id, kind: editing?.kind ?? kind, text: e.target.value })}
                      placeholder={
                        editing?.kind === "note"
                          ? "이 할 일에 붙여 둘 메모 (예: 담당자 연락처, 금액)"
                          : "이 일정에 남길 기록 (예: 3장까지 진행, 다음엔 4장부터)"
                      }
                      aria-label={`${t.title} ${editing?.kind === "note" ? "메모" : "기록"}`}
                      className="input w-full text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <button type="submit" disabled={pending} className="btn-primary text-sm">
                        {editing?.kind === "note" ? "메모 저장" : "기록 저장"}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="text-sm text-muted hover:underline">
                        {editing?.kind === "note" || t.record ? "취소" : "나중에"}
                      </button>
                      {editing?.kind !== "note" && <span className="ml-auto text-xs text-muted">일정의 &apos;기록&apos; 칸에 저장돼요</span>}
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {baby.length > 0 && (
        <div className="space-y-1 border-t border-line pt-3">
          <h3 className="flex items-center text-sm font-semibold">
            👶 {babyName} 할 일
            <Link href="/baby/todos" prefetch={false} className="ml-auto text-xs font-normal text-muted hover:underline">
              고치기·추가 →
            </Link>
          </h3>
          <ul className="divide-y divide-line">
            {baby.map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!t.done_at}
                    onChange={() => toggleBaby(t)}
                    aria-label={`${t.title} ${t.done_at ? "안 한 것으로" : "완료"}`}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-success)]"
                  />
                  <span className={`min-w-0 flex-1 break-words text-sm ${t.done_at ? "text-muted line-through" : ""}`}>
                    {t.title}
                    {t.due_date !== today && (
                      <span className={`ml-2 text-xs ${t.due_date < today && !t.done_at ? "text-warn" : "text-muted"}`}>
                        {t.due_date < today ? "밀림 · " : ""}
                        {dateLabel(t.due_date)}
                      </span>
                    )}
                  </span>
                  <span className="badge shrink-0 bg-peach/40 text-xs">부부 공용</span>
                </div>
                {t.note && <p className="mt-1 ml-8 whitespace-pre-wrap break-words rounded-lg border border-line px-3 py-2 text-xs">{t.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shared.length > 0 && (
        <div className="space-y-1 border-t border-line pt-3">
          <h3 className="text-sm font-semibold">공유받은 할 일</h3>
          <ul className="divide-y divide-line">
            {shared.map((t) => (
              <li key={t.id} className="py-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={!!t.done_at}
                    onChange={() => toggleShared(t)}
                    aria-label={`${t.title} ${t.done_at ? "안 한 것으로" : "완료"}`}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-success)]"
                  />
                  <span className={`min-w-0 flex-1 break-words text-sm ${t.done_at ? "text-muted line-through" : ""}`}>
                    {t.title}
                    {t.due_date !== today && (
                      <span className={`ml-2 text-xs ${t.due_date < today && !t.done_at ? "text-warn" : "text-muted"}`}>
                        {t.due_date < today ? "밀림 · " : ""}
                        {dateLabel(t.due_date)}
                      </span>
                    )}
                  </span>
                  <span className="badge shrink-0 bg-lavender/40 text-xs">{t.who}</span>
                </div>
                {t.note && <p className="mt-1 ml-8 whitespace-pre-wrap break-words rounded-lg border border-line px-3 py-2 text-xs">{t.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
