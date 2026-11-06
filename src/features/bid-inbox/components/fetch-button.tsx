"use client";

import { useState, useTransition } from "react";
import { fetchBidsNow } from "../actions";

export function FetchButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message: string; failed?: boolean } | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {result && <span className={`text-sm ${result.failed ? "text-red-600" : "text-muted"}`}>{result.message}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await fetchBidsNow()))}
        className={`btn-primary ${pending ? "opacity-50" : ""}`}
      >
        {pending ? "수신 중…" : "지금 수신"}
      </button>
    </div>
  );
}
