"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveMemoAction } from "../actions";
import { MEMO_MAX } from "../memo";

/** 빠른 메모: 적고 저장하면 볼트 Inbox 에 노트로 들어간다. Ctrl(⌘)+Enter 로도 저장 */
export function QuickMemo() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string; noteId?: string | null } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveMemoAction(text, title);
      if (r.ok) {
        setText("");
        setTitle("");
        setMsg({ ok: true, text: r.message, noteId: r.noteId });
      } else setMsg({ ok: false, text: r.message });
    });

  return (
    <section className="card space-y-3">
      <h2 className="section-title">빠른 메모</h2>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder="제목 (비우면 첫 줄이 제목)"
          aria-label="메모 제목"
          className="input"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim() && !pending) {
              e.preventDefault();
              save();
            }
          }}
          maxLength={MEMO_MAX}
          rows={4}
          placeholder={"떠오른 생각, 아이디어, 참고할 내용을 적어 두세요.\n[[노트 이름]]으로 다른 노트와 잇고 #태그도 붙일 수 있어요."}
          aria-label="메모 내용"
          className="input min-h-28 resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending || !text.trim()} className="btn-primary text-sm">
            {pending ? "저장하는 중…" : "Inbox에 저장"}
          </button>
          <span className="text-xs text-muted">Ctrl+Enter로도 저장 · 볼트의 Inbox 폴더에 노트로 들어가요</span>
        </div>
      </form>
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
          {msg.noteId && (
            <>
              {" "}
              <Link href={`/brain/note/${msg.noteId}`} className="underline">
                메모 보기
              </Link>
            </>
          )}
        </p>
      )}
    </section>
  );
}
