"use client";

import { useTransition } from "react";
import { setPaid } from "../actions";

export function PaidToggle({ id, paid }: { id: string; paid: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setPaid(id, !paid))}
      className={`badge ${paid ? "badge-paid" : "badge-unpaid"} ${pending ? "opacity-50" : ""}`}
      title={paid ? "누르면 미수령으로 되돌립니다" : "누르면 수령 처리합니다"}
    >
      {paid ? "✓ 수령" : "미수령"}
    </button>
  );
}
