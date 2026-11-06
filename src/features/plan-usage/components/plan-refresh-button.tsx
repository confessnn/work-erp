"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { requestPlanRefresh } from "../actions";

const POLL_MS = 15_000;
const POLL_TIMES = 6;

/** 갱신을 요청하고, PC가 값을 보낼 동안 화면을 몇 번 다시 읽는다 */
export function PlanRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    let count = 0;
    const timer = setInterval(() => {
      router.refresh();
      count += 1;
      if (count >= POLL_TIMES) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, router]);

  const busy = pending || waiting;
  return (
    <button
      type="button"
      disabled={busy}
      title="PC가 켜져 있으면 1분 안에 Codex 값을 다시 받습니다. Claude 값은 Claude Code를 쓸 때 갱신됩니다."
      onClick={() =>
        start(async () => {
          await requestPlanRefresh();
          setWaiting(true);
        })
      }
      className={`chip text-sm ${busy ? "opacity-50" : ""}`}
    >
      {busy ? "갱신 중…" : "지금 갱신"}
    </button>
  );
}
