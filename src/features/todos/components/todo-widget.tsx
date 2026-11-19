"use client";

import { useState, useTransition, type FormEvent } from "react";
import { dateLabel } from "@/lib/format";
import { addTodo, deleteTodo, postponeTodo, setTodoDone } from "../actions";
import { progress, sourceLabel, type Todo } from "../todos";

/**
 * 대시보드 '오늘 할 일' 위젯: 적고, 체크하고, 내일로 미루고, 지운다. 누르면 바로 바뀌고 서버에는 뒤에서 저장한다.
 * 오늘 일정과 일정 메모의 줄도 할 일로 들어온다 (출처가 작게 붙는다).
 */
export function TodoWidget({ initial, today }: { initial: Todo[]; today: string }) {
  const [items, setItems] = useState(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  const toggle = (t: Todo) =>
    run(
      items.map((x) => (x.id === t.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x)),
      () => setTodoDone(t.id, !t.done_at),
    );
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
            return (
              <li key={t.id} className="group flex items-center gap-3 py-2">
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
                  {late && !t.done_at && <span className="ml-2 text-xs text-warn">밀림 · {dateLabel(t.due_date)}</span>}
                </span>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
