"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteMemoAction, updateMemoAction } from "../actions";
import { MEMO_MAX } from "../memo";

/** ERP에서 만든 메모의 고치기·지우기. 고치는 동안은 본문 대신 입력칸을 보여 준다 */
export function MemoTools({ noteId, body, children }: { noteId: string; body: string; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const r = await updateMemoAction(noteId, text);
      if (!r.ok) return setError(r.message);
      setEditing(false);
      router.refresh();
    });

  const remove = () => {
    if (!confirm("이 메모를 지울까요? 드라이브 휴지통으로 옮겨서 30일 안에는 되살릴 수 있어요.")) return;
    start(async () => {
      setError(null);
      const r = await deleteMemoAction(noteId);
      if (!r.ok) return setError(r.message);
      router.push("/brain");
    });
  };

  return (
    <article className="card space-y-3">
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !pending) {
                e.preventDefault();
                save();
              }
            }}
            maxLength={MEMO_MAX}
            rows={Math.min(20, Math.max(6, text.split("\n").length + 1))}
            aria-label="메모 내용"
            className="input resize-y"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending || !text.trim()} className="btn-primary text-sm">
              {pending ? "저장하는 중…" : "저장"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setText(body);
                setEditing(false);
                setError(null);
              }}
              className="btn-line text-sm"
            >
              취소
            </button>
            <span className="text-xs text-muted">파일 이름(노트 제목)은 그대로예요 · Ctrl+Enter로 저장</span>
          </div>
        </form>
      ) : (
        <>
          {children}
          <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3 text-sm">
            <button type="button" disabled={pending} onClick={() => setEditing(true)} className="text-accent hover:underline">
              고치기
            </button>
            <button type="button" disabled={pending} onClick={remove} className="text-danger hover:underline disabled:opacity-50">
              {pending ? "지우는 중…" : "지우기"}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </article>
  );
}
