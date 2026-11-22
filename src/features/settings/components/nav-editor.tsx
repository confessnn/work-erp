"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { NavItem } from "@/components/nav-items";
import { saveNavPrefs } from "../actions";

type Row = NavItem & { hidden: boolean };

/** 상단 메뉴 순서(▲▼)·숨김 편집. 저장하면 모든 화면의 메뉴가 바뀐다 */
export function NavEditor({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = JSON.stringify(rows) !== JSON.stringify(initial);

  const move = (i: number, d: -1 | 1) =>
    setRows((r) => {
      const j = i + d;
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const toggle = (i: number) => setRows((r) => r.map((x, k) => (k === i ? { ...x, hidden: !x.hidden } : x)));
  const visible = rows.filter((r) => !r.hidden).length;

  const save = (prefs: { href: string; hidden: boolean }[] | null, done: string) =>
    start(async () => {
      const r = await saveNavPrefs(prefs);
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setMsg({ ok: true, text: done });
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <ol className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((r, i) => (
          <li key={r.href} className={`flex items-center gap-3 px-4 py-3 ${r.hidden ? "opacity-50" : ""}`}>
            <span className="w-6 text-sm tabular-nums text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 font-medium">
              {r.label}
              <span className="ml-2 text-xs font-normal text-muted">{r.href}</span>
            </span>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={!r.hidden}
                disabled={!r.hidden && visible <= 1}
                onChange={() => toggle(i)}
                className="h-4 w-4"
              />
              보이기
            </label>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${r.label} 위로`} className="btn-ghost h-9 w-9 disabled:opacity-30">
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === rows.length - 1}
                aria-label={`${r.label} 아래로`}
                className="btn-ghost h-9 w-9 disabled:opacity-30"
              >
                ▼
              </button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !changed}
          onClick={() => save(rows.map(({ href, hidden }) => ({ href, hidden })), "저장했어요. 위 메뉴가 바뀌었어요.")}
          className="btn-primary"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (confirm("메뉴 순서와 숨김을 기본으로 되돌릴까요?")) save(null, "기본 순서로 되돌렸어요.");
          }}
          className="chip"
        >
          기본값으로
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
      </div>
      <p className="text-xs text-muted">숨긴 메뉴도 주소로 들어가면 그대로 쓸 수 있어요. 새 기능이 생기면 메뉴 맨 뒤에 붙어요.</p>
    </div>
  );
}
