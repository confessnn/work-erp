"use client";

import { useState, useTransition } from "react";
import { refreshTaxInvoice } from "../actions";

export function RefreshButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await refreshTaxInvoice(id);
            setError(r.error ?? null);
          })
        }
        className="chip text-sm"
      >
        {pending ? "확인 중…" : "결과 확인"}
      </button>
      {error && <span className="text-xs text-warn">{error}</span>}
    </span>
  );
}
