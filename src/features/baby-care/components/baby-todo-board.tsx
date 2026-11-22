"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dateLabel } from "@/lib/format";
import { groupBabyTodos, type BabyTodo } from "../baby-todos";
import { addBabyTodo, deleteBabyTodo, setBabyTodoDone, updateBabyTodo, type BabyTodoInput } from "../todo-actions";

/**
 * 아기 할 일: 가족(나·아내) 공용. 여기서 만든 할 일은 두 사람의 '할 일'에 같이 보이고,
 * 누가 고치거나 완료해도 둘 다 같이 바뀐다.
 */
export function BabyTodoBoard({ initial, today, me, name }: { initial: BabyTodo[]; today: string; me: string; name: string }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<BabyTodoInput>({ title: "", due_date: today, note: "" });
  const g = groupBabyTodos(rows, today);

  const run = (fn: () => Promise<{ ok: boolean; message?: string; todo?: BabyTodo }>, after?: (t?: BabyTodo) => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.message ?? "저장하지 못했어요.");
      after?.(r.todo);
      router.refresh();
    });

  const toggle = (t: BabyTodo) => {
    const done = !t.done_at;
    setRows((xs) => xs.map((x) => (x.id === t.id ? { ...x, done_at: done ? new Date().toISOString() : null, done_by: done ? me : null } : x)));
    run(() => setBabyTodoDone(t.id, done));
  };

  const section = (title: string, list: BabyTodo[], tone?: string) =>
    list.length > 0 && (
      <section className="space-y-1">
        <h2 className={`text-sm font-semibold ${tone ?? ""}`}>
          {title} {list.length}
        </h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="p-3">
                <TodoForm
                  initial={{ title: t.title, due_date: t.due_date, note: t.note ?? "" }}
                  pending={pending}
                  submitLabel="저장"
                  onSubmit={(v) => run(() => updateBabyTodo(t.id, v), (todo) => (setEditing(null), todo && setRows((xs) => xs.map((x) => (x.id === t.id ? todo : x)))))}
                  onCancel={() => setEditing(null)}
                  onDelete={() => {
                    if (confirm("이 할 일을 지울까요? 가족 모두에게서 지워져요.")) run(() => deleteBabyTodo(t.id), () => setRows((xs) => xs.filter((x) => x.id !== t.id)));
                  }}
                />
              </li>
            ) : (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={!!t.done_at}
                  onChange={() => toggle(t)}
                  aria-label={`${t.title} ${t.done_at ? "안 한 것으로" : "완료"}`}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-success)]"
                />
                <button type="button" onClick={() => setEditing(t.id)} className="min-w-0 flex-1 text-left">
                  <span className={`block break-words text-sm ${t.done_at ? "text-muted line-through" : ""}`}>{t.title}</span>
                  <span className="block text-xs text-muted">
                    {t.due_date === today ? "오늘" : dateLabel(t.due_date)}
                    {t.done_at && ` · ${t.done_by === me ? "내가" : "가족이"} 완료`}
                  </span>
                  {t.note && <span className="mt-1 block whitespace-pre-wrap break-words text-xs text-muted">{t.note}</span>}
                </button>
              </li>
            ),
          )}
        </ul>
      </section>
    );

  return (
    <div className="space-y-5">
      <section className="card space-y-2">
        <h2 className="section-title">{name} 할 일 추가</h2>
        <TodoForm
          key={rows.length}
          initial={draft}
          pending={pending}
          submitLabel="추가"
          onChange={setDraft}
          onSubmit={(v) =>
            run(
              () => addBabyTodo(v),
              (todo) => {
                if (todo) setRows((xs) => [...xs, todo]);
                setDraft({ title: "", due_date: v.due_date, note: "" });
              },
            )
          }
        />
        <p className="text-xs text-muted">여기 적은 할 일은 부부 두 사람의 &apos;할 일&apos;에 같이 보여요. 한 사람이 고치거나 완료하면 둘 다 같이 바뀌어요.</p>
      </section>
      {error && <p className="text-sm text-danger">{error}</p>}
      {section("밀린 할 일", g.late, "text-warn")}
      {section("오늘", g.today)}
      {section("앞으로", g.later)}
      {section("끝낸 일 (최근 14일)", g.done, "text-muted")}
      {rows.length === 0 && <p className="card text-center text-sm text-muted">아직 할 일이 없어요. 예방접종, 검진 예약, 분유 주문 같은 일을 적어 두세요.</p>}
    </div>
  );
}

function TodoForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onChange,
  onCancel,
  onDelete,
}: {
  initial: BabyTodoInput;
  pending: boolean;
  submitLabel: string;
  onSubmit: (v: BabyTodoInput) => void;
  onChange?: (v: BabyTodoInput) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const [v, setV] = useState(initial);
  const set = (p: Partial<BabyTodoInput>) =>
    setV((x) => {
      const next = { ...x, ...p };
      onChange?.(next);
      return next;
    });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input value={v.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} placeholder="예: 2개월 예방접종 예약" className="input min-w-0 flex-1" required />
        <input type="date" value={v.due_date} onChange={(e) => set({ due_date: e.target.value })} className="input w-40" required />
      </div>
      <textarea rows={2} maxLength={1000} value={v.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="메모 (선택)" className="input w-full" />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "저장 중…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="chip">
            취소
          </button>
        )}
        {onDelete && (
          <button type="button" disabled={pending} onClick={onDelete} className="ml-auto text-sm text-danger hover:underline">
            삭제
          </button>
        )}
      </div>
    </form>
  );
}
