"use client";

import { useActionState } from "react";
import { acceptBidViewerInvite } from "../actions";

export function AcceptBidViewerForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(() => acceptBidViewerInvite(token), {});
  return (
    <form action={action} className="card space-y-3">
      <p className="text-sm">
        지금 로그인한 계정으로 참여해요. 참여하면 이 계정에서는 <b>나라장터 한일ENG 공고</b>만 볼 수 있어요.
      </p>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "참여하는 중…" : "공고 공유 참여하기"}
      </button>
    </form>
  );
}
