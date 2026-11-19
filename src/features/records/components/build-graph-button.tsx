"use client";

import { useState, useTransition } from "react";
import { buildGraphAction } from "../actions";

/** AI가 기록을 다시 읽고 관계를 찾는다 (누를 때만 API를 부른다) */
export function BuildGraphButton({ label }: { label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await buildGraphAction();
            if (!r.ok) setError(r.message);
          })
        }
        className="btn-primary text-sm"
      >
        {pending ? "기록을 읽는 중… (1~2분)" : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
