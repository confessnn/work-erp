"use client";

import { useActionState, useTransition } from "react";
import { disconnectGoogle, pushNow, setShowAmounts, type PushState } from "../actions";

type Conn = {
  google_email: string | null;
  show_amounts: boolean;
  last_push_at: string | null;
  last_push_result: string | null;
};

export function GooglePanel({ conn }: { conn: Conn }) {
  const [state, pushAction, pushing] = useActionState<PushState>(pushNow, {});
  const [busy, start] = useTransition();

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="badge badge-paid mr-2">연결됨</span>
        {conn.google_email ?? "구글 계정"} · 캘린더 <b>강의 일정(ERP)</b>
      </p>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={conn.show_amounts}
          disabled={busy}
          onChange={(e) => start(() => setShowAmounts(e.target.checked))}
        />
        <span>
          구글 일정 메모에 강의료·예상 수령액·수령 여부 표시
          <span className="block text-muted">
            이 캘린더를 다른 사람과 공유한다면 끄세요. (아내분께는 &apos;공유&apos; 메뉴의 링크를 쓰면 금액이 안 보입니다)
          </span>
        </span>
      </label>

      <form action={pushAction} className="flex flex-wrap items-center gap-3 text-sm">
        <button type="submit" disabled={pushing} className="chip">
          {pushing ? "반영 중…" : "지금 전체 다시 반영"}
        </button>
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.message && <span className="text-success">{state.message}</span>}
        {!state.error && !state.message && conn.last_push_result && (
          <span className="text-muted">
            최근: {conn.last_push_result}
            {conn.last_push_at &&
              ` (${new Date(conn.last_push_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})`}
          </span>
        )}
      </form>

      <form
        action={disconnectGoogle}
        onSubmit={(e) => {
          if (!confirm("구글 캘린더 연결을 해제할까요? 이미 만들어진 구글 일정은 그대로 남습니다.")) e.preventDefault();
        }}
        className="border-t border-line pt-3"
      >
        <button type="submit" className="text-sm text-danger hover:underline">연결 해제</button>
      </form>
    </div>
  );
}
