"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { dateLabel } from "@/lib/format";
import { addTodo, deleteTodo, postponeTodo, saveScheduleRecord, saveTodoNote, setTodoDone } from "../actions";
import { NOTE_MAX, progress, RECORD_MAX, recordTarget, sourceLabel, type Todo } from "../todos";

/**
 * 대시보드 '오늘 할 일' 위젯: 적고, 체크하고, 내일로 미루고, 지운다. 누르면 바로 바뀌고 서버에는 뒤에서 저장한다.
 * 오늘 일정과 일정 메모의 줄도 할 일로 들어온다 (출처가 작게 붙는다).
 * 일정 자체 할 일은 끝났다고 체크하면 기록 칸이 열리고, 기록은 그 일정에 저장된다.
 * 다른 할 일에는 메모(담당자 연락처, 금액 등)를 붙일 수 있다.
 */
export function TodoWidget({ initial, today }: { initial: Todo[]; today: string }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 기록(일정 할 일)이나 메모(다른 할 일)를 쓰고 있는 할 일 id와 쓰던 내용 */
  const [editing, setEditing] = useState<{ id: string; kind: "record" | "note"; text: string } | null>(null);
  const [pending, start] = useTransition();
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
      const r = await addTodo(title);
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
  const postpone = (t: Todo) => run(items.filter((x) => x.id !== t.id), () => postponeTodo(t.id));

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">오늘 할 일</h2>
        <span className="text-sm tabular-nums text-muted">
          {total ? `${done}/${total} 완료` : dateLabel(today)}
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
          placeholder="할 일 적기 (예: 견적서 보내기)"
          aria-label="새 할 일"
          className="input flex-1"
        />
        <button type="submit" disabled={pending || !text.trim()} className="btn-primary shrink-0">
          추가
        </button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}

      {total === 0 ? (
        <p className="text-sm text-muted">오늘 할 일이 없어요. 위에 적거나, 일정 메모에 적으면 여기에 들어와요.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((t) => {
            const late = t.due_date < today;
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
                  {!t.done_at && (
                    <button type="button" onClick={() => postpone(t)} className="shrink-0 text-xs text-muted hover:underline">
                      내일로
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
    </section>
  );
}
